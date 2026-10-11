import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db/pool.js';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'dollareus_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const OAUTH_STATE_TTL_MS = 1000 * 60 * 10;

export interface AuthIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}
export interface ApiCredentialIdentity { id: string; organizationId: string; scopes: string[]; }

declare module 'fastify' {
  interface FastifyRequest { identity: AuthIdentity | null; apiCredential: ApiCredentialIdentity | null; }
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
const normalizeEmail = (value: string) => value.trim().toLowerCase();

function cookieValue(request: FastifyRequest, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

function setSessionCookie(reply: FastifyReply, token: string, maxAgeSeconds: number): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
  const existing = reply.getHeader('Set-Cookie');
  if (Array.isArray(existing)) reply.header('Set-Cookie', [...existing.map(String), cookie]);
  else if (typeof existing === 'string') reply.header('Set-Cookie', [existing, cookie]);
  else reply.header('Set-Cookie', cookie);
}

async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const cleanupBefore = new Date();
  await pool.query('DELETE FROM auth_sessions WHERE expires_at <= $1', [cleanupBefore]);
  await pool.query('DELETE FROM auth_oauth_states WHERE expires_at <= $1', [cleanupBefore]);
  await pool.query('DELETE FROM auth_email_tokens WHERE expires_at <= $1 OR consumed_at IS NOT NULL', [cleanupBefore]);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await pool.query(
    'INSERT INTO auth_sessions (id,user_id,token_hash,created_at,last_seen_at,expires_at) VALUES ($1,$2,$3,$4,$4,$5)',
    [randomUUID(), userId, hash(token), now, expiresAt]
  );
  return { token, expiresAt };
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  request.apiCredential = null;
  const sessionToken = cookieValue(request, SESSION_COOKIE);
  const bearerToken = request.headers.authorization?.match(/^Bearer\\s+(dlr_live_[A-Za-z0-9_-]+)$/i)?.[1] ?? null;
  if (!sessionToken && bearerToken) {
    const now = new Date();
    const credential = await pool.query(
      'SELECT c.id AS credential_id,c.organization_id,c.scopes,u.id,u.email,u.email_verified_at,u.display_name FROM api_credentials c JOIN users u ON u.id=c.created_by JOIN organization_memberships m ON m.organization_id=c.organization_id AND m.user_id=u.id AND m.status=$3 WHERE c.token_hash=$1 AND c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at>$2) AND u.status=$4 LIMIT 1',
      [hash(bearerToken), now, 'active', 'active']
    );
    const row = credential.rows[0];
    if (!row) {
      await reply.code(401).send({ error: { code: 'INVALID_API_CREDENTIAL', message: 'The API credential is invalid, revoked, expired, or no longer authorized.', requestId: request.id } });
      return;
    }
    const scopedPath = request.url.split('?')[0] ?? '';
    const orgMatch = scopedPath.match(/^\\/api\\/v1\\/organizations\\/([^/]+)\\//);
    if (!orgMatch || decodeURIComponent(orgMatch[1]!) !== row.organization_id) {
      await reply.code(403).send({ error: { code: 'API_CREDENTIAL_ORGANIZATION_MISMATCH', message: 'This credential can only access routes under its own organization.', requestId: request.id } });
      return;
    }
    request.identity = { uid: row.id, email: row.email, emailVerified: Boolean(row.email_verified_at), displayName: row.display_name };
    request.apiCredential = { id: row.credential_id, organizationId: row.organization_id, scopes: row.scopes };
    await pool.query('UPDATE api_credentials SET last_used_at=$1,updated_at=$1 WHERE id=$2', [now, row.credential_id]);
    return;
  }
  if (!sessionToken) {
    await reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Sign in or provide a Dollareus API bearer credential.', requestId: request.id } });
    return;
  }
  const result = await pool.query(
    'SELECT u.id,u.email,u.email_verified_at,u.display_name,s.id AS session_id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.status=$3 LIMIT 1',
    [hash(sessionToken), new Date(), 'active']
  );
  const row = result.rows[0];
  if (!row) {
    setSessionCookie(reply, '', 0);
    await reply.code(401).send({ error: { code: 'INVALID_SESSION', message: 'Your session is invalid or has expired.', requestId: request.id } });
    return;
  }
  request.identity = { uid: row.id, email: row.email, emailVerified: Boolean(row.email_verified_at), displayName: row.display_name };
  await pool.query('UPDATE auth_sessions SET last_seen_at=$1 WHERE id=$2', [new Date(), row.session_id]);
}

async function sendAuthEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.AUTH_EMAIL_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) throw new Error('AUTH_EMAIL_API_KEY and AUTH_EMAIL_FROM are required for email authentication flows.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html })
  });
  if (!response.ok) {
    const body = await response.text();
    console.error('[auth-email] Provider rejected message:', response.status, body.slice(0, 500));
    throw new Error('Authentication email could not be delivered.');
  }
}

function authPublicUrl(path: string, token: string): string {
  const base = process.env.AUTH_PUBLIC_URL;
  if (!base) throw new Error('AUTH_PUBLIC_URL is required for email authentication flows.');
  const url = new URL(path, base);
  url.searchParams.set('token', token);
  return url.toString();
}

async function issueEmailToken(userId: string, purpose: 'verify_email' | 'reset_password', ttlMs: number): Promise<string> {
  const token = randomToken(32);
  const now = new Date();
  await pool.query(
    'INSERT INTO auth_email_tokens (id,user_id,token_hash,purpose,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [randomUUID(), userId, hash(token), purpose, now, new Date(now.getTime() + ttlMs)]
  );
  return token;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/auth/providers', async (request) => ({
    data: {
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL),
      facebook: Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET && process.env.FACEBOOK_CALLBACK_URL),
      emailFlows: Boolean(process.env.AUTH_EMAIL_API_KEY && process.env.AUTH_EMAIL_FROM && process.env.AUTH_PUBLIC_URL)
    },
    requestId: request.id
  }));
  app.decorateRequest('identity', null);

  app.post<{ Body: { email?: unknown; password?: unknown; displayName?: unknown } }>('/api/v1/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const email = typeof request.body?.email === 'string' ? normalizeEmail(request.body.email) : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const displayName = typeof request.body?.displayName === 'string' ? request.body.displayName.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return reply.code(400).send({ error: { code: 'INVALID_EMAIL', message: 'Enter a valid email address.', requestId: request.id } });
    }
    if (password.length < 12 || password.length > 256) {
      return reply.code(400).send({ error: { code: 'WEAK_PASSWORD', message: 'Password must contain between 12 and 256 characters.', requestId: request.id } });
    }
    if (displayName.length > 120) {
      return reply.code(400).send({ error: { code: 'INVALID_DISPLAY_NAME', message: 'Display name must be 120 characters or fewer.', requestId: request.id } });
    }
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64) as Buffer;
    const passwordHash = `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
    const client = await pool.connect();
    const userId = randomUUID();
    const now = new Date();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO users (id,email,display_name,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)', [userId, email, displayName || null, 'active', now]);
      await client.query('INSERT INTO auth_passwords (user_id,password_hash,created_at,updated_at) VALUES ($1,$2,$3,$3)', [userId, passwordHash, now]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        return reply.code(409).send({ error: { code: 'EMAIL_ALREADY_REGISTERED', message: 'An account with this email already exists.', requestId: request.id } });
      }
      throw error;
    } finally { client.release(); }
    let verificationEmailSent = false;
    if (process.env.AUTH_EMAIL_API_KEY && process.env.AUTH_EMAIL_FROM && process.env.AUTH_PUBLIC_URL) {
      let verificationToken = '';
      try {
        verificationToken = await issueEmailToken(userId, 'verify_email', 1000 * 60 * 60 * 24);
        const verificationUrl = authPublicUrl('/?auth=verify-email', verificationToken);
        await sendAuthEmail(email, 'Verify your Dollareus email', `<p>Welcome to Dollareus.</p><p>Confirm the email address used to create your account. This link expires in 24 hours.</p><p><a href="${verificationUrl}">Verify email address</a></p><p>If you did not create this account, you can ignore this message.</p>`);
        verificationEmailSent = true;
      } catch (error) {
        if (verificationToken) await pool.query('DELETE FROM auth_email_tokens WHERE token_hash=$1', [hash(verificationToken)]);
        console.error('[auth-email] Verification delivery failed after account creation:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    const session = await createSession(userId);
    setSessionCookie(reply, session.token, Math.floor(SESSION_TTL_MS / 1000));
    return reply.code(201).send({ data: { id: userId, email, displayName: displayName || null, emailVerified: false, verificationEmailSent }, requestId: request.id });
  });

  app.post<{ Body: { email?: unknown; password?: unknown } }>('/api/v1/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const email = typeof request.body?.email === 'string' ? normalizeEmail(request.body.email) : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const result = await pool.query(
      'SELECT u.id,u.email,u.display_name,u.status,p.password_hash FROM users u JOIN auth_passwords p ON p.user_id=u.id WHERE u.email=$1 LIMIT 1',
      [email]
    );
    const row = result.rows[0];
    let passwordMatches = false;
    if (typeof row?.password_hash === 'string' && password.length <= 256) {
      const [algorithm, saltHex, expectedHex] = row.password_hash.split(':');
      if (algorithm === 'scrypt' && saltHex && expectedHex) {
        const expected = Buffer.from(expectedHex, 'hex');
        const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length) as Buffer;
        passwordMatches = expected.length === actual.length && timingSafeEqual(expected, actual);
      }
    } else if (password.length <= 256) {
      await scrypt(password, Buffer.alloc(16), 64);
    }
    const valid = Boolean(row && row.status === 'active' && passwordMatches);
    if (!valid) return reply.code(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.', requestId: request.id } });
    const session = await createSession(row.id);
    setSessionCookie(reply, session.token, Math.floor(SESSION_TTL_MS / 1000));
    return { data: { id: row.id, email: row.email, displayName: row.display_name }, requestId: request.id };
  });

  app.post<{ Body: { email?: unknown } }>('/api/v1/auth/email/verification/request', { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const email = typeof request.body?.email === 'string' ? normalizeEmail(request.body.email) : '';
    if (!process.env.AUTH_EMAIL_API_KEY || !process.env.AUTH_EMAIL_FROM || !process.env.AUTH_PUBLIC_URL) {
      return reply.code(503).send({ error: { code: 'AUTH_EMAIL_NOT_CONFIGURED', message: 'Email verification is not configured yet.', requestId: request.id } });
    }
    const result = await pool.query('SELECT id,email_verified_at FROM users WHERE email=$1 AND status=$2 LIMIT 1', [email, 'active']);
    const user = result.rows[0];
    if (user && !user.email_verified_at) {
      const token = await issueEmailToken(user.id, 'verify_email', 1000 * 60 * 60 * 24);
      try {
        await sendAuthEmail(email, 'Verify your Dollareus email', `<p>Confirm your Dollareus email address.</p><p><a href="${authPublicUrl('/?auth=verify-email', token)}">Verify email address</a></p><p>This link expires in 24 hours.</p>`);
      } catch (error) {
        await pool.query('DELETE FROM auth_email_tokens WHERE token_hash=$1', [hash(token)]);
        throw error;
      }
    }
    return { data: { message: 'If the account exists and needs verification, an email will be sent.' }, requestId: request.id };
  });

  app.post<{ Body: { token?: unknown } }>('/api/v1/auth/email/verification/confirm', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const token = typeof request.body?.token === 'string' ? request.body.token : '';
    if (token.length < 32 || token.length > 256) return reply.code(400).send({ error: { code: 'INVALID_VERIFICATION_TOKEN', message: 'The verification link is invalid or expired.', requestId: request.id } });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const consumed = await client.query(
        "UPDATE auth_email_tokens SET consumed_at=$1 WHERE token_hash=$2 AND purpose='verify_email' AND consumed_at IS NULL AND expires_at>$1 RETURNING user_id",
        [new Date(), hash(token)]
      );
      if (!consumed.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: { code: 'INVALID_VERIFICATION_TOKEN', message: 'The verification link is invalid or expired.', requestId: request.id } });
      }
      await client.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,$1),updated_at=$1 WHERE id=$2', [new Date(), consumed.rows[0].user_id]);
      await client.query('COMMIT');
      return { data: { emailVerified: true }, requestId: request.id };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  });

  app.post<{ Body: { email?: unknown } }>('/api/v1/auth/password/forgot', { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const email = typeof request.body?.email === 'string' ? normalizeEmail(request.body.email) : '';
    if (!process.env.AUTH_EMAIL_API_KEY || !process.env.AUTH_EMAIL_FROM || !process.env.AUTH_PUBLIC_URL) {
      return reply.code(503).send({ error: { code: 'AUTH_EMAIL_NOT_CONFIGURED', message: 'Password recovery is not configured yet.', requestId: request.id } });
    }
    const result = await pool.query('SELECT id FROM users WHERE email=$1 AND status=$2 LIMIT 1', [email, 'active']);
    const user = result.rows[0];
    if (user) {
      const token = await issueEmailToken(user.id, 'reset_password', 1000 * 60 * 60);
      try {
        await sendAuthEmail(email, 'Reset your Dollareus password', `<p>A password reset was requested for your Dollareus account.</p><p><a href="${authPublicUrl('/?auth=reset-password', token)}">Reset password</a></p><p>This link expires in one hour. If you did not request this, ignore this message.</p>`);
      } catch (error) {
        await pool.query('DELETE FROM auth_email_tokens WHERE token_hash=$1', [hash(token)]);
        throw error;
      }
    }
    return { data: { message: 'If an account exists for that email, password reset instructions will be sent.' }, requestId: request.id };
  });

  app.post<{ Body: { token?: unknown; password?: unknown } }>('/api/v1/auth/password/reset', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const token = typeof request.body?.token === 'string' ? request.body.token : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (password.length < 12 || password.length > 256) return reply.code(400).send({ error: { code: 'WEAK_PASSWORD', message: 'Password must contain between 12 and 256 characters.', requestId: request.id } });
    if (token.length < 32 || token.length > 256) return reply.code(400).send({ error: { code: 'INVALID_RESET_TOKEN', message: 'The reset link is invalid or expired.', requestId: request.id } });
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64) as Buffer;
    const passwordHash = `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const consumed = await client.query(
        "UPDATE auth_email_tokens SET consumed_at=$1 WHERE token_hash=$2 AND purpose='reset_password' AND consumed_at IS NULL AND expires_at>$1 RETURNING user_id",
        [new Date(), hash(token)]
      );
      if (!consumed.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: { code: 'INVALID_RESET_TOKEN', message: 'The reset link is invalid or expired.', requestId: request.id } });
      }
      const userId = consumed.rows[0].user_id;
      await client.query(
        'INSERT INTO auth_passwords (user_id,password_hash,created_at,updated_at) VALUES ($1,$2,$3,$3) ON CONFLICT (user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,updated_at=EXCLUDED.updated_at',
        [userId, passwordHash, new Date()]
      );
      await client.query('DELETE FROM auth_sessions WHERE user_id=$1', [userId]);
      await client.query("UPDATE auth_email_tokens SET consumed_at=$1 WHERE user_id=$2 AND consumed_at IS NULL", [new Date(), userId]);
      await client.query('COMMIT');
      return { data: { passwordReset: true, signInRequired: true }, requestId: request.id };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const token = cookieValue(request, SESSION_COOKIE);
    if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [hash(token)]);
    setSessionCookie(reply, '', 0);
    return { data: { signedOut: true }, requestId: request.id };
  });

  app.get('/api/v1/auth/session', { preHandler: authenticate }, async (request) => ({
    data: {
      id: request.identity!.uid,
      email: request.identity!.email,
      displayName: request.identity!.displayName,
      emailVerified: request.identity!.emailVerified
    },
    requestId: request.id
  }));

  app.get<{ Params: { provider: string } }>('/api/v1/auth/oauth/:provider/start', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const provider = request.params.provider;
    if (provider !== 'google' && provider !== 'facebook') {
      return reply.code(404).send({ error: { code: 'OAUTH_PROVIDER_UNSUPPORTED', message: 'This social sign-in provider is not supported.', requestId: request.id } });
    }
    const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
    const callbackUrl = process.env[`${provider.toUpperCase()}_CALLBACK_URL`];
    if (!clientId || !callbackUrl) {
      return reply.code(503).send({ error: { code: 'OAUTH_NOT_CONFIGURED', message: 'This social sign-in provider has not been configured yet.', requestId: request.id } });
    }
    const state = randomToken(32);
    const verifier = randomToken(48);
    const now = new Date();
    await pool.query(
      'INSERT INTO auth_oauth_states (id,provider,state_hash,code_verifier,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [randomUUID(), provider, hash(state), verifier, now, new Date(now.getTime() + OAUTH_STATE_TTL_MS)]
    );
    const url = new URL(provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://www.facebook.com/v23.0/dialog/oauth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', provider === 'google' ? 'openid email profile' : 'email,public_profile');
    url.searchParams.set('state', state);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    reply.header('Set-Cookie', `dollareus_oauth_state=${encodeURIComponent(state)}; Path=/api/v1/auth/oauth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
    if (provider === 'google') {
      url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('access_type', 'online');
    }
    return reply.redirect(url.toString());
  });

  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>('/api/v1/auth/oauth/:provider/callback', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const provider = request.params.provider;
    if (provider !== 'google' && provider !== 'facebook') return reply.code(404).send({ error: 'Unsupported provider.' });
    if (request.query.error || !request.query.code || !request.query.state) return reply.code(400).send({ error: { code: 'OAUTH_CANCELLED', message: 'Social sign-in was cancelled or could not be completed.', requestId: request.id } });
    const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
    const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
    const callbackUrl = process.env[`${provider.toUpperCase()}_CALLBACK_URL`];
    if (!clientId || !clientSecret || !callbackUrl) return reply.code(503).send({ error: { code: 'OAUTH_NOT_CONFIGURED', message: 'This social sign-in provider has not been configured yet.', requestId: request.id } });
    const stateCookie = cookieValue(request, 'dollareus_oauth_state');
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    reply.header('Set-Cookie', `dollareus_oauth_state=; Path=/api/v1/auth/oauth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    if (!stateCookie || stateCookie !== request.query.state) {
      return reply.code(400).send({ error: { code: 'OAUTH_STATE_INVALID', message: 'The sign-in request could not be verified. Please try again.', requestId: request.id } });
    }
    const stateResult = await pool.query(
      'DELETE FROM auth_oauth_states WHERE provider=$1 AND state_hash=$2 AND expires_at>$3 RETURNING code_verifier',
      [provider, hash(request.query.state), new Date()]
    );
    if (!stateResult.rowCount) return reply.code(400).send({ error: { code: 'OAUTH_STATE_INVALID', message: 'The sign-in request expired or could not be verified. Please try again.', requestId: request.id } });
    const tokenResponse = await fetch(provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://graph.facebook.com/v23.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl,
        code: request.query.code, grant_type: 'authorization_code',
        ...(provider === 'google' ? { code_verifier: stateResult.rows[0].code_verifier } : {})
      })
    });
    if (!tokenResponse.ok) return reply.code(401).send({ error: { code: 'OAUTH_TOKEN_EXCHANGE_FAILED', message: 'The social provider could not complete sign-in.', requestId: request.id } });
    const tokenPayload = await tokenResponse.json() as { access_token?: string; id_token?: string };
    if (!tokenPayload.access_token) return reply.code(401).send({ error: { code: 'OAUTH_TOKEN_MISSING', message: 'The social provider returned no access token.', requestId: request.id } });
    let subject = '';
    let email: string | null = null;
    let displayName: string | null = null;
    let avatarUrl: string | null = null;
    let emailVerified = false;
    if (provider === 'google') {
      const userInfo = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokenPayload.access_token}` } });
      if (!userInfo.ok) return reply.code(401).send({ error: { code: 'OAUTH_PROFILE_FAILED', message: 'Could not read the social account profile.', requestId: request.id } });
      const profile = await userInfo.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
      subject = profile.sub ?? ''; email = profile.email ? normalizeEmail(profile.email) : null;
      emailVerified = profile.email_verified === true; displayName = profile.name ?? null; avatarUrl = profile.picture ?? null;
    } else {
      const profileResponse = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(tokenPayload.access_token!)}`);
      if (!profileResponse.ok) return reply.code(401).send({ error: { code: 'OAUTH_PROFILE_FAILED', message: 'Could not read the social account profile.', requestId: request.id } });
      const profile = await profileResponse.json() as { id?: string; email?: string; name?: string; picture?: { data?: { url?: string } } };
      subject = profile.id ?? ''; email = profile.email ? normalizeEmail(profile.email) : null;
      displayName = profile.name ?? null; avatarUrl = profile.picture?.data?.url ?? null;
    }
    if (!subject) return reply.code(401).send({ error: { code: 'OAUTH_SUBJECT_MISSING', message: 'The social provider returned an invalid profile.', requestId: request.id } });
    const client = await pool.connect();
    let userId = '';
    const now = new Date();
    try {
      await client.query('BEGIN');
      const linked = await client.query('SELECT user_id FROM auth_oauth_accounts WHERE provider=$1 AND provider_subject=$2 FOR UPDATE', [provider, subject]);
      if (linked.rowCount) {
        userId = linked.rows[0].user_id;
        await client.query('UPDATE users SET email=COALESCE($1,email),email_verified_at=CASE WHEN $2 THEN COALESCE(email_verified_at,$3) ELSE email_verified_at END,display_name=COALESCE(display_name,$4),avatar_url=COALESCE(avatar_url,$5),updated_at=$3 WHERE id=$6', [email, emailVerified, now, displayName, avatarUrl, userId]);
      } else {
        let existing = null;
        if (email) {
          const found = await client.query('SELECT id FROM users WHERE email=$1 FOR UPDATE', [email]);
          existing = found.rows[0] ?? null;
          if (existing && !emailVerified) {
            await client.query('ROLLBACK');
            return reply.code(409).send({ error: { code: 'OAUTH_EMAIL_LINK_REQUIRED', message: 'Sign in with your existing account before linking this social provider.', requestId: request.id } });
          }
        }
        userId = existing?.id ?? randomUUID();
        if (existing) {
          await client.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,$1),display_name=COALESCE(display_name,$2),avatar_url=COALESCE(avatar_url,$3),updated_at=$1 WHERE id=$4', [now, displayName, avatarUrl, userId]);
        } else {
          await client.query('INSERT INTO users (id,email,email_verified_at,display_name,avatar_url,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)', [userId, email, emailVerified ? now : null, displayName, avatarUrl, 'active', now]);
        }
        await client.query('INSERT INTO auth_oauth_accounts (id,user_id,provider,provider_subject,provider_email,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)', [randomUUID(), userId, provider, subject, email, now]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
    const session = await createSession(userId);
    setSessionCookie(reply, session.token, Math.floor(SESSION_TTL_MS / 1000));
    const frontendUrl = process.env.AUTH_SUCCESS_REDIRECT_URL;
    if (frontendUrl) return reply.redirect(frontendUrl);
    return reply.send({ data: { signedIn: true }, requestId: request.id });
  });
}
