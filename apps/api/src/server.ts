import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import sharp from 'sharp';
import { z } from 'zod';
import { pool } from './db/pool.js';
import { REQUIRED_SCHEMA_VERSION } from './db/schema-version.js';
import { authenticate, registerAuthRoutes } from './auth.js';

const app = Fastify({ logger: true, trustProxy: process.env.NODE_ENV === 'production', bodyLimit: 1_048_576, genReqId: () => randomUUID() });
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200').split(',').map((origin) => origin.trim()).filter(Boolean);
const IMAGE_UPLOAD_LIMIT = 4096 * 1024;
const PRODUCT_IMAGE_TARGET = 1024 * 1024;
const RESPONSIVE_IMAGE_WIDTHS = new Set([64, 96, 128, 160, 200, 240, 300, 320, 400, 480, 600, 800, 1000, 1200, 1600, 2000, 2400]);
app.addContentTypeParser('image/webp', { parseAs: 'buffer', bodyLimit: IMAGE_UPLOAD_LIMIT }, (_request, payload, done) => done(null, payload));


await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, { origin: allowedOrigins, credentials: true });
app.addHook('onRequest', async (request, reply) => {
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    return reply.code(403).send({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'This request origin is not allowed.', requestId: request.id } });
  }
});
const configuredRateLimit = Number.parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10);
await app.register(rateLimit, { max: Number.isFinite(configuredRateLimit) && configuredRateLimit > 0 ? configuredRateLimit : 120, timeWindow: '1 minute' });
await registerAuthRoutes(app);

app.addHook('onSend', async (request, reply, payload) => {
  const credential = request.apiCredential;
  if (!credential || !request.url.startsWith('/api/v1/')) return payload;
  const routeTemplate = request.routeOptions?.url ?? request.url.split('?')[0] ?? '/unknown';
  await pool.query('INSERT INTO api_usage_events (id,organization_id,credential_id,request_id,method,route_template,status_code,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), credential.organizationId, credential.id, request.id, request.method, routeTemplate.slice(0, 300), reply.statusCode, new Date()]).catch((error) => request.log.error({ err: error, credentialId: credential.id }, 'API usage event could not be recorded'));
  return payload;
});

app.setErrorHandler((error, request, reply) => {
  const normalized = error instanceof Error ? error : new Error('Unknown request error');
  request.log.error({ err: normalized }, 'Request failed');
  const candidate = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
  const statusCode = typeof candidate === 'number' && candidate >= 400 && candidate < 600 ? candidate : 500;
  return reply.code(statusCode).send({ error: { code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR', message: statusCode >= 500 ? 'An unexpected error occurred.' : normalized.message, requestId: request.id } });
});

async function requireMembership(request: FastifyRequest, reply: FastifyReply, organizationId: string): Promise<boolean> {
  if (request.apiCredential) {
    if (request.apiCredential.organizationId !== organizationId) return fail(reply, request, 403, 'API_CREDENTIAL_ORGANIZATION_MISMATCH', 'This API credential cannot access another organization.');
    const requiredScope = ['GET', 'HEAD'].includes(request.method.toUpperCase()) ? 'read' : 'write';
    if (!request.apiCredential.scopes.includes(requiredScope)) return fail(reply, request, 403, 'API_SCOPE_FORBIDDEN', 'This API credential does not have the required scope.');
  }
  if (!request.identity) {
    await reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Authentication is required.', requestId: request.id } });
    return false;
  }
  const result = await pool.query('SELECT status FROM organization_memberships WHERE organization_id = $1 AND user_id = $2', [organizationId, request.identity.uid]);
  if (result.rows[0]?.status !== 'active') {
    await reply.code(403).send({ error: { code: 'ORGANIZATION_ACCESS_DENIED', message: 'You do not have access to this organization.', requestId: request.id } });
    return false;
  }
  return true;
}

async function requireManagerRole(request: FastifyRequest, reply: FastifyReply, organizationId: string): Promise<boolean> {
  if (request.apiCredential) {
    if (request.apiCredential.organizationId !== organizationId) return fail(reply, request, 403, 'API_CREDENTIAL_ORGANIZATION_MISMATCH', 'This API credential cannot access another organization.');
    const requiredScope = ['GET', 'HEAD'].includes(request.method.toUpperCase()) ? 'read' : 'write';
    if (!request.apiCredential.scopes.includes(requiredScope)) return fail(reply, request, 403, 'API_SCOPE_FORBIDDEN', 'This API credential does not have the required scope.');
  }
  if (!request.identity) {
    await reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Authentication is required.', requestId: request.id } });
    return false;
  }
  const result = await pool.query('SELECT role FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status=$3', [organizationId, request.identity.uid, 'active']);
  if (!['owner', 'admin', 'manager'].includes(String(result.rows[0]?.role ?? ''))) {
    await reply.code(403).send({ error: { code: 'ORGANIZATION_ROLE_FORBIDDEN', message: 'Only organization owners, admins, and managers can perform this action.', requestId: request.id } });
    return false;
  }
  return true;
}

async function requireOperatorRole(request: FastifyRequest, reply: FastifyReply, organizationId: string): Promise<boolean> {
  if (request.apiCredential) {
    if (request.apiCredential.organizationId !== organizationId) return fail(reply, request, 403, 'API_CREDENTIAL_ORGANIZATION_MISMATCH', 'This API credential cannot access another organization.');
    const requiredScope = ['GET', 'HEAD'].includes(request.method.toUpperCase()) ? 'read' : 'write';
    if (!request.apiCredential.scopes.includes(requiredScope)) return fail(reply, request, 403, 'API_SCOPE_FORBIDDEN', 'This API credential does not have the required scope.');
  }
  if (!request.identity) {
    await reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Authentication is required.', requestId: request.id } });
    return false;
  }
  const result = await pool.query('SELECT role FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status=$3', [organizationId, request.identity.uid, 'active']);
  if (!['owner', 'admin', 'manager', 'staff'].includes(String(result.rows[0]?.role ?? ''))) {
    await reply.code(403).send({ error: { code: 'ORGANIZATION_OPERATOR_FORBIDDEN', message: 'Your organization role cannot perform this operational action.', requestId: request.id } });
    return false;
  }
  return true;
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()), camelize(item)]));
  }
  return value;
}

function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  if (chunk === 'VP8 ' && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) { const b0=buffer[21]!, b1=buffer[22]!, b2=buffer[23]!, b3=buffer[24]!; return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) }; }
  return null;
}

function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function hmac(key: Buffer | string, value: string): Buffer { return createHmac('sha256', key).update(value).digest(); }
function awsObjectUrl(storageKey: string): URL {
  const endpointValue = process.env.AWS_ENDPOINT_URL_S3; const bucket = process.env.AWS_S3_BUCKET;
  if (!endpointValue || !bucket) throw new Error('S3-compatible media storage is not configured.');
  const endpoint = new URL(endpointValue);
  const encodedKey = storageKey.split('/').map(encodeURIComponent).join('/');
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/' + encodeURIComponent(bucket) + '/' + encodedKey;
  endpoint.search = ''; endpoint.hash = ''; return endpoint;
}
async function s3Request(method: 'GET' | 'PUT' | 'DELETE', storageKey: string, body?: Buffer): Promise<Response> {
  const endpoint = awsObjectUrl(storageKey); const accessKey = process.env.AWS_ACCESS_KEY_ID; const secretKey = process.env.AWS_SECRET_ACCESS_KEY; const region = process.env.AWS_REGION ?? 'us-east-2';
  if (!accessKey || !secretKey) throw new Error('S3-compatible media credentials are not configured.');
  const now = new Date(); const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body ?? Buffer.alloc(0));
  const headers: Record<string, string> = { host: endpoint.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (method === 'PUT') headers['content-type'] = 'image/webp';
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((key) => key + ':' + headers[key].trim() + '\n').join('');
  const canonicalRequest = [method, endpoint.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = dateStamp + '/' + region + '/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const dateKey = hmac('AWS4' + secretKey, dateStamp) as Buffer; const regionKey = hmac(dateKey, region) as Buffer; const serviceKey = hmac(regionKey, 's3') as Buffer; const signingKey = hmac(serviceKey, 'aws4_request') as Buffer;
  const signature = hmac(signingKey, stringToSign).toString('hex');
  headers.authorization = 'AWS4-HMAC-SHA256 Credential=' + accessKey + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  return fetch(endpoint, { method, headers, body: method === 'PUT' && body ? new Uint8Array(body) : undefined });
}

function fail(reply: FastifyReply, request: FastifyRequest, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message, requestId: request.id } });
}

const Slug = z.string().trim().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const OrganizationInput = z.object({ name: z.string().trim().min(1).max(180), slug: Slug }).strict();
const StoreInput = z.object({
  name: z.string().trim().min(1).max(180), description: z.string().max(5000).nullable(), slug: Slug,
  businessType: z.enum(['retail', 'restaurant', 'freelancer', 'services', 'digital', 'general']),
  status: z.enum(['setup', 'active', 'paused', 'archived']), currency: z.string().regex(/^[A-Z]{3}$/),
  locale: z.enum(['en', 'fr', 'ar']), timeZone: z.string().min(1).max(100),
  defaultExperience: z.enum(['commerce', 'menu', 'catalog', 'services']),
  enabledExperiences: z.array(z.enum(['commerce', 'menu', 'catalog', 'services'])).min(1),
  published: z.boolean(), theme: z.record(z.string(), z.unknown())
}).strict().refine((value) => value.enabledExperiences.includes(value.defaultExperience), { path: ['enabledExperiences'], message: 'The default experience must be enabled.' });
const StorefrontPatchInput = z.object({
  published: z.boolean().optional(),
  defaultExperience: z.enum(['commerce', 'menu', 'catalog', 'services']).optional(),
  enabledExperiences: z.array(z.enum(['commerce', 'menu', 'catalog', 'services'])).min(1).optional(),
  seoTitle: z.string().trim().max(180).nullable().optional(),
  seoDescription: z.string().trim().max(320).nullable().optional(),
  theme: z.record(z.string(), z.unknown()).optional()
}).strict().refine(value => Object.keys(value).length > 0, 'At least one storefront field must be supplied.');
const VariantInput = z.object({
  id: z.string().min(1).max(100), sku: z.string().max(100).nullable(), title: z.string().trim().min(1).max(180),
  options: z.record(z.string(), z.string()), amountMinor: z.number().int().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(['draft', 'active', 'archived']), barcode: z.string().max(120).nullable(),
  weightGrams: z.number().int().nonnegative().nullable(), metadata: z.record(z.string(), z.unknown())
}).strict();
const ProductInput = z.object({
  storeId: z.string().min(1).max(100), slug: Slug, name: z.string().trim().min(1).max(180),
  description: z.string().max(10000).nullable(), status: z.enum(['draft', 'active', 'archived']),
  kind: z.enum(['physical', 'digital', 'service', 'food']),
  availabilityStatus: z.enum(['available', 'unavailable', 'limited', 'preorder']).nullable(),
  availabilityNote: z.string().max(500).nullable(), attributes: z.record(z.string(), z.unknown()),
  categoryIds: z.array(z.string().min(1).max(100)), variants: z.array(VariantInput).min(1).max(100)
}).strict();
const ProductPatchInput = z.object({
  slug: Slug.optional(), name: z.string().trim().min(1).max(180).optional(),
  description: z.string().max(10000).nullable().optional(), status: z.enum(['draft', 'active', 'archived']).optional(),
  categoryIds: z.array(z.string().min(1).max(100)).max(100).optional(),
  variant: z.object({
    id: z.string().min(1).max(100), sku: z.string().max(100).nullable(), title: z.string().trim().min(1).max(180),
    amountMinor: z.number().int().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/)
  }).strict().optional()
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'At least one product field must be provided.' });

app.post<{ Params: { organizationId: string; productId: string }; Body: Buffer }>('/api/v1/organizations/:organizationId/products/:productId/media', { preHandler: authenticate, bodyLimit: IMAGE_UPLOAD_LIMIT }, async (request, reply) => {
  const { organizationId, productId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const membership = await pool.query('SELECT role FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status=$3', [organizationId, request.identity!.uid, 'active']);
  if (!['owner', 'admin', 'manager', 'staff'].includes(String(membership.rows[0]?.role ?? ''))) return fail(reply, request, 403, 'MEDIA_WRITE_FORBIDDEN', 'Your organization role cannot upload product media.');
  if (!Buffer.isBuffer(request.body) || request.body.length > IMAGE_UPLOAD_LIMIT) return fail(reply, request, 413, 'MEDIA_SIZE_INVALID', 'Upload an optimized WebP image no larger than 4096 KB.');
  const body = request.body;
  if (body.length < 16 || body.toString('ascii', 0, 4) !== 'RIFF' || body.toString('ascii', 8, 12) !== 'WEBP') return fail(reply, request, 415, 'MEDIA_TYPE_INVALID', 'Only WebP image uploads are accepted.');
  const dimensions = readWebpDimensions(body);
  if (!dimensions || dimensions.width > 2400 || dimensions.height > 2400) return fail(reply, request, 400, 'MEDIA_DIMENSIONS_INVALID', 'Images must be valid WebP files no larger than 2400 by 2400 pixels.');
  const altText = String(request.headers['x-image-alt'] ?? '').trim().slice(0, 500);
  const rawPosition = Number.parseInt(String(request.headers['x-image-position'] ?? '0'), 10); const position = Number.isFinite(rawPosition) ? Math.max(0, Math.min(1000, rawPosition)) : 0;
  const product = await pool.query('SELECT id FROM products WHERE id=$1 AND organization_id=$2', [productId, organizationId]);
  if (!product.rowCount) return fail(reply, request, 404, 'PRODUCT_NOT_FOUND', 'The product does not exist in this organization.');
  if (!process.env.AWS_S3_BUCKET || !process.env.AWS_ENDPOINT_URL_S3 || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return fail(reply, request, 503, 'MEDIA_STORAGE_NOT_CONFIGURED', 'S3-compatible media storage is not configured on the server.');
  const mediaId = randomUUID(); const storageKey = 'organizations/' + organizationId + '/products/' + productId + '/' + mediaId + '.webp';
  const stored = await s3Request('PUT', storageKey, body);
  if (!stored.ok) { const detail = await stored.text().catch(() => ''); request.log.error({ status: stored.status, detail: detail.slice(0, 300) }, 'Neon object storage upload failed'); return fail(reply, request, 502, 'MEDIA_STORAGE_FAILED', 'The image could not be saved to object storage.'); }
  try {
    const metadata = await pool.query('INSERT INTO product_media (id,organization_id,product_id,storage_provider,storage_key,content_type,byte_size,alt_text,width,height,position,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,organization_id,product_id,storage_provider,storage_key,content_type,byte_size,alt_text,width,height,position,created_at', [mediaId, organizationId, productId, 'neon_s3', storageKey, 'image/webp', body.length, altText, dimensions.width, dimensions.height, position, request.identity!.uid, new Date()]);
    return reply.code(201).send({ data: { ...camelize(metadata.rows[0]) as Record<string, unknown>, contentUrl: '/api/v1/organizations/' + encodeURIComponent(organizationId) + '/products/' + encodeURIComponent(productId) + '/media/' + encodeURIComponent(mediaId) + '/content' }, requestId: request.id });
  } catch (error) { await s3Request('DELETE', storageKey).catch(() => undefined); throw error; }
});

app.get<{ Params: { organizationId: string; productId: string; mediaId: string }; Querystring: { width?: string } }>('/api/v1/organizations/:organizationId/products/:productId/media/:mediaId/content', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, productId, mediaId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const result = await pool.query('SELECT storage_key,content_type FROM product_media WHERE id=$1 AND organization_id=$2 AND product_id=$3', [mediaId, organizationId, productId]);
  if (!result.rowCount) return fail(reply, request, 404, 'MEDIA_NOT_FOUND', 'The image does not exist.');
  const requestedWidth = request.query.width === undefined ? null : Number(request.query.width);
  if (requestedWidth !== null && (!Number.isInteger(requestedWidth) || !RESPONSIVE_IMAGE_WIDTHS.has(requestedWidth))) {
    return fail(reply, request, 400, 'MEDIA_WIDTH_INVALID', 'Choose a supported image width (64, 96, 128, 160, 200, 240, 300, 320, 400, 480, 600, 800, 1000, 1200, 1600, 2000 or 2400).');
  }
  const originalKey = String(result.rows[0].storage_key);
  if (requestedWidth === null) {
    const stored = await s3Request('GET', originalKey);
    if (!stored.ok) { request.log.error({ status: stored.status }, 'Neon object storage download failed'); return fail(reply, request, 502, 'MEDIA_STORAGE_FAILED', 'The image could not be loaded from object storage.'); }
    const bytes = Buffer.from(await stored.arrayBuffer());
    reply.header('Content-Type', String(result.rows[0].content_type)); reply.header('Content-Length', String(bytes.length)); reply.header('Cache-Control', 'private, max-age=300'); reply.header('X-Content-Type-Options', 'nosniff');
    return reply.send(bytes);
  }
  const variantKey = originalKey.replace(/\.webp$/i, '-w' + requestedWidth + '.webp');
  let variant = await s3Request('GET', variantKey);
  let variantBytes: Buffer;
  if (variant.ok) {
    variantBytes = Buffer.from(await variant.arrayBuffer());
  } else {
    const original = await s3Request('GET', originalKey);
    if (!original.ok) { request.log.error({ status: original.status }, 'Neon object storage download failed'); return fail(reply, request, 502, 'MEDIA_STORAGE_FAILED', 'The source image could not be loaded for resizing.'); }
    const sourceBytes = Buffer.from(await original.arrayBuffer());
    try {
      variantBytes = await sharp(sourceBytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: requestedWidth, withoutEnlargement: true, fit: 'inside' }).webp({ quality: 76, effort: 4 }).toBuffer();
    } catch (error) {
      request.log.warn({ err: error }, 'Image resize failed');
      return fail(reply, request, 415, 'MEDIA_PROCESSING_FAILED', 'The stored image could not be resized.');
    }
    if (variantBytes.length > IMAGE_UPLOAD_LIMIT) {
      variantBytes = await sharp(variantBytes).webp({ quality: 60, effort: 5 }).toBuffer();
    }
    if (variantBytes.length > IMAGE_UPLOAD_LIMIT) return fail(reply, request, 500, 'MEDIA_VARIANT_TOO_LARGE', 'The generated image variant exceeds the size limit.');
    const saved = await s3Request('PUT', variantKey, variantBytes);
    if (!saved.ok) request.log.warn({ status: saved.status, width: requestedWidth }, 'Could not cache resized image in object storage');
  }
  reply.header('Content-Type', 'image/webp'); reply.header('Content-Length', String(variantBytes.length)); reply.header('Cache-Control', 'private, max-age=86400, stale-while-revalidate=604800'); reply.header('Vary', 'Accept'); reply.header('X-Content-Type-Options', 'nosniff');
  return reply.send(variantBytes);
});

const ApiCredentialInput = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(['read', 'write'])).min(1).max(2).refine((scopes) => new Set(scopes).size === scopes.length, 'Scopes must be unique.'),
  expiresAt: z.string().datetime().optional()
}).strict();

app.get<{ Params: { organizationId: string } }>('/api/v1/organizations/:organizationId/api-credentials', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (request.apiCredential) return fail(reply, request, 403, 'SESSION_REQUIRED', 'Manage API credentials using a signed-in merchant session.');
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const result = await pool.query('SELECT c.id,c.organization_id,c.name,c.token_prefix,c.scopes,c.expires_at,c.last_used_at,c.revoked_at,c.created_at,(SELECT count(*)::int FROM api_usage_events u WHERE u.credential_id=c.id) AS request_count FROM api_credentials c WHERE c.organization_id=$1 ORDER BY c.created_at DESC LIMIT 100', [organizationId]);
  return reply.send({ data: camelize(result.rows), requestId: request.id });
});

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/api-credentials', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (request.apiCredential) return fail(reply, request, 403, 'SESSION_REQUIRED', 'Only a signed-in merchant session can issue API credentials.');
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = ApiCredentialInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'API_CREDENTIAL_INPUT_INVALID', parsed.error.issues[0]?.message ?? 'Invalid API credential settings.');
  const now = new Date();
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && (expiresAt.getTime() <= now.getTime() || expiresAt.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000)) return fail(reply, request, 400, 'API_CREDENTIAL_EXPIRY_INVALID', 'Expiry must be in the future and no more than 366 days away.');
  const token = 'dlr_live_' + randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  const id = randomUUID();
  const nowPrefix = token.slice(0, 16);
  const result = await pool.query('INSERT INTO api_credentials (id,organization_id,created_by,name,token_prefix,token_hash,scopes,expires_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id,organization_id,name,token_prefix,scopes,expires_at,last_used_at,revoked_at,created_at', [id, organizationId, request.identity!.uid, parsed.data.name, nowPrefix, sha256(token), parsed.data.scopes, expiresAt, now]);
  await pool.query('INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,request_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)', [randomUUID(), organizationId, request.identity!.uid, 'api_credential.created', 'api_credential', id, request.id, JSON.stringify({ name: parsed.data.name, scopes: parsed.data.scopes, expiresAt }), now]);
  return reply.code(201).send({ data: { ...camelize(result.rows[0]) as Record<string, unknown>, token, warning: 'Copy this token now. It will not be shown again.' }, requestId: request.id });
});

app.delete<{ Params: { organizationId: string; credentialId: string } }>('/api/v1/organizations/:organizationId/api-credentials/:credentialId', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, credentialId } = request.params;
  if (request.apiCredential) return fail(reply, request, 403, 'SESSION_REQUIRED', 'Only a signed-in merchant session can revoke API credentials.');
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const now = new Date();
  const result = await pool.query('UPDATE api_credentials SET revoked_at=$1,updated_at=$1 WHERE id=$2 AND organization_id=$3 AND revoked_at IS NULL RETURNING id,name,token_prefix,scopes,revoked_at', [now, credentialId, organizationId]);
  if (!result.rowCount) return fail(reply, request, 404, 'API_CREDENTIAL_NOT_FOUND', 'The active API credential was not found in this organization.');
  await pool.query('INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,request_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)', [randomUUID(), organizationId, request.identity!.uid, 'api_credential.revoked', 'api_credential', credentialId, request.id, JSON.stringify({ name: result.rows[0].name }), now]);
  return reply.send({ data: camelize(result.rows[0]), requestId: request.id });
});

app.get('/health', async () => ({ status: 'ok', service: 'dollareus-api' }));
app.get('/api/v1/health', async (request, reply) => {
  try {
    await pool.query('SELECT 1');
    const ledger = await pool.query<{ exists: boolean }>(
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists"
    );
    if (!ledger.rows[0]?.exists) {
      return reply.code(503).send({
        error: {
          code: 'DATABASE_SCHEMA_NOT_INITIALIZED',
          message: 'The database is reachable but Dollareus migrations have not been initialized. Run pnpm db:migrate.',
          requestId: request.id
        },
        requestId: request.id
      });
    }

    const currentMigration = await pool.query<{ name: string | null }>(
      'SELECT name FROM public.schema_migrations ORDER BY name DESC LIMIT 1'
    );
    if (currentMigration.rows[0]?.name !== REQUIRED_SCHEMA_VERSION) {
      return reply.code(503).send({
        error: {
          code: 'DATABASE_SCHEMA_OUTDATED',
          message: `The database schema is not at the version required by this API. Run pnpm db:status, review the target database, then apply pending migrations with pnpm db:migrate. Required version: ${REQUIRED_SCHEMA_VERSION}.`,
          requestId: request.id
        },
        requestId: request.id
      });
    }

    return {
      data: {
        status: 'ok',
        service: 'dollareus-api',
        version: '0.2.0',
        checks: { database: 'ok', schema: 'ok', migrations: 'current' },
        schemaVersion: REQUIRED_SCHEMA_VERSION
      },
      requestId: request.id
    };
  } catch {
    return fail(reply, request, 503, 'DATABASE_UNAVAILABLE', 'The API database readiness check failed.');
  }
});

app.post<{ Body: unknown }>('/api/v1/organizations', { preHandler: authenticate }, async (request, reply) => {
  const parsed = OrganizationInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Organization name and slug are required.');
  const client = await pool.connect();
  const id = randomUUID();
  const now = new Date();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)', [id, parsed.data.name, parsed.data.slug, 'active', now]);
    await client.query('INSERT INTO organization_memberships (organization_id, user_id, role, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)', [id, request.identity!.uid, 'owner', 'active', now]);
    await client.query('COMMIT');
    return reply.code(201).send({ data: { id, ...parsed.data, status: 'active', createdAt: now, updatedAt: now }, requestId: request.id });
  } catch (error) {
    await client.query('ROLLBACK');
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'ORGANIZATION_SLUG_TAKEN', 'An organization with this slug already exists.');
    throw error;
  } finally { client.release(); }
});

app.get('/api/v1/organizations', { preHandler: authenticate }, async (request) => {
  const result = await pool.query('SELECT o.id, o.name, o.slug, o.status, o.created_at, o.updated_at, m.role FROM organizations o JOIN organization_memberships m ON m.organization_id = o.id WHERE m.user_id = $1 AND m.status = $2 ORDER BY o.created_at DESC', [request.identity!.uid, 'active']);
  return { data: camelize(result.rows), requestId: request.id };
});

app.get<{ Params: { organizationId: string }; Querystring: { limit?: string } }>('/api/v1/organizations/:organizationId/products', { preHandler: authenticate }, async (request, reply) => {
  const organizationId = request.params.organizationId;
  if (!await requireMembership(request, reply, organizationId)) return;
  const parsedLimit = Number.parseInt(request.query.limit ?? '50', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 50;
  const result = await pool.query(
    'SELECT p.*, COALESCE((SELECT jsonb_agg(jsonb_build_object(\'id\',v.id,\'sku\',v.sku,\'title\',v.title,\'options\',v.options,\'amountMinor\',v.price_amount_minor,\'currency\',v.currency,\'status\',v.status,\'barcode\',v.barcode,\'weightGrams\',v.weight_grams,\'metadata\',v.metadata) ORDER BY v.created_at) FROM product_variants v WHERE v.product_id=p.id), \'[]\'::jsonb) AS variants, COALESCE((SELECT jsonb_agg(pc.category_id ORDER BY pc.created_at) FROM product_categories pc WHERE pc.product_id=p.id AND pc.organization_id=p.organization_id), \'[]\'::jsonb) AS category_ids, COALESCE((SELECT jsonb_agg(jsonb_build_object(\'id\',m.id,\'altText\',m.alt_text,\'width\',m.width,\'height\',m.height,\'byteSize\',m.byte_size,\'position\',m.position,\'contentUrl\',\'/api/v1/organizations/\' || m.organization_id || \'/products/\' || m.product_id || \'/media/\' || m.id || \'/content\') ORDER BY m.position,m.created_at) FROM product_media m WHERE m.product_id=p.id AND m.organization_id=p.organization_id), \'[]\'::jsonb) AS media FROM products p WHERE p.organization_id=$1 ORDER BY p.updated_at DESC LIMIT $2',
    [organizationId, limit]
  );
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/products', { preHandler: authenticate }, async (request, reply) => {
  const organizationId = request.params.organizationId;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = ProductInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The product payload is invalid.');
  const client = await pool.connect();
  const productId = randomUUID();
  const now = new Date();
  try {
    await client.query('BEGIN');
    const store = await client.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2 FOR SHARE', [parsed.data.storeId, organizationId]);
    if (!store.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist in this organization.'); }
    if (parsed.data.categoryIds.length) {
      const uniqueCategoryIds = [...new Set(parsed.data.categoryIds)];
      if (uniqueCategoryIds.length !== parsed.data.categoryIds.length) { await client.query('ROLLBACK'); return fail(reply, request, 400, 'DUPLICATE_CATEGORY', 'A product category may only be selected once.'); }
      const validCategories = await client.query('SELECT id FROM categories WHERE organization_id=$1 AND store_id=$2 AND id=ANY($3::text[])', [organizationId, parsed.data.storeId, uniqueCategoryIds]);
      if (validCategories.rowCount !== uniqueCategoryIds.length) { await client.query('ROLLBACK'); return fail(reply, request, 400, 'INVALID_CATEGORY', 'Every product category must belong to the selected store.'); }
    }
    await client.query('INSERT INTO products (id,organization_id,store_id,slug,name,description,status,kind,availability_status,availability_note,attributes,created_by,updated_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$12,$13,$13)', [productId, organizationId, parsed.data.storeId, parsed.data.slug, parsed.data.name, parsed.data.description, parsed.data.status, parsed.data.kind, parsed.data.availabilityStatus, parsed.data.availabilityNote, JSON.stringify(parsed.data.attributes), request.identity!.uid, now]);
    for (const variant of parsed.data.variants) {
      await client.query('INSERT INTO product_variants (id,organization_id,product_id,sku,title,options,price_amount_minor,currency,status,barcode,weight_grams,metadata,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb,$13,$13)', [variant.id, organizationId, productId, variant.sku, variant.title, JSON.stringify(variant.options), variant.amountMinor, variant.currency, variant.status, variant.barcode, variant.weightGrams, JSON.stringify(variant.metadata), now]);
    }
    for (const categoryId of parsed.data.categoryIds) {
      await client.query('INSERT INTO product_categories (product_id,category_id,organization_id,store_id,created_at) VALUES ($1,$2,$3,$4,$5)', [productId, categoryId, organizationId, parsed.data.storeId, now]);
    }
    await client.query('COMMIT');
    const result = await pool.query('SELECT p.*, COALESCE((SELECT jsonb_agg(jsonb_build_object(\'id\',v.id,\'sku\',v.sku,\'title\',v.title,\'options\',v.options,\'amountMinor\',v.price_amount_minor,\'currency\',v.currency,\'status\',v.status) ORDER BY v.created_at) FROM product_variants v WHERE v.product_id=p.id), \'[]\'::jsonb) AS variants FROM products p WHERE p.id=$1 AND p.organization_id=$2', [productId, organizationId]);
    return reply.code(201).send({ data: camelize(result.rows[0]), requestId: request.id });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'PRODUCT_CONFLICT', 'The product slug or variant SKU is already in use.');
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') return fail(reply, request, 400, 'INVALID_RELATIONSHIP', 'A category or store reference does not belong to this organization and store.');
    throw error;
  } finally { client.release(); }
});

app.patch<{ Params: { organizationId: string; productId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/products/:productId', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, productId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = ProductPatchInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide at least one valid product field.');
  const client = await pool.connect();
  const now = new Date();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ slug: string; name: string; description: string | null; status: string; store_id: string }>(
      'SELECT slug, name, description, status, store_id FROM products WHERE id=$1 AND organization_id=$2 FOR UPDATE',
      [productId, organizationId]
    );
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return fail(reply, request, 404, 'PRODUCT_NOT_FOUND', 'The product does not exist in this organization.');
    }
    const current = existing.rows[0]!;
    if (parsed.data.categoryIds !== undefined) {
      const uniqueCategoryIds = [...new Set(parsed.data.categoryIds)];
      if (uniqueCategoryIds.length !== parsed.data.categoryIds.length) {
        await client.query('ROLLBACK');
        return fail(reply, request, 400, 'DUPLICATE_CATEGORY', 'A product category may only be selected once.');
      }
      if (uniqueCategoryIds.length) {
        const validCategories = await client.query('SELECT id FROM categories WHERE organization_id=$1 AND store_id=$2 AND id=ANY($3::text[])', [organizationId, current.store_id, uniqueCategoryIds]);
        if (validCategories.rowCount !== uniqueCategoryIds.length) {
          await client.query('ROLLBACK');
          return fail(reply, request, 400, 'INVALID_CATEGORY', 'Every product category must belong to this product’s store.');
        }
      }
    }
    const slug = parsed.data.slug ?? current.slug;
    const name = parsed.data.name ?? current.name;
    const description = parsed.data.description === undefined ? current.description : parsed.data.description;
    const status = parsed.data.status ?? current.status;
    await client.query(
      'UPDATE products SET slug=$1,name=$2,description=$3,status=$4,updated_by=$5,updated_at=$6 WHERE id=$7 AND organization_id=$8',
      [slug, name, description, status, request.identity!.uid, now, productId, organizationId]
    );
    if (parsed.data.categoryIds !== undefined) {
      await client.query('DELETE FROM product_categories WHERE product_id=$1 AND organization_id=$2', [productId, organizationId]);
      for (const categoryId of parsed.data.categoryIds) {
        await client.query('INSERT INTO product_categories (product_id,category_id,organization_id,store_id,created_at) VALUES ($1,$2,$3,$4,$5)', [productId, categoryId, organizationId, current.store_id, now]);
      }
    }
    if (parsed.data.variant) {
      const variant = parsed.data.variant;
      const updatedVariant = await client.query(
        'UPDATE product_variants SET sku=$1,title=$2,price_amount_minor=$3,currency=$4,updated_at=$5 WHERE id=$6 AND product_id=$7 AND organization_id=$8 RETURNING id',
        [variant.sku, variant.title, variant.amountMinor, variant.currency, now, variant.id, productId, organizationId]
      );
      if (!updatedVariant.rowCount) {
        await client.query('ROLLBACK');
        return fail(reply, request, 404, 'VARIANT_NOT_FOUND', 'The selected variant does not belong to this product.');
      }
    }
    await client.query('COMMIT');
    const result = await pool.query(
      "SELECT p.*, COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'title',v.title,'options',v.options,'amountMinor',v.price_amount_minor,'currency',v.currency,'status',v.status) ORDER BY v.created_at) FROM product_variants v WHERE v.product_id=p.id), '[]'::jsonb) AS variants FROM products p WHERE p.id=$1 AND p.organization_id=$2",
      [productId, organizationId]
    );
    return { data: camelize(result.rows[0]), requestId: request.id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'PRODUCT_CONFLICT', 'The product slug or variant SKU is already in use.');
    throw error;
  } finally { client.release(); }
});

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/stores', { preHandler: authenticate }, async (request, reply) => {
  const organizationId = request.params.organizationId;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = StoreInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The store payload is invalid.');
  const id = randomUUID();
  const now = new Date();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO stores (id,organization_id,name,description,slug,business_type,status,default_currency,locale,time_zone,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)', [id, organizationId, parsed.data.name, parsed.data.description, parsed.data.slug, parsed.data.businessType, parsed.data.status, parsed.data.currency, parsed.data.locale, parsed.data.timeZone, now]);
    await client.query('INSERT INTO store_frontends (store_id,organization_id,default_experience,enabled_experiences,published,theme,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)', [id, organizationId, parsed.data.defaultExperience, parsed.data.enabledExperiences, parsed.data.published, JSON.stringify(parsed.data.theme), now]);
    await client.query('COMMIT');
    return reply.code(201).send({ data: { id, organizationId, ...parsed.data, createdAt: now, updatedAt: now }, requestId: request.id });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'STORE_SLUG_TAKEN', 'A store with this slug already exists in this organization.');
    throw error;
  } finally { client.release(); }
});

app.get<{ Params: { organizationId: string } }>('/api/v1/organizations/:organizationId/stores', { preHandler: authenticate }, async (request, reply) => {
  const organizationId = request.params.organizationId;
  if (!await requireMembership(request, reply, organizationId)) return;
  const result = await pool.query('SELECT s.*, f.default_experience, f.enabled_experiences, f.published, f.seo_title, f.seo_description, f.theme FROM stores s LEFT JOIN store_frontends f ON f.store_id=s.id WHERE s.organization_id=$1 ORDER BY s.updated_at DESC LIMIT 100', [organizationId]);
  return { data: camelize(result.rows), requestId: request.id };
});

app.patch<{ Params: { organizationId: string; storeId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/stores/:storeId/storefront', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = StorefrontPatchInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The storefront settings payload is invalid.');
  const current = await pool.query('SELECT s.id,s.status,f.default_experience,f.enabled_experiences,f.published,f.seo_title,f.seo_description,f.theme FROM stores s JOIN store_frontends f ON f.store_id=s.id AND f.organization_id=s.organization_id WHERE s.id=$1 AND s.organization_id=$2', [storeId, organizationId]);
  if (!current.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist in this organization.');
  const row = current.rows[0];
  const defaultExperience = parsed.data.defaultExperience ?? row.default_experience;
  const enabledExperiences = parsed.data.enabledExperiences ?? row.enabled_experiences;
  if (!enabledExperiences.includes(defaultExperience)) return fail(reply, request, 400, 'INVALID_DEFAULT_EXPERIENCE', 'The default experience must be included in enabled experiences.');
  const result = await pool.query(
    'UPDATE store_frontends SET default_experience=$1,enabled_experiences=$2,published=$3,seo_title=$4,seo_description=$5,theme=$6::jsonb,updated_at=$7 WHERE store_id=$8 AND organization_id=$9 RETURNING store_id,organization_id,default_experience,enabled_experiences,published,seo_title,seo_description,theme,updated_at',
    [defaultExperience, enabledExperiences, parsed.data.published ?? row.published, parsed.data.seoTitle === undefined ? row.seo_title : parsed.data.seoTitle, parsed.data.seoDescription === undefined ? row.seo_description : parsed.data.seoDescription, JSON.stringify(parsed.data.theme ?? row.theme ?? {}), new Date(), storeId, organizationId]
  );
  return { data: camelize(result.rows[0]), requestId: request.id };
});

app.get<{ Params: { storeSlug: string } }>('/api/v1/public/stores/:storeSlug', async (request, reply) => {
  const result = await pool.query('SELECT s.id,s.name,s.description,s.slug,s.business_type,s.default_currency,s.locale,s.time_zone,f.default_experience,f.enabled_experiences,f.published,f.seo_title,f.seo_description,f.theme FROM stores s JOIN store_frontends f ON f.store_id=s.id WHERE s.slug=$1 AND s.status=$2 AND f.published=true LIMIT 1', [request.params.storeSlug, 'active']);
  if (!result.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The published store does not exist.');
  return { data: camelize(result.rows[0]), requestId: request.id };
});

app.get<{ Params: { storeSlug: string } }>('/api/v1/public/stores/:storeSlug/catalog', async (request, reply) => {
  const store = await pool.query("SELECT s.id,s.organization_id FROM stores s JOIN store_frontends f ON f.store_id=s.id WHERE s.slug=$1 AND s.status=$2 AND f.published=true AND (('commerce'=ANY(f.enabled_experiences)) OR ('catalog'=ANY(f.enabled_experiences))) LIMIT 1", [request.params.storeSlug, 'active']);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The published store does not exist.');
  const products = await pool.query('SELECT p.*, COALESCE((SELECT jsonb_agg(jsonb_build_object(\'id\',v.id,\'title\',v.title,\'options\',v.options,\'amountMinor\',v.price_amount_minor,\'currency\',v.currency) ORDER BY v.created_at) FROM product_variants v WHERE v.product_id=p.id AND v.status=$3), \'[]\'::jsonb) AS variants FROM products p WHERE p.organization_id=$1 AND p.store_id=$2 AND p.status=$3 ORDER BY p.updated_at DESC', [store.rows[0].organization_id, store.rows[0].id, 'active']);
  return { data: camelize(products.rows), requestId: request.id };
});


const CategoryInput = z.object({
  storeId: z.string().min(1).max(100), name: z.string().trim().min(1).max(120), slug: Slug,
  description: z.string().max(5000).nullable().optional(), position: z.number().int().nonnegative().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional()
}).strict();
const CustomerInput = z.object({
  email: z.string().trim().email().max(254).nullable().optional(), phone: z.string().trim().max(80).nullable().optional(),
  firstName: z.string().trim().max(120).nullable().optional(), lastName: z.string().trim().max(120).nullable().optional(),
  displayName: z.string().trim().max(180).nullable().optional(), notes: z.string().max(5000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict().refine((value) => Boolean(value.email || value.phone || value.displayName || value.firstName || value.lastName), { message: 'Provide at least a name, email or phone number.' });
const InventoryLocationInput = z.object({
  storeId: z.string().min(1).max(100), name: z.string().trim().min(1).max(180)
}).strict();
const InventoryAdjustmentInput = z.object({
  locationId: z.string().min(1).max(100), variantId: z.string().min(1).max(100),
  quantityOnHand: z.number().int().nonnegative().max(2147483647),
  reorderPoint: z.number().int().nonnegative().max(2147483647).nullable().optional()
}).strict();
const OrderInput = z.object({
  storeId: z.string().min(1).max(100), customerId: z.string().min(1).max(100).nullable().optional(),
  customerEmail: z.string().trim().email().max(254).nullable().optional(), notes: z.string().max(5000).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(180).optional(),
  items: z.array(z.object({ variantId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(10000) }).strict()).min(1).max(100)
}).strict().refine((value) => new Set(value.items.map((item) => item.variantId)).size === value.items.length, { message: 'Each variant can appear only once in an order.' });

app.get<{ Params: { organizationId: string; storeId: string } }>('/api/v1/organizations/:organizationId/stores/:storeId/categories', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const store = await pool.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2', [storeId, organizationId]);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist in this organization.');
  const result = await pool.query('SELECT id,organization_id,store_id,name,slug,description,position,status,created_at,updated_at FROM categories WHERE organization_id=$1 AND store_id=$2 ORDER BY position,name LIMIT 200', [organizationId, storeId]);
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/categories', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = CategoryInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The category payload is invalid.');
  const now = new Date();
  const id = randomUUID();
  try {
    const store = await pool.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2', [parsed.data.storeId, organizationId]);
    if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist in this organization.');
    const result = await pool.query(
      'INSERT INTO categories (id,organization_id,store_id,name,slug,description,position,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id,organization_id,store_id,name,slug,description,position,status,created_at,updated_at',
      [id, organizationId, parsed.data.storeId, parsed.data.name, parsed.data.slug, parsed.data.description ?? null, parsed.data.position ?? 0, parsed.data.status ?? 'active', now]
    );
    return reply.code(201).send({ data: camelize(result.rows[0]), requestId: request.id });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'CATEGORY_CONFLICT', 'A category with this slug already exists in the selected store.');
    throw error;
  }
});

app.get<{ Params: { organizationId: string }; Querystring: { limit?: string; search?: string } }>('/api/v1/organizations/:organizationId/customers', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const parsedLimit = Number.parseInt(request.query.limit ?? '50', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 50;
  const search = (request.query.search ?? '').trim().slice(0, 120);
  const result = await pool.query(
    'SELECT id,organization_id,email,phone,first_name,last_name,display_name,notes,metadata,created_at,updated_at FROM customers WHERE organization_id=$1 AND ($2=\'\' OR COALESCE(display_name,\'\') ILIKE $3 OR COALESCE(first_name,\'\') ILIKE $3 OR COALESCE(last_name,\'\') ILIKE $3 OR COALESCE(email,\'\') ILIKE $3 OR COALESCE(phone,\'\') ILIKE $3) ORDER BY created_at DESC LIMIT $4',
    [organizationId, search, `%${search}%`, limit]
  );
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/customers', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireOperatorRole(request, reply, organizationId)) return;
  const parsed = CustomerInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide a valid customer name, email or phone.');
  const now = new Date();
  const id = randomUUID();
  const result = await pool.query(
    'INSERT INTO customers (id,organization_id,email,phone,first_name,last_name,display_name,notes,metadata,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$10) RETURNING id,organization_id,email,phone,first_name,last_name,display_name,notes,metadata,created_at,updated_at',
    [id, organizationId, parsed.data.email?.toLowerCase() ?? null, parsed.data.phone ?? null, parsed.data.firstName ?? null, parsed.data.lastName ?? null, parsed.data.displayName ?? null, parsed.data.notes ?? null, JSON.stringify(parsed.data.metadata ?? {}), now]
  );
  return reply.code(201).send({ data: camelize(result.rows[0]), requestId: request.id });
});

app.get<{ Params: { organizationId: string } }>('/api/v1/organizations/:organizationId/inventory', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const result = await pool.query(
    'SELECT l.id AS location_id,l.store_id,l.name AS location_name,l.status AS location_status,v.id AS variant_id,v.sku,v.title AS variant_title,p.id AS product_id,p.name AS product_name,il.quantity_on_hand,il.quantity_reserved,il.reorder_point,il.updated_at FROM inventory_locations l LEFT JOIN inventory_levels il ON il.location_id=l.id LEFT JOIN product_variants v ON v.id=il.variant_id LEFT JOIN products p ON p.id=v.product_id WHERE l.organization_id=$1 ORDER BY l.created_at,l.name,p.name,v.title LIMIT 500',
    [organizationId]
  );
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/inventory/locations', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireOperatorRole(request, reply, organizationId)) return;
  const parsed = InventoryLocationInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide a valid store and inventory location name.');
  const store = await pool.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2', [parsed.data.storeId, organizationId]);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist in this organization.');
  const now = new Date();
  const id = randomUUID();
  const result = await pool.query('INSERT INTO inventory_locations (id,organization_id,store_id,name,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id,organization_id,store_id,name,status,created_at,updated_at', [id, organizationId, parsed.data.storeId, parsed.data.name, 'active', now]);
  return reply.code(201).send({ data: camelize(result.rows[0]), requestId: request.id });
});

app.put<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/inventory/levels', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireOperatorRole(request, reply, organizationId)) return;
  const parsed = InventoryAdjustmentInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The inventory adjustment payload is invalid.');
  const now = new Date();
  try {
    const location = await pool.query('SELECT id,store_id FROM inventory_locations WHERE id=$1 AND organization_id=$2 AND status=$3', [parsed.data.locationId, organizationId, 'active']);
    if (!location.rowCount) return fail(reply, request, 404, 'INVENTORY_LOCATION_NOT_FOUND', 'The inventory location does not exist or is inactive.');
    const variant = await pool.query('SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1 AND v.organization_id=$2 AND p.organization_id=$2 AND ($3::text IS NULL OR p.store_id=$3)', [parsed.data.variantId, organizationId, location.rows[0].store_id]);
    if (!variant.rowCount) return fail(reply, request, 404, 'VARIANT_NOT_FOUND', 'The product variant does not exist in this organization.');
    const result = await pool.query(
      'INSERT INTO inventory_levels (organization_id,location_id,variant_id,quantity_on_hand,quantity_reserved,reorder_point,updated_at) VALUES ($1,$2,$3,$4,0,$5,$6) ON CONFLICT (location_id,variant_id) DO UPDATE SET quantity_on_hand=EXCLUDED.quantity_on_hand,reorder_point=EXCLUDED.reorder_point,updated_at=EXCLUDED.updated_at RETURNING organization_id,location_id,variant_id,quantity_on_hand,quantity_reserved,reorder_point,updated_at',
      [organizationId, parsed.data.locationId, parsed.data.variantId, parsed.data.quantityOnHand, parsed.data.reorderPoint ?? null, now]
    );
    return { data: camelize(result.rows[0]), requestId: request.id };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23514') return fail(reply, request, 409, 'INVENTORY_BELOW_RESERVED', 'On-hand quantity cannot be lower than the quantity already reserved.');
    throw error;
  }
});

app.get<{ Params: { organizationId: string }; Querystring: { limit?: string; storeId?: string } }>('/api/v1/organizations/:organizationId/orders', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const parsedLimit = Number.parseInt(request.query.limit ?? '50', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 50;
  const storeId = request.query.storeId?.trim() || null;
  if (storeId) {
    const store = await pool.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2', [storeId, organizationId]);
    if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist in this organization.');
  }
  const result = await pool.query(
    "SELECT o.*, COALESCE(o.metadata->>'channel','Mageus') AS channel, CASE WHEN o.payment_status IN ('paid','partially_refunded','refunded','authorized','failed') THEN o.payment_status WHEN COALESCE((SELECT SUM(p.amount_minor) FROM payments p WHERE p.order_id=o.id AND p.organization_id=o.organization_id AND p.status='succeeded'),0)>0 THEN 'partially_paid' ELSE o.payment_status END AS effective_payment_status, COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'variantId',i.variant_id,'sku',i.sku_snapshot,'productName',i.product_name_snapshot,'variantTitle',i.variant_title_snapshot,'options',i.options_snapshot,'quantity',i.quantity,'unitAmountMinor',i.unit_amount_minor,'totalMinor',i.total_minor) ORDER BY i.created_at) FROM order_items i WHERE i.order_id=o.id), '[]'::jsonb) AS items FROM orders o WHERE o.organization_id=$1 AND ($2::text IS NULL OR o.store_id=$2) ORDER BY o.created_at DESC LIMIT $3",
    [organizationId, storeId, limit]
  );
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/orders', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireOperatorRole(request, reply, organizationId)) return;
  const parsed = OrderInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The order payload is invalid.');
  const client = await pool.connect();
  const now = new Date();
  const orderId = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [organizationId]);
    if (parsed.data.idempotencyKey) {
      const existing = await client.query('SELECT id FROM orders WHERE organization_id=$1 AND idempotency_key=$2', [organizationId, parsed.data.idempotencyKey]);
      if (existing.rowCount) {
        await client.query('COMMIT');
        const order = await pool.query("SELECT o.*, COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'variantId',i.variant_id,'productName',i.product_name_snapshot,'variantTitle',i.variant_title_snapshot,'quantity',i.quantity,'unitAmountMinor',i.unit_amount_minor,'totalMinor',i.total_minor) ORDER BY i.created_at) FROM order_items i WHERE i.order_id=o.id), '[]'::jsonb) AS items FROM orders o WHERE o.id=$1 AND o.organization_id=$2", [existing.rows[0].id, organizationId]);
        return { data: camelize(order.rows[0]), requestId: request.id };
      }
    }
    const store = await client.query('SELECT id,default_currency FROM stores WHERE id=$1 AND organization_id=$2 AND status IN ($3,$4) FOR SHARE', [parsed.data.storeId, organizationId, 'active', 'setup']);
    if (!store.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist or is unavailable.'); }
    let customerEmail = parsed.data.customerEmail?.toLowerCase() ?? null;
    if (parsed.data.customerId) {
      const customer = await client.query('SELECT id,email FROM customers WHERE id=$1 AND organization_id=$2', [parsed.data.customerId, organizationId]);
      if (!customer.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'CUSTOMER_NOT_FOUND', 'The selected customer does not exist in this organization.'); }
      customerEmail = customerEmail ?? customer.rows[0].email;
    }
    const variantIds = parsed.data.items.map((item) => item.variantId);
    const variants = await client.query(
      "SELECT v.id AS variant_id,v.product_id,v.sku,v.title AS variant_title,v.options,v.price_amount_minor,v.currency,p.name AS product_name FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=ANY($1::text[]) AND v.organization_id=$2 AND p.organization_id=$2 AND p.store_id=$3 AND p.status='active' AND v.status='active' FOR SHARE OF v,p",
      [variantIds, organizationId, parsed.data.storeId]
    );
    if (variants.rowCount !== variantIds.length) { await client.query('ROLLBACK'); return fail(reply, request, 400, 'INVALID_ORDER_ITEMS', 'Every order item must be an active product variant in the selected store.'); }
    const byId = new Map<string, any>(variants.rows.map((variant: any) => [String(variant.variant_id), variant] as const));
    let subtotal = 0;
    const lineItems = parsed.data.items.map((item) => {
      const variant = byId.get(item.variantId)!;
      const unitAmount = Number(variant.price_amount_minor);
      const lineTotal = unitAmount * item.quantity;
      if (!Number.isSafeInteger(unitAmount) || !Number.isSafeInteger(lineTotal) || lineTotal < 0) throw new Error('The selected price exceeds the supported order amount.');
      subtotal += lineTotal;
      if (!Number.isSafeInteger(subtotal)) throw new Error('The order total exceeds the supported amount.');
      if (variant.currency.trim() !== store.rows[0].default_currency.trim()) throw new Error('All order items must use the store currency.');
      return { ...item, variant, unitAmount, lineTotal };
    });
    const numberResult = await client.query('SELECT COALESCE(MAX(order_number),0)+1 AS order_number FROM orders WHERE organization_id=$1', [organizationId]);
    const orderNumber = Number(numberResult.rows[0].order_number);
    await client.query(
      'INSERT INTO orders (id,organization_id,store_id,customer_id,order_number,status,payment_status,fulfillment_status,currency,subtotal_minor,discount_minor,tax_minor,shipping_minor,total_minor,customer_email,notes,metadata,idempotency_key,placed_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,0,$10,$11,$12,$13::jsonb,$14,$15,$15,$15)',
      [orderId, organizationId, parsed.data.storeId, parsed.data.customerId ?? null, orderNumber, 'pending', 'unpaid', 'unfulfilled', store.rows[0].default_currency.trim(), subtotal, customerEmail, parsed.data.notes ?? null, JSON.stringify({}), parsed.data.idempotencyKey ?? null, now]
    );
    for (const line of lineItems) {
      await client.query(
        'INSERT INTO order_items (id,organization_id,order_id,product_id,variant_id,sku_snapshot,product_name_snapshot,variant_title_snapshot,options_snapshot,quantity,unit_amount_minor,discount_minor,tax_minor,total_minor,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,0,0,$12,$13)',
        [randomUUID(), organizationId, orderId, line.variant.product_id, line.variant.variant_id, line.variant.sku, line.variant.product_name, line.variant.variant_title, JSON.stringify(line.variant.options ?? {}), line.quantity, line.unitAmount, line.lineTotal, now]
      );
    }
    await client.query('COMMIT');
    const result = await pool.query("SELECT o.*, COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'variantId',i.variant_id,'productName',i.product_name_snapshot,'variantTitle',i.variant_title_snapshot,'quantity',i.quantity,'unitAmountMinor',i.unit_amount_minor,'totalMinor',i.total_minor) ORDER BY i.created_at) FROM order_items i WHERE i.order_id=o.id), '[]'::jsonb) AS items FROM orders o WHERE o.id=$1 AND o.organization_id=$2", [orderId, organizationId]);
    return reply.code(201).send({ data: camelize(result.rows[0]), requestId: request.id });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof Error && error.message.includes('supported order amount')) return fail(reply, request, 400, 'ORDER_AMOUNT_TOO_LARGE', error.message);
    if (error instanceof Error && error.message.includes('store currency')) return fail(reply, request, 400, 'ORDER_CURRENCY_MISMATCH', error.message);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'ORDER_CONFLICT', 'The order could not be created due to a duplicate order or idempotency key.');
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') return fail(reply, request, 400, 'INVALID_RELATIONSHIP', 'A customer, store or product reference is invalid for this organization.');
    throw error;
  } finally { client.release(); }
});


const MenuInput = z.object({
  storeId: z.string().min(1).max(100), slug: Slug, name: z.string().trim().min(1).max(180),
  description: z.string().max(5000).nullable().optional(), servicePeriods: z.array(z.string().trim().min(1).max(40)).max(20),
  status: z.enum(['draft', 'active', 'archived']), position: z.number().int().nonnegative().optional()
}).strict();
const MenuModifierOptionInput = z.object({
  id: Slug, name: z.string().trim().min(1).max(100),
  priceDeltaMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
}).strict();
const MenuModifierGroupInput = z.object({
  id: Slug, name: z.string().trim().min(1).max(100),
  required: z.boolean().default(false),
  minSelections: z.number().int().min(0).max(20).default(0),
  maxSelections: z.number().int().min(1).max(20).default(1),
  options: z.array(MenuModifierOptionInput).min(1).max(30)
}).strict().refine((group) => group.minSelections <= group.maxSelections && group.maxSelections <= group.options.length && (!group.required || group.minSelections >= 1), { message: 'Modifier selection limits are inconsistent or exceed the available options.' });

const MenuItemInput = z.object({
  slug: Slug, name: z.string().trim().min(1).max(180), description: z.string().max(5000).nullable().optional(),
  priceAmountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(['draft', 'active', 'archived']), categoryId: z.string().min(1).max(100).nullable().optional(),
  allergens: z.array(z.string().trim().min(1).max(80)).max(50), dietaryLabels: z.array(z.string().trim().min(1).max(80)).max(50),
  availability: z.enum(['available', 'unavailable', 'limited']), position: z.number().int().nonnegative().optional(),
  modifierGroups: z.array(MenuModifierGroupInput).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict().superRefine((item, context) => {
  const groups = item.modifierGroups ?? [];
  if (new Set(groups.map((group) => group.id)).size !== groups.length) context.addIssue({ code: 'custom', message: 'Modifier group IDs must be unique.', path: ['modifierGroups'] });
  for (const group of groups) if (new Set(group.options.map((option) => option.id)).size !== group.options.length) context.addIssue({ code: 'custom', message: 'Modifier option IDs must be unique within a group.', path: ['modifierGroups'] });
});
const EntryPointBranding = z.object({
  brandName: z.string().trim().max(120).nullable().optional(),
  foregroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoUrl: z.string().url().max(2048).refine(value => value.startsWith('https://'), 'Logo URL must use HTTPS.').nullable().optional(),
  frame: z.enum(['none', 'bottom-label', 'top-label']).optional(),
  label: z.string().trim().max(80).nullable().optional()
}).strict();
const EntryPointInput = z.object({
  storeId: z.string().min(1).max(100), type: z.enum(['direct-link', 'qr', 'embed']),
  targetPath: z.enum(['/', '/menu', '/catalog', '/services']),
  branding: EntryPointBranding.optional()
}).strict();
const EntryPointPatch = z.object({
  status: z.enum(['active', 'disabled']).optional(),
  branding: EntryPointBranding.optional()
}).strict().refine(value => value.status !== undefined || value.branding !== undefined, 'At least one field must be supplied.');

app.get<{ Params: { organizationId: string; storeId: string } }>('/api/v1/organizations/:organizationId/stores/:storeId/menus', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const store = await pool.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2', [storeId, organizationId]);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist in this organization.');
  const result = await pool.query('SELECT m.*, (SELECT count(*)::int FROM restaurant_menu_items i WHERE i.menu_id=m.id) AS item_count FROM restaurant_menus m WHERE m.organization_id=$1 AND m.store_id=$2 ORDER BY m.position,m.created_at DESC LIMIT 200', [organizationId, storeId]);
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/menus', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = MenuInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The restaurant menu payload is invalid.');
  const store = await pool.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2', [parsed.data.storeId, organizationId]);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist in this organization.');
  const now = new Date();
  try {
    const result = await pool.query(
      'INSERT INTO restaurant_menus (id,organization_id,store_id,slug,name,description,service_periods,status,position,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *',
      [randomUUID(), organizationId, parsed.data.storeId, parsed.data.slug, parsed.data.name, parsed.data.description ?? null, parsed.data.servicePeriods, parsed.data.status, parsed.data.position ?? 0, now]
    );
    return reply.code(201).send({ data: camelize(result.rows[0]), requestId: request.id });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'MENU_SLUG_TAKEN', 'A menu with this slug already exists in the selected store.');
    throw error;
  }
});

app.get<{ Params: { organizationId: string; menuId: string } }>('/api/v1/organizations/:organizationId/menus/:menuId/items', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, menuId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const menu = await pool.query('SELECT id FROM restaurant_menus WHERE id=$1 AND organization_id=$2', [menuId, organizationId]);
  if (!menu.rowCount) return fail(reply, request, 404, 'MENU_NOT_FOUND', 'The selected menu does not exist in this organization.');
  const result = await pool.query('SELECT * FROM restaurant_menu_items WHERE menu_id=$1 AND organization_id=$2 ORDER BY position,name LIMIT 500', [menuId, organizationId]);
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string; menuId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/menus/:menuId/items', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, menuId } = request.params;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = MenuItemInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The menu item payload is invalid.');
  const menu = await pool.query('SELECT m.id,m.store_id,s.default_currency FROM restaurant_menus m JOIN stores s ON s.id=m.store_id WHERE m.id=$1 AND m.organization_id=$2 AND s.organization_id=$2', [menuId, organizationId]);
  if (!menu.rowCount) return fail(reply, request, 404, 'MENU_NOT_FOUND', 'The selected menu does not exist in this organization.');
  if (parsed.data.currency !== String(menu.rows[0].default_currency).trim()) return fail(reply, request, 400, 'MENU_CURRENCY_MISMATCH', 'Menu items must use the selected store currency.');
  if (parsed.data.categoryId) {
    const category = await pool.query('SELECT id FROM categories WHERE id=$1 AND organization_id=$2 AND store_id=$3', [parsed.data.categoryId, organizationId, menu.rows[0].store_id]);
    if (!category.rowCount) return fail(reply, request, 404, 'CATEGORY_NOT_FOUND', 'The selected category does not exist in this menu’s store.');
  }
  const now = new Date();
  try {
    const result = await pool.query(
      'INSERT INTO restaurant_menu_items (id,organization_id,store_id,menu_id,slug,name,description,price_amount_minor,currency,status,category_id,allergens,dietary_labels,availability,position,metadata,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$17) RETURNING *',
      [randomUUID(), organizationId, menu.rows[0].store_id, menuId, parsed.data.slug, parsed.data.name, parsed.data.description ?? null, parsed.data.priceAmountMinor, parsed.data.currency, parsed.data.status, parsed.data.categoryId ?? null, parsed.data.allergens, parsed.data.dietaryLabels, parsed.data.availability, parsed.data.position ?? 0, JSON.stringify({ ...(parsed.data.metadata ?? {}), modifierGroups: parsed.data.modifierGroups ?? [] }), now]
    );
    return reply.code(201).send({ data: camelize(result.rows[0]), requestId: request.id });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'MENU_ITEM_SLUG_TAKEN', 'A menu item with this slug already exists in the selected menu.');
    throw error;
  }
});

const MenuPatchInput = z.object({
  slug: Slug.optional(),
  name: z.string().trim().min(1).max(180).optional(),
  description: z.string().max(5000).nullable().optional(),
  servicePeriods: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  position: z.number().int().nonnegative().optional()
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be supplied.' });
const MenuStatusInput = z.object({ status: z.enum(['draft', 'active', 'archived']) }).strict();

const MenuReorderInput = z.object({
  menuIds: z.array(z.string().trim().min(1).max(100)).min(1).max(200)
}).strict().refine((value) => new Set(value.menuIds).size === value.menuIds.length, {
  message: 'Menu IDs must be unique.'
});
const MenuItemReorderInput = z.object({
  itemIds: z.array(z.string().trim().min(1).max(100)).min(1).max(500)
}).strict().refine((value) => new Set(value.itemIds).size === value.itemIds.length, {
  message: 'Menu item IDs must be unique.'
});

const MenuItemAvailabilityInput = z.object({
  status: z.enum(['draft', 'active', 'archived']).optional(),
  availability: z.enum(['available', 'unavailable', 'limited']).optional(),
  position: z.number().int().nonnegative().optional(),
  categoryId: z.string().min(1).max(100).nullable().optional(),
  slug: Slug.optional(), name: z.string().trim().min(1).max(180).optional(), description: z.string().max(5000).nullable().optional(),
  priceAmountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  allergens: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  dietaryLabels: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  modifierGroups: z.array(MenuModifierGroupInput).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict().superRefine((value, context) => {
  if (Object.keys(value).length === 0) {
    context.addIssue({ code: 'custom', message: 'At least one field must be provided.' });
  }
  const groups = value.modifierGroups ?? [];
  if (new Set(groups.map((group) => group.id)).size !== groups.length) {
    context.addIssue({ code: 'custom', message: 'Modifier group IDs must be unique.', path: ['modifierGroups'] });
  }
  for (const group of groups) {
    if (new Set(group.options.map((option) => option.id)).size !== group.options.length) {
      context.addIssue({ code: 'custom', message: 'Modifier option IDs must be unique within a group.', path: ['modifierGroups'] });
    }
  }
});

app.patch<{ Params: { organizationId: string; menuId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/menus/:menuId', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, menuId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = MenuPatchInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The restaurant menu update payload is invalid.');
  try {
    const result = await pool.query(
      'UPDATE restaurant_menus SET slug=COALESCE($3,slug),name=COALESCE($4,name),description=CASE WHEN $5 THEN $6 ELSE description END,service_periods=COALESCE($7,service_periods),position=COALESCE($8,position),updated_at=$9 WHERE id=$1 AND organization_id=$2 RETURNING *',
      [menuId, organizationId, parsed.data.slug ?? null, parsed.data.name ?? null, parsed.data.description !== undefined, parsed.data.description ?? null, parsed.data.servicePeriods ?? null, parsed.data.position ?? null, new Date()]
    );
    if (!result.rowCount) return fail(reply, request, 404, 'MENU_NOT_FOUND', 'The selected menu does not exist in this organization.');
    return { data: camelize(result.rows[0]), requestId: request.id };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'MENU_SLUG_TAKEN', 'A menu with this slug already exists in the selected store.');
    throw error;
  }
});

app.patch<{ Params: { organizationId: string; menuId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/menus/:menuId/status', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, menuId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = MenuStatusInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The menu status payload is invalid.');
  const result = await pool.query(
    'UPDATE restaurant_menus SET status=$3,updated_at=$4 WHERE id=$1 AND organization_id=$2 RETURNING id,store_id,slug,name,status,position,updated_at',
    [menuId, organizationId, parsed.data.status, new Date()]
  );
  if (!result.rowCount) return fail(reply, request, 404, 'MENU_NOT_FOUND', 'The selected menu does not exist in this organization.');
  return { data: camelize(result.rows[0]), requestId: request.id };
});

app.patch<{ Params: { organizationId: string; menuId: string; itemId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/menus/:menuId/items/:itemId', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, menuId, itemId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = MenuItemAvailabilityInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The menu item update payload is invalid.');
  const menu = await pool.query('SELECT store_id FROM restaurant_menus WHERE id=$1 AND organization_id=$2', [menuId, organizationId]);
  if (!menu.rowCount) return fail(reply, request, 404, 'MENU_NOT_FOUND', 'The selected menu does not exist in this organization.');
  if (parsed.data.categoryId) {
    const category = await pool.query('SELECT id FROM categories WHERE id=$1 AND organization_id=$2 AND store_id=$3', [parsed.data.categoryId, organizationId, menu.rows[0].store_id]);
    if (!category.rowCount) return fail(reply, request, 404, 'CATEGORY_NOT_FOUND', 'The selected category does not exist in this menu’s store.');
  }
  let result;
  try {
    result = await pool.query(
      `UPDATE restaurant_menu_items SET status=COALESCE($4,status),availability=COALESCE($5,availability),position=COALESCE($6,position),category_id=CASE WHEN $8 THEN $9 ELSE category_id END,allergens=COALESCE($10,allergens),dietary_labels=COALESCE($11,dietary_labels),metadata=CASE WHEN $12::jsonb IS NOT NULL AND $13::jsonb IS NOT NULL THEN jsonb_set($12::jsonb,'{modifierGroups}',$13::jsonb,true) WHEN $12::jsonb IS NOT NULL THEN CASE WHEN $12::jsonb ? 'modifierGroups' THEN $12::jsonb ELSE jsonb_set($12::jsonb,'{modifierGroups}',COALESCE(metadata->'modifierGroups','[]'::jsonb),true) END WHEN $13::jsonb IS NOT NULL THEN jsonb_set(COALESCE(metadata,'{}'::jsonb),'{modifierGroups}',$13::jsonb,true) ELSE metadata END,slug=COALESCE($14,slug),name=COALESCE($15,name),description=CASE WHEN $16 THEN $17 ELSE description END,price_amount_minor=COALESCE($18,price_amount_minor),updated_at=$7 WHERE id=$1 AND menu_id=$2 AND organization_id=$3 RETURNING *`,
      [itemId, menuId, organizationId, parsed.data.status ?? null, parsed.data.availability ?? null, parsed.data.position ?? null, new Date(), parsed.data.categoryId !== undefined, parsed.data.categoryId ?? null, parsed.data.allergens ?? null, parsed.data.dietaryLabels ?? null, parsed.data.metadata === undefined ? null : JSON.stringify(parsed.data.metadata), parsed.data.modifierGroups === undefined ? null : JSON.stringify(parsed.data.modifierGroups), parsed.data.slug ?? null, parsed.data.name ?? null, parsed.data.description !== undefined, parsed.data.description ?? null, parsed.data.priceAmountMinor ?? null]
    );
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return fail(reply, request, 409, 'MENU_ITEM_SLUG_TAKEN', 'A menu item with this slug already exists in the selected menu.');
    }
    throw error;
  }
  if (!result.rowCount) return fail(reply, request, 404, 'MENU_ITEM_NOT_FOUND', 'The selected menu item does not exist in this menu and organization.');
  return { data: camelize(result.rows[0]), requestId: request.id };
});


// Reordering is an explicit full-list operation. Requiring every current ID prevents
// a stale client from silently moving only part of a menu or resetting omitted items.
app.put<{ Params: { organizationId: string; storeId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/stores/:storeId/menus/reorder', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = MenuReorderInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide a unique ordered list of menu IDs.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT id FROM restaurant_menus WHERE organization_id=$1 AND store_id=$2 ORDER BY position,id FOR UPDATE', [organizationId, storeId]);
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return fail(reply, request, 404, 'MENUS_NOT_FOUND', 'No menus exist for this store.');
    }
    const currentIds = current.rows.map((row: { id: string }) => String(row.id));
    const requestedIds = parsed.data.menuIds;
    if (currentIds.length !== requestedIds.length || currentIds.some((id: string) => !requestedIds.includes(id))) {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'MENU_ORDER_STALE', 'The ordered menu IDs must exactly match the current menus. Reload and try again.');
    }
    for (let position = 0; position < requestedIds.length; position++) {
      await client.query('UPDATE restaurant_menus SET position=$1,updated_at=$2 WHERE id=$3 AND organization_id=$4 AND store_id=$5', [position, new Date(), requestedIds[position], organizationId, storeId]);
    }
    await client.query('COMMIT');
    const result = await pool.query('SELECT m.*, (SELECT count(*)::int FROM restaurant_menu_items i WHERE i.menu_id=m.id) AS item_count FROM restaurant_menus m WHERE m.organization_id=$1 AND m.store_id=$2 ORDER BY m.position,m.created_at DESC', [organizationId, storeId]);
    return { data: camelize(result.rows), requestId: request.id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
});

app.put<{ Params: { organizationId: string; menuId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/menus/:menuId/items/reorder', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, menuId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = MenuItemReorderInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide a unique ordered list of menu item IDs.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const menu = await client.query('SELECT id FROM restaurant_menus WHERE id=$1 AND organization_id=$2 FOR UPDATE', [menuId, organizationId]);
    if (!menu.rowCount) {
      await client.query('ROLLBACK');
      return fail(reply, request, 404, 'MENU_NOT_FOUND', 'The selected menu does not exist in this organization.');
    }
    const current = await client.query('SELECT id FROM restaurant_menu_items WHERE menu_id=$1 AND organization_id=$2 ORDER BY position,id FOR UPDATE', [menuId, organizationId]);
    const currentIds = current.rows.map((row: { id: string }) => String(row.id));
    const requestedIds = parsed.data.itemIds;
    if (currentIds.length !== requestedIds.length || currentIds.some((id: string) => !requestedIds.includes(id))) {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'MENU_ITEM_ORDER_STALE', 'The ordered item IDs must exactly match the current menu items. Reload and try again.');
    }
    for (let position = 0; position < requestedIds.length; position++) {
      await client.query('UPDATE restaurant_menu_items SET position=$1,updated_at=$2 WHERE id=$3 AND menu_id=$4 AND organization_id=$5', [position, new Date(), requestedIds[position], menuId, organizationId]);
    }
    await client.query('COMMIT');
    const result = await pool.query('SELECT * FROM restaurant_menu_items WHERE menu_id=$1 AND organization_id=$2 ORDER BY position,name LIMIT 500', [menuId, organizationId]);
    return { data: camelize(result.rows), requestId: request.id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
});

app.get<{ Params: { storeSlug: string } }>('/api/v1/public/stores/:storeSlug/menus', async (request, reply) => {
  const store = await pool.query("SELECT s.id,s.organization_id FROM stores s JOIN store_frontends f ON f.store_id=s.id WHERE s.slug=$1 AND s.status=$2 AND f.published=true AND 'menu'=ANY(f.enabled_experiences) LIMIT 1", [request.params.storeSlug, 'active']);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The published store does not exist.');
  const result = await pool.query(
    "SELECT m.id,m.slug,m.name,m.description,m.service_periods,m.position,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'slug',i.slug,'name',i.name,'description',i.description,'priceAmountMinor',i.price_amount_minor,'currency',i.currency,'categoryId',i.category_id,'categoryName',(SELECT c.name FROM categories c WHERE c.id=i.category_id AND c.organization_id=i.organization_id AND c.store_id=i.store_id AND c.status='active'),'allergens',i.allergens,'dietaryLabels',i.dietary_labels,'modifierGroups',COALESCE(i.metadata->'modifierGroups','[]'::jsonb),'availability',i.availability ,'position',i.position) ORDER BY i.position,i.name) FROM restaurant_menu_items i WHERE i.menu_id=m.id AND i.organization_id=m.organization_id AND i.status='active' AND i.availability<>'unavailable'), '[]'::jsonb) AS items FROM restaurant_menus m WHERE m.store_id=$1 AND m.organization_id=$2 AND m.status='active' ORDER BY m.position,m.name",
    [store.rows[0].id, store.rows[0].organization_id]
  );
  return { data: camelize(result.rows), requestId: request.id };
});

const CustomDomainInput = z.object({
  storeId: z.string().trim().min(1).max(100),
  hostname: z.string().trim().toLowerCase().min(3).max(253)
    .regex(/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'Enter a valid fully qualified domain name.')
}).strict();

app.get<{ Params: { organizationId: string; storeId: string } }>('/api/v1/organizations/:organizationId/stores/:storeId/domains', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const store = await pool.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2', [storeId, organizationId]);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist in this organization.');
  const result = await pool.query(
    'SELECT id,organization_id,store_id,hostname,kind,status,verified_at,activated_at,is_primary,last_checked_at,created_at,updated_at FROM store_domains WHERE organization_id=$1 AND store_id=$2 ORDER BY created_at DESC LIMIT 100',
    [organizationId, storeId]
  );
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/domains', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = CustomDomainInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The custom domain payload is invalid.');
  const hostname = parsed.data.hostname.replace(/\.$/, '');
  if (hostname === 'dollareus.com' || hostname.endsWith('.dollareus.com')) {
    return fail(reply, request, 400, 'PLATFORM_DOMAIN_RESERVED', 'Use a custom domain you control; Dollareus platform domains are managed separately.');
  }
  const store = await pool.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2', [parsed.data.storeId, organizationId]);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist in this organization.');
  const now = new Date();
  const id = randomUUID();
  const verificationToken = 'dollareus-verify=' + randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  try {
    const result = await pool.query(
      "INSERT INTO store_domains (id,organization_id,store_id,hostname,kind,status,verification_token,verified_at,activated_at,is_primary,last_checked_at,created_at,updated_at) VALUES ($1,$2,$3,$4,'custom','verification_required',$5,NULL,NULL,false,NULL,$6,$6) RETURNING id,organization_id,store_id,hostname,kind,status,is_primary,created_at,updated_at",
      [id, organizationId, parsed.data.storeId, hostname, verificationToken, now]
    );
    return reply.code(201).send({
      data: { ...camelize(result.rows[0]) as object, verification: { recordType: 'TXT', recordName: '_dollareus-verify.' + hostname, recordValue: verificationToken } },
      requestId: request.id
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'DOMAIN_ALREADY_REGISTERED', 'This hostname is already registered.');
    throw error;
  }
});

app.post<{ Params: { organizationId: string; domainId: string } }>('/api/v1/organizations/:organizationId/domains/:domainId/verify', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, domainId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const domain = await pool.query(
    "SELECT id,hostname,verification_token,status FROM store_domains WHERE id=$1 AND organization_id=$2 AND kind='custom'",
    [domainId, organizationId]
  );
  if (!domain.rowCount) return fail(reply, request, 404, 'DOMAIN_NOT_FOUND', 'The custom domain does not exist in this organization.');
  if (domain.rows[0].status === 'disabled') return fail(reply, request, 409, 'DOMAIN_DISABLED', 'Re-enable the domain by registering it again before verification.');
  const hostname = String(domain.rows[0].hostname);
  const verificationName = '_dollareus-verify.' + hostname;
  let records: string[] = [];
  try {
    records = (await resolveTxt(verificationName)).map((parts) => parts.join(''));
  } catch {
    await pool.query(
      'UPDATE store_domains SET status=$3,last_checked_at=$4,updated_at=$4 WHERE id=$1 AND organization_id=$2 RETURNING id,hostname,status,last_checked_at,updated_at',
      [domainId, organizationId, 'verification_required', new Date()]
    );
    return fail(reply, request, 422, 'DOMAIN_VERIFICATION_PENDING', 'The expected DNS TXT record was not found. Add the exact record and try again.');
  }
  if (!records.includes(String(domain.rows[0].verification_token))) {
    await pool.query('UPDATE store_domains SET status=$3,last_checked_at=$4,updated_at=$4 WHERE id=$1 AND organization_id=$2', [domainId, organizationId, 'verification_required', new Date()]);
    return fail(reply, request, 422, 'DOMAIN_VERIFICATION_PENDING', 'The DNS TXT record does not match the verification token.');
  }
  const now = new Date();
  const updated = await pool.query(
    "UPDATE store_domains SET status='verified',verified_at=$3,last_checked_at=$3,updated_at=$3 WHERE id=$1 AND organization_id=$2 RETURNING id,hostname,kind,status,verified_at,last_checked_at,updated_at",
    [domainId, organizationId, now]
  );
  return { data: camelize(updated.rows[0]), requestId: request.id };
});

app.post<{ Params: { organizationId: string; domainId: string } }>('/api/v1/organizations/:organizationId/domains/:domainId/disable', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, domainId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const result = await pool.query(
    "UPDATE store_domains SET status='disabled',is_primary=false,updated_at=$3 WHERE id=$1 AND organization_id=$2 RETURNING id,hostname,status,is_primary,updated_at",
    [domainId, organizationId, new Date()]
  );
  if (!result.rowCount) return fail(reply, request, 404, 'DOMAIN_NOT_FOUND', 'The domain does not exist in this organization.');
  return { data: camelize(result.rows[0]), requestId: request.id };
});

app.get<{ Params: { organizationId: string; storeId: string } }>('/api/v1/organizations/:organizationId/stores/:storeId/entry-points', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const result = await pool.query('SELECT id,organization_id,store_id,type,target_path,status,branding,created_by,created_at,updated_at FROM entry_points WHERE organization_id=$1 AND store_id=$2 ORDER BY created_at DESC LIMIT 200', [organizationId, storeId]);
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/entry-points', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const parsed = EntryPointInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The entry-point payload is invalid.');
  const store = await pool.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2', [parsed.data.storeId, organizationId]);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist in this organization.');
  const now = new Date();
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const result = await pool.query('INSERT INTO entry_points (id,organization_id,store_id,type,target_path,status,branding,created_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$9) RETURNING id,organization_id,store_id,type,target_path,status,branding,created_by,created_at,updated_at', [randomUUID(), organizationId, parsed.data.storeId, parsed.data.type, parsed.data.targetPath, 'active', JSON.stringify(parsed.data.branding ?? {}), request.identity!.uid, now]);
  return reply.code(201).send({ data: camelize(result.rows[0]), requestId: request.id });
});

app.patch<{ Params: { organizationId: string; entryPointId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/entry-points/:entryPointId', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, entryPointId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const parsed = EntryPointPatch.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The entry-point update is invalid.');
  const current = await pool.query('SELECT branding FROM entry_points WHERE id=$1 AND organization_id=$2', [entryPointId, organizationId]);
  if (!current.rowCount) return fail(reply, request, 404, 'ENTRY_POINT_NOT_FOUND', 'The entry point does not exist in this organization.');
  const branding = parsed.data.branding === undefined ? current.rows[0].branding : parsed.data.branding;
  const result = await pool.query('UPDATE entry_points SET status=COALESCE($1,status),branding=$2::jsonb,updated_at=$3 WHERE id=$4 AND organization_id=$5 RETURNING id,organization_id,store_id,type,target_path,status,branding,created_by,created_at,updated_at', [parsed.data.status ?? null, JSON.stringify(branding ?? {}), new Date(), entryPointId, organizationId]);
  if (!result.rowCount) return fail(reply, request, 404, 'ENTRY_POINT_NOT_FOUND', 'The entry point does not exist in this organization.');
  return { data: camelize(result.rows[0]), requestId: request.id };
});

app.get<{ Params: { entryPointId: string } }>('/api/v1/public/entry-points/:entryPointId', async (request, reply) => {
  const result = await pool.query(
    "SELECT e.id,e.type,e.target_path,e.branding,s.slug AS store_slug,s.name AS store_name FROM entry_points e JOIN stores s ON s.id=e.store_id AND s.organization_id=e.organization_id JOIN store_frontends f ON f.store_id=s.id WHERE e.id=$1 AND e.status='active' AND s.status='active' AND f.published=true AND (e.target_path<>'/menu' OR 'menu'=ANY(f.enabled_experiences)) AND (e.target_path<>'/catalog' OR 'catalog'=ANY(f.enabled_experiences) OR 'commerce'=ANY(f.enabled_experiences)) LIMIT 1",
    [request.params.entryPointId]
  );
  if (!result.rowCount) return fail(reply, request, 404, 'ENTRY_POINT_NOT_FOUND', 'The published entry point does not exist.');
  const row = result.rows[0];
  const targetUrlPath = row.target_path === '/' ? '/' + row.store_slug : '/' + row.store_slug + row.target_path;
  const primaryDomain = await pool.query("SELECT hostname FROM store_domains WHERE store_id=(SELECT store_id FROM entry_points WHERE id=$1) AND status='active' AND is_primary=true LIMIT 1", [row.id]);
  const configuredBaseValue = (process.env.PUBLIC_STOREFRONT_BASE_URL ?? '').trim();
  const configuredBase = configuredBaseValue.endsWith('/') ? configuredBaseValue.slice(0, -1) : configuredBaseValue;
  const subdomainBase = process.env.PUBLIC_STORE_DOMAIN ? 'https://' + row.store_slug + '.' + process.env.PUBLIC_STORE_DOMAIN : '';
  const targetUrl = primaryDomain.rows[0]?.hostname
    ? 'https://' + primaryDomain.rows[0].hostname + (row.target_path === '/' ? '' : row.target_path)
    : configuredBase
      ? configuredBase + targetUrlPath
      : subdomainBase
        ? subdomainBase + (row.target_path === '/' ? '' : row.target_path)
        : null;
  return { data: { id: row.id, type: row.type, targetPath: row.target_path, storeSlug: row.store_slug, storeName: row.store_name, targetUrlPath, targetUrl, branding: row.branding ?? {} }, requestId: request.id };
});


const ManualPaymentInput = z.object({
  method: z.enum(['cash', 'cash_on_delivery', 'bank_transfer', 'mobile_money', 'card_terminal', 'other']),
  status: z.enum(['pending', 'succeeded']).default('succeeded'),
  amountMinor: z.number().int().positive(),
  reference: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional()
}).strict();

app.get<{ Params: { organizationId: string; orderId: string } }>('/api/v1/organizations/:organizationId/orders/:orderId/payments', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, orderId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const order = await pool.query('SELECT id,total_minor,currency,payment_status FROM orders WHERE id=$1 AND organization_id=$2', [orderId, organizationId]);
  if (!order.rowCount) return fail(reply, request, 404, 'ORDER_NOT_FOUND', 'The order does not exist in this organization.');
  const payments = await pool.query(
    "SELECT id,order_id,provider,status,amount_minor,currency,provider_payload,created_at,updated_at FROM payments WHERE order_id=$1 AND organization_id=$2 ORDER BY created_at DESC",
    [orderId, organizationId]
  );
  const paid = await pool.query("SELECT COALESCE(SUM(amount_minor),0)::text AS amount FROM payments WHERE order_id=$1 AND organization_id=$2 AND status='succeeded'", [orderId, organizationId]);
  const paidAmountMinor = Number(paid.rows[0]?.amount ?? 0);
  const totalMinor = Number(order.rows[0].total_minor);
  return { data: { orderId, currency: String(order.rows[0].currency).trim(), paymentStatus: paidAmountMinor >= totalMinor ? 'paid' : paidAmountMinor > 0 ? 'partially_paid' : order.rows[0].payment_status, totalMinor, paidAmountMinor, balanceMinor: Math.max(0, totalMinor - paidAmountMinor), payments: camelize(payments.rows) }, requestId: request.id };
});

app.post<{ Params: { organizationId: string; orderId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/orders/:orderId/payments', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, orderId } = request.params;
  if (!await requireOperatorRole(request, reply, organizationId)) return;
  const parsed = ManualPaymentInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide a valid offline payment method, amount, and status.');
  const client = await pool.connect();
  const now = new Date();
  const paymentId = randomUUID();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      'SELECT id,total_minor,currency,status FROM orders WHERE id=$1 AND organization_id=$2 FOR UPDATE',
      [orderId, organizationId]
    );
    if (!orderResult.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'ORDER_NOT_FOUND', 'The order does not exist in this organization.'); }
    const order = orderResult.rows[0];
    if (['cancelled', 'refunded'].includes(String(order.status))) {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'ORDER_NOT_PAYABLE', 'Payments cannot be recorded against a cancelled or refunded order.');
    }
    if (parsed.data.idempotencyKey) {
      const existing = await client.query('SELECT id,order_id FROM payments WHERE organization_id=$1 AND idempotency_key=$2', [organizationId, parsed.data.idempotencyKey]);
      if (existing.rowCount) {
        if (String(existing.rows[0].order_id) !== orderId) { await client.query('ROLLBACK'); return fail(reply, request, 409, 'PAYMENT_CONFLICT', 'This idempotency key was already used for a different order.'); }
        await client.query('COMMIT');
        const existingPayment = await pool.query('SELECT id,order_id,provider,status,amount_minor,currency,provider_payload,created_at,updated_at FROM payments WHERE id=$1 AND organization_id=$2', [existing.rows[0].id, organizationId]);
        return { data: camelize(existingPayment.rows[0]), requestId: request.id };
      }
    }
    const paidResult = await client.query("SELECT COALESCE(SUM(amount_minor),0)::text AS amount FROM payments WHERE order_id=$1 AND organization_id=$2 AND status='succeeded'", [orderId, organizationId]);
    const paidBefore = Number(paidResult.rows[0]?.amount ?? 0);
    const total = Number(order.total_minor);
    if (parsed.data.amountMinor > Math.max(0, total - paidBefore)) {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'PAYMENT_EXCEEDS_BALANCE', 'The recorded amount cannot exceed the order’s remaining balance.');
    }
    const payload = {
      method: parsed.data.method,
      reference: parsed.data.reference ?? null,
      note: parsed.data.note ?? null,
      recordedBy: request.identity!.uid,
      recordedAt: now.toISOString(),
      confirmation: parsed.data.status === 'succeeded' ? 'manually_confirmed' : 'awaiting_manual_confirmation'
    };
    await client.query(
      'INSERT INTO payments (id,organization_id,order_id,provider,provider_payment_id,status,amount_minor,currency,idempotency_key,provider_payload,created_at,updated_at) VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9::jsonb,$10,$10)',
      [paymentId, organizationId, orderId, 'manual', parsed.data.status, parsed.data.amountMinor, String(order.currency).trim(), parsed.data.idempotencyKey ?? null, JSON.stringify(payload), now]
    );
    const paidAfter = paidBefore + (parsed.data.status === 'succeeded' ? parsed.data.amountMinor : 0);
    const nextPaymentStatus = paidAfter >= total ? 'paid' : 'unpaid';
    await client.query('UPDATE orders SET payment_status=$1,updated_at=$2 WHERE id=$3 AND organization_id=$4', [nextPaymentStatus, now, orderId, organizationId]);
    await client.query(
      'INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,request_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
      [randomUUID(), organizationId, request.identity!.uid, 'order.manual_payment_recorded', 'payment', paymentId, request.id, JSON.stringify({ orderId, method: parsed.data.method, status: parsed.data.status, amountMinor: parsed.data.amountMinor, currency: String(order.currency).trim() }), now]
    );
    await client.query('COMMIT');
    return reply.code(201).send({
      data: {
        id: paymentId, orderId, provider: 'manual', status: parsed.data.status,
        amountMinor: parsed.data.amountMinor, currency: String(order.currency).trim(),
        providerPayload: payload, createdAt: now, updatedAt: now,
        paymentStatus: paidAfter >= total ? 'paid' : paidAfter > 0 ? 'partially_paid' : 'unpaid', paidAmountMinor: paidAfter, balanceMinor: Math.max(0, total - paidAfter)
      },
      requestId: request.id
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'PAYMENT_CONFLICT', 'This payment or idempotency key has already been recorded.');
    throw error;
  } finally { client.release(); }
});

app.patch<{ Params: { organizationId: string; orderId: string; paymentId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/orders/:orderId/payments/:paymentId', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, orderId, paymentId } = request.params;
  if (!await requireOperatorRole(request, reply, organizationId)) return;
  const parsed = z.object({ status: z.enum(['succeeded', 'failed', 'cancelled']) }).strict().safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Choose succeeded, failed, or cancelled for the offline payment record.');
  const client = await pool.connect();
  const now = new Date();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query('SELECT id,total_minor,currency,status FROM orders WHERE id=$1 AND organization_id=$2 FOR UPDATE', [orderId, organizationId]);
    if (!orderResult.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'ORDER_NOT_FOUND', 'The order does not exist in this organization.'); }
    const paymentResult = await client.query('SELECT id,status,amount_minor,provider_payload FROM payments WHERE id=$1 AND order_id=$2 AND organization_id=$3 AND provider=$4 FOR UPDATE', [paymentId, orderId, organizationId, 'manual']);
    if (!paymentResult.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'PAYMENT_NOT_FOUND', 'The offline payment record does not exist for this order.'); }
    const previous = String(paymentResult.rows[0].status);
    const next = parsed.data.status;
    if (next === 'succeeded' && ['cancelled', 'refunded'].includes(String(orderResult.rows[0].status))) {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'ORDER_NOT_PAYABLE', 'A pending payment cannot be confirmed after its order has been cancelled or refunded.');
    }
    if (previous !== 'pending') {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'PAYMENT_ALREADY_FINAL', 'Only a pending offline payment can be confirmed or cancelled.');
    }
    if (next === 'succeeded') {
      const paid = await client.query("SELECT COALESCE(SUM(amount_minor),0)::text AS amount FROM payments WHERE order_id=$1 AND organization_id=$2 AND status='succeeded'", [orderId, organizationId]);
      const paidBefore = Number(paid.rows[0]?.amount ?? 0);
      if (paidBefore + Number(paymentResult.rows[0].amount_minor) > Number(orderResult.rows[0].total_minor)) {
        await client.query('ROLLBACK');
        return fail(reply, request, 409, 'PAYMENT_EXCEEDS_BALANCE', 'Confirming this payment would exceed the order’s remaining balance.');
      }
    }
    const payload = { ...(paymentResult.rows[0].provider_payload ?? {}), confirmation: next === 'succeeded' ? 'manually_confirmed' : 'manually_closed', confirmedBy: request.identity!.uid, confirmedAt: now.toISOString() };
    await client.query('UPDATE payments SET status=$1,provider_payload=$2::jsonb,updated_at=$3 WHERE id=$4', [next, JSON.stringify(payload), now, paymentId]);
    const paid = await client.query("SELECT COALESCE(SUM(amount_minor),0)::text AS amount FROM payments WHERE order_id=$1 AND organization_id=$2 AND status='succeeded'", [orderId, organizationId]);
    const paidAmountMinor = Number(paid.rows[0]?.amount ?? 0);
    const paymentStatus = paidAmountMinor >= Number(orderResult.rows[0].total_minor) ? 'paid' : paidAmountMinor > 0 ? 'partially_paid' : 'unpaid';
    const persistedPaymentStatus = paymentStatus === 'partially_paid' ? 'unpaid' : paymentStatus;
    await client.query('UPDATE orders SET payment_status=$1,updated_at=$2 WHERE id=$3 AND organization_id=$4', [persistedPaymentStatus, now, orderId, organizationId]);
    await client.query(
      'INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,request_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
      [randomUUID(), organizationId, request.identity!.uid, 'order.manual_payment_status_changed', 'payment', paymentId, request.id, JSON.stringify({ orderId, from: previous, to: next }), now]
    );
    await client.query('COMMIT');
    return { data: { id: paymentId, orderId, status: next, paymentStatus, paidAmountMinor, balanceMinor: Math.max(0, Number(orderResult.rows[0].total_minor) - paidAmountMinor), updatedAt: now }, requestId: request.id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
});

const OrderStatusUpdateInput = z.object({ status: z.enum(['pending', 'confirmed', 'processing', 'completed', 'cancelled']) }).strict();

app.patch<{ Params: { organizationId: string; orderId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/orders/:orderId', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, orderId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const parsed = OrderStatusUpdateInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Choose a supported order status.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT id,status,payment_status FROM orders WHERE id=$1 AND organization_id=$2 FOR UPDATE', [orderId, organizationId]);
    if (!current.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'ORDER_NOT_FOUND', 'The order does not exist in this organization.'); }
    const from = String(current.rows[0].status);
    const to = parsed.data.status;
    if (from === to) { await client.query('COMMIT'); return { data: { id: orderId, status: from }, requestId: request.id }; }
    const allowed: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
      refunded: []
    };
    if (!allowed[from]?.includes(to)) {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'INVALID_ORDER_TRANSITION', 'This order cannot move from ' + from + ' to ' + to + '.');
    }
    if (to === 'cancelled' && current.rows[0].payment_status !== 'unpaid' && current.rows[0].payment_status !== 'failed') {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'REFUND_REQUIRED', 'A paid or authorized order must go through the refund workflow before cancellation.');
    }
    const now = new Date();
    const updated = await client.query('UPDATE orders SET status=$1,updated_at=$2 WHERE id=$3 AND organization_id=$4 RETURNING id,status,payment_status,updated_at', [to, now, orderId, organizationId]);
    await client.query(
      'INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,request_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
      [randomUUID(), organizationId, request.identity!.uid, 'order.status_changed', 'order', orderId, request.id, JSON.stringify({ from, to }), now]
    );
    await client.query('COMMIT');
    return { data: camelize(updated.rows[0]), requestId: request.id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
});


const FulfillmentInput = z.object({
  stage: z.enum(['preparing', 'shipped', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled']).default('preparing'),
  carrier: z.string().trim().max(120).nullable().optional(),
  trackingNumber: z.string().trim().max(160).nullable().optional(),
  trackingUrl: z.string().trim().max(1000).url().refine((value) => /^https?:\/\//i.test(value), 'Tracking URL must use HTTP or HTTPS.').nullable().optional(),
  estimatedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional()
}).strict();

type FulfillmentStage = z.infer<typeof FulfillmentInput>['stage'];

function fulfillmentRecord(row: any) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    status: String(row.status),
    stage: String(metadata.stage ?? (row.status === 'processing' || row.status === 'pending' ? 'preparing' : row.status)),
    carrier: row.carrier ?? null,
    trackingNumber: row.tracking_number ?? null,
    trackingUrl: row.tracking_url ?? null,
    shippedAt: row.shipped_at ?? null,
    deliveredAt: row.delivered_at ?? null,
    estimatedDeliveryDate: metadata.estimatedDeliveryDate ?? null,
    notes: metadata.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function fulfillmentDbStatus(stage: FulfillmentStage): string {
  if (stage === 'preparing') return 'processing';
  if (stage === 'out_for_delivery' || stage === 'delivery_failed') return 'shipped';
  return stage;
}

function fulfillmentOrderStatus(stage: FulfillmentStage): string {
  if (stage === 'delivered') return 'fulfilled';
  if (stage === 'returned') return 'returned';
  return 'unfulfilled';
}

const FulfillmentTransitions: Record<FulfillmentStage, FulfillmentStage[]> = {
  preparing: ['preparing', 'shipped', 'cancelled'],
  shipped: ['shipped', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled'],
  out_for_delivery: ['out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled'],
  delivery_failed: ['delivery_failed', 'out_for_delivery', 'delivered', 'returned', 'cancelled'],
  delivered: ['delivered', 'returned'],
  returned: ['returned'],
  cancelled: ['cancelled']
};

app.get<{ Params: { organizationId: string; orderId: string } }>('/api/v1/organizations/:organizationId/orders/:orderId/fulfillments', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, orderId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const order = await pool.query('SELECT id FROM orders WHERE id=$1 AND organization_id=$2', [orderId, organizationId]);
  if (!order.rowCount) return fail(reply, request, 404, 'ORDER_NOT_FOUND', 'The order does not exist in this organization.');
  const rows = await pool.query('SELECT id,order_id,status,carrier,tracking_number,tracking_url,shipped_at,delivered_at,metadata,created_at,updated_at FROM fulfillments WHERE order_id=$1 AND organization_id=$2 ORDER BY created_at DESC', [orderId, organizationId]);
  return { data: { orderId, fulfillments: rows.rows.map(fulfillmentRecord) }, requestId: request.id };
});

app.post<{ Params: { organizationId: string; orderId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/orders/:orderId/fulfillments', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, orderId } = request.params;
  if (!await requireOperatorRole(request, reply, organizationId)) return;
  const parsed = FulfillmentInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide a valid shipping stage and optional carrier, tracking URL, expected date, and notes.');
  const client = await pool.connect();
  const now = new Date();
  const fulfillmentId = randomUUID();
  try {
    await client.query('BEGIN');
    const order = await client.query('SELECT id,status FROM orders WHERE id=$1 AND organization_id=$2 FOR UPDATE', [orderId, organizationId]);
    if (!order.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'ORDER_NOT_FOUND', 'The order does not exist in this organization.'); }
    if (['cancelled', 'refunded'].includes(String(order.rows[0].status))) {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'ORDER_NOT_FULFILLABLE', 'A cancelled or refunded order cannot be shipped.');
    }
    const active = await client.query("SELECT id FROM fulfillments WHERE order_id=$1 AND organization_id=$2 AND status NOT IN ('cancelled','returned','delivered') FOR UPDATE", [orderId, organizationId]);
    if (active.rowCount) {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'ACTIVE_FULFILLMENT_EXISTS', 'Update the existing shipment instead of creating a duplicate.');
    }
    const input = parsed.data;
    const metadata = { stage: input.stage, estimatedDeliveryDate: input.estimatedDeliveryDate ?? null, notes: input.notes ?? null, updatedBy: request.identity!.uid, stageUpdatedAt: now.toISOString() };
    const status = fulfillmentDbStatus(input.stage);
    const shippedAt = ['shipped','out_for_delivery','delivery_failed','delivered'].includes(input.stage) ? now : null;
    const deliveredAt = input.stage === 'delivered' ? now : null;
    const inserted = await client.query(
      'INSERT INTO fulfillments (id,organization_id,order_id,status,carrier,tracking_number,tracking_url,shipped_at,delivered_at,metadata,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$11) RETURNING id,order_id,status,carrier,tracking_number,tracking_url,shipped_at,delivered_at,metadata,created_at,updated_at',
      [fulfillmentId, organizationId, orderId, status, input.carrier || null, input.trackingNumber || null, input.trackingUrl || null, shippedAt, deliveredAt, JSON.stringify(metadata), now]
    );
    await client.query('UPDATE orders SET fulfillment_status=$1,updated_at=$2 WHERE id=$3 AND organization_id=$4', [fulfillmentOrderStatus(input.stage), now, orderId, organizationId]);
    await client.query(
      'INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,request_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
      [randomUUID(), organizationId, request.identity!.uid, 'order.fulfillment_created', 'fulfillment', fulfillmentId, request.id, JSON.stringify({ orderId, stage: input.stage, carrier: input.carrier ?? null, trackingNumber: input.trackingNumber ?? null }), now]
    );
    await client.query('COMMIT');
    return reply.code(201).send({ data: fulfillmentRecord(inserted.rows[0]), requestId: request.id });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
});

app.patch<{ Params: { organizationId: string; orderId: string; fulfillmentId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/orders/:orderId/fulfillments/:fulfillmentId', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, orderId, fulfillmentId } = request.params;
  if (!await requireOperatorRole(request, reply, organizationId)) return;
  const parsed = FulfillmentInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide a valid shipping stage and optional carrier, tracking URL, expected date, and notes.');
  const client = await pool.connect();
  const now = new Date();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT id,order_id,status,carrier,tracking_number,tracking_url,shipped_at,delivered_at,metadata FROM fulfillments WHERE id=$1 AND order_id=$2 AND organization_id=$3 FOR UPDATE', [fulfillmentId, orderId, organizationId]);
    if (!current.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'FULFILLMENT_NOT_FOUND', 'The shipment does not exist for this order.'); }
    const previous = fulfillmentRecord({ ...current.rows[0], created_at: now, updated_at: now }).stage as FulfillmentStage;
    const input = parsed.data;
    if (!FulfillmentTransitions[previous]?.includes(input.stage)) {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'INVALID_FULFILLMENT_TRANSITION', 'This shipment cannot move from ' + previous.replaceAll('_', ' ') + ' to ' + input.stage.replaceAll('_', ' ') + '.');
    }
    const metadata = { stage: input.stage, estimatedDeliveryDate: input.estimatedDeliveryDate ?? null, notes: input.notes ?? null, updatedBy: request.identity!.uid, stageUpdatedAt: now.toISOString() };
    const status = fulfillmentDbStatus(input.stage);
    const oldShippedAt = current.rows[0].shipped_at;
    const shippedAt = ['shipped','out_for_delivery','delivery_failed','delivered'].includes(input.stage) ? oldShippedAt ?? now : oldShippedAt;
    const deliveredAt = input.stage === 'delivered' ? current.rows[0].delivered_at ?? now : current.rows[0].delivered_at;
    const updated = await client.query(
      'UPDATE fulfillments SET status=$1,carrier=$2,tracking_number=$3,tracking_url=$4,shipped_at=$5,delivered_at=$6,metadata=$7::jsonb,updated_at=$8 WHERE id=$9 AND organization_id=$10 RETURNING id,order_id,status,carrier,tracking_number,tracking_url,shipped_at,delivered_at,metadata,created_at,updated_at',
      [status, input.carrier || null, input.trackingNumber || null, input.trackingUrl || null, shippedAt, deliveredAt, JSON.stringify(metadata), now, fulfillmentId, organizationId]
    );
    await client.query('UPDATE orders SET fulfillment_status=$1,updated_at=$2 WHERE id=$3 AND organization_id=$4', [fulfillmentOrderStatus(input.stage), now, orderId, organizationId]);
    await client.query(
      'INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,request_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
      [randomUUID(), organizationId, request.identity!.uid, 'order.fulfillment_updated', 'fulfillment', fulfillmentId, request.id, JSON.stringify({ orderId, from: previous, to: input.stage, carrier: input.carrier ?? null, trackingNumber: input.trackingNumber ?? null }), now]
    );
    await client.query('COMMIT');
    return { data: fulfillmentRecord(updated.rows[0]), requestId: request.id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
});


const PosSessionInput = z.object({
  label: z.string().trim().min(1).max(120),
  terminalType: z.enum(['retail', 'restaurant', 'service', 'general']),
  locationId: z.string().min(1).max(100).nullable().optional()
}).strict();

const PosOrderInput = z.object({
  sessionId: z.string().min(1).max(100),
  channel: z.enum(['pos', 'qr']).default('pos'),
  fulfillment: z.enum(['counter', 'takeaway', 'dine_in', 'delivery', 'service']),
  tableLabel: z.string().trim().max(120).nullable().optional(),
  customerNote: z.string().trim().max(1000).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  items: z.array(z.object({
    sourceType: z.enum(['product', 'menu_item', 'service']),
    sourceItemId: z.string().min(1).max(100),
    sourceVariantId: z.string().min(1).max(100).nullable().optional(),
    quantity: z.number().int().min(1).max(10000),
    metadata: z.record(z.string(), z.unknown()).optional()
  }).strict()).min(1).max(100)
}).strict();

const PosOrderStatusInput = z.object({
  status: z.enum(['confirmed', 'preparing', 'ready', 'completed', 'cancelled'])
}).strict();

async function requirePosOperator(request: FastifyRequest, reply: FastifyReply, organizationId: string): Promise<boolean> {
  if (!await requireMembership(request, reply, organizationId)) return false;
  const membership = await pool.query(
    'SELECT role FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status=$3',
    [organizationId, request.identity!.uid, 'active']
  );
  if (!['owner', 'admin', 'manager', 'staff'].includes(String(membership.rows[0]?.role ?? ''))) {
    fail(reply, request, 403, 'POS_PERMISSION_DENIED', 'Only organization owners, admins, managers, or staff can operate POS.');
    return false;
  }
  return true;
}

app.get<{ Params: { organizationId: string; storeId: string } }>('/api/v1/organizations/:organizationId/stores/:storeId/pos/sessions', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const store = await pool.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2', [storeId, organizationId]);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The store does not exist in this organization.');
  const result = await pool.query(
    'SELECT * FROM pos_sessions WHERE organization_id=$1 AND store_id=$2 ORDER BY created_at DESC LIMIT 100',
    [organizationId, storeId]
  );
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string; storeId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/stores/:storeId/pos/sessions', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId } = request.params;
  if (!await requirePosOperator(request, reply, organizationId)) return;
  const parsed = PosSessionInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide a terminal label and supported terminal type.');
  const store = await pool.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2', [storeId, organizationId]);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The store does not exist in this organization.');
  if (parsed.data.locationId) {
    const location = await pool.query('SELECT id FROM inventory_locations WHERE id=$1 AND organization_id=$2 AND (store_id=$3 OR store_id IS NULL) AND status=$4', [parsed.data.locationId, organizationId, storeId, 'active']);
    if (!location.rowCount) return fail(reply, request, 400, 'INVALID_POS_LOCATION', 'The selected inventory location is not active in this store.');
  }
  const now = new Date();
  const result = await pool.query(
    'INSERT INTO pos_sessions (id,organization_id,store_id,label,terminal_type,location_id,status,opened_by,closed_by,opened_at,closed_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,NULL,$9,$9) RETURNING *',
    [randomUUID(), organizationId, storeId, parsed.data.label, parsed.data.terminalType, parsed.data.locationId ?? null, 'open', request.identity!.uid, now]
  );
  await pool.query(
    'INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,request_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
    [randomUUID(), organizationId, request.identity!.uid, 'pos.session_opened', 'pos_session', result.rows[0].id, request.id, JSON.stringify({ storeId, terminalType: parsed.data.terminalType }), now]
  );
  return reply.code(201).send({ data: camelize(result.rows[0]), requestId: request.id });
});

app.patch<{ Params: { organizationId: string; storeId: string; sessionId: string } }>('/api/v1/organizations/:organizationId/stores/:storeId/pos/sessions/:sessionId/close', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId, sessionId } = request.params;
  if (!await requirePosOperator(request, reply, organizationId)) return;
  const now = new Date();
  const result = await pool.query(
    "UPDATE pos_sessions SET status='closed',closed_by=$1,closed_at=$2,updated_at=$2 WHERE id=$3 AND organization_id=$4 AND store_id=$5 AND status='open' RETURNING *",
    [request.identity!.uid, now, sessionId, organizationId, storeId]
  );
  if (!result.rowCount) return fail(reply, request, 404, 'OPEN_POS_SESSION_NOT_FOUND', 'The open POS session does not exist in this store.');
  await pool.query(
    'INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,request_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
    [randomUUID(), organizationId, request.identity!.uid, 'pos.session_closed', 'pos_session', sessionId, request.id, JSON.stringify({ storeId }), now]
  );
  return { data: camelize(result.rows[0]), requestId: request.id };
});

const posOrderProjection = `SELECT o.*,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',l.id,'sourceType',l.source_type,'sourceItemId',l.source_item_id,
    'sourceVariantId',l.source_variant_id,'sourceMenuId',l.source_menu_id,
    'name',l.name_snapshot,'quantity',l.quantity,'unitAmountMinor',l.unit_amount_minor,
    'lineTotalMinor',l.line_total_minor,'currency',l.currency,'metadata',l.metadata_snapshot
  ) ORDER BY l.created_at,l.id) FROM pos_order_lines l WHERE l.order_id=o.id AND l.organization_id=o.organization_id), '[]'::jsonb) AS items
  FROM pos_orders o`;

app.get<{ Params: { organizationId: string; storeId: string } }>('/api/v1/organizations/:organizationId/stores/:storeId/pos/orders', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const store = await pool.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2', [storeId, organizationId]);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The store does not exist in this organization.');
  const result = await pool.query(posOrderProjection + ' WHERE o.organization_id=$1 AND o.store_id=$2 ORDER BY o.created_at DESC LIMIT 100', [organizationId, storeId]);
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string; storeId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/stores/:storeId/pos/orders', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId } = request.params;
  if (!await requirePosOperator(request, reply, organizationId)) return;
  const parsed = PosOrderInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide a valid POS session, fulfillment type, and at least one valid item.');
  const duplicateKeys = parsed.data.items.map((item) => [item.sourceType, item.sourceItemId, item.sourceVariantId ?? '', item.sourceType === 'menu_item' ? JSON.stringify(item.metadata?.modifiers ?? []) : ''].join(':'));
  if (new Set(duplicateKeys).size !== duplicateKeys.length) return fail(reply, request, 400, 'DUPLICATE_POS_ITEMS', 'Combine duplicate items into a single line with a quantity.');
  const client = await pool.connect();
  const now = new Date();
  const orderId = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [organizationId]);
    const store = await client.query('SELECT id,default_currency,business_type FROM stores WHERE id=$1 AND organization_id=$2 AND status IN ($3,$4) FOR SHARE', [storeId, organizationId, 'active', 'setup']);
    if (!store.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The store does not exist or is unavailable.'); }
    if (parsed.data.idempotencyKey) {
      const existing = await client.query('SELECT id FROM pos_orders WHERE store_id=$1 AND idempotency_key=$2', [storeId, parsed.data.idempotencyKey]);
      if (existing.rowCount) {
        await client.query('COMMIT');
        const prior = await pool.query(posOrderProjection + ' WHERE o.id=$1 AND o.organization_id=$2 AND o.store_id=$3', [existing.rows[0].id, organizationId, storeId]);
        return { data: camelize(prior.rows[0]), requestId: request.id };
      }
    }
    const session = await client.query("SELECT id FROM pos_sessions WHERE id=$1 AND organization_id=$2 AND store_id=$3 AND status='open' FOR SHARE", [parsed.data.sessionId, organizationId, storeId]);
    if (!session.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 409, 'POS_SESSION_CLOSED', 'Open a POS session for this store before creating an order.'); }
    const currency = String(store.rows[0].default_currency).trim();
    const lines: Array<{ sourceType: string; sourceItemId: string; sourceVariantId: string | null; sourceMenuId: string | null; productId: string | null; sku: string | null; variantTitle: string; options: Record<string, unknown>; name: string; quantity: number; unitAmount: number; total: number; metadata: Record<string, unknown> }> = [];
    let subtotal = 0;
    for (const item of parsed.data.items) {
      let source: any;
      let modifierDelta = 0;
      const modifierSnapshot: Array<Record<string, unknown>> = [];
      if (item.sourceType === 'menu_item') {
        source = (await client.query(
          "SELECT i.id,i.menu_id,i.name,i.price_amount_minor AS amount_minor,i.currency,i.status,i.availability,i.metadata,m.status AS menu_status FROM restaurant_menu_items i JOIN restaurant_menus m ON m.id=i.menu_id AND m.organization_id=i.organization_id WHERE i.id=$1 AND i.organization_id=$2 AND i.store_id=$3 FOR SHARE OF i,m",
          [item.sourceItemId, organizationId, storeId]
        )).rows[0];
        if (!source || source.status !== 'active' || source.availability === 'unavailable' || source.menu_status !== 'active') {
          await client.query('ROLLBACK'); return fail(reply, request, 400, 'INVALID_POS_ITEM', 'Every menu item must belong to this store and be active and available.');
        }
        const groups = Array.isArray(source.metadata?.modifierGroups) ? source.metadata.modifierGroups as Array<any> : [];
        const rawSelections = item.metadata?.modifiers;
        if (rawSelections !== undefined && !Array.isArray(rawSelections)) {
          await client.query('ROLLBACK'); return fail(reply, request, 400, 'INVALID_POS_MODIFIERS', 'Menu modifier selections must be a list of selected option groups.');
        }
        const selections = (rawSelections ?? []) as Array<any>;
        const selectionByGroup = new Map<string, string[]>();
        for (const selection of selections) {
          if (!selection || typeof selection.groupId !== 'string' || !Array.isArray(selection.optionIds) || selection.optionIds.some((id: unknown) => typeof id !== 'string')) {
            await client.query('ROLLBACK'); return fail(reply, request, 400, 'INVALID_POS_MODIFIERS', 'Each modifier selection needs a group ID and option ID list.');
          }
          if (selectionByGroup.has(selection.groupId)) {
            await client.query('ROLLBACK'); return fail(reply, request, 400, 'INVALID_POS_MODIFIERS', 'Each modifier group can only be submitted once.');
          }
          selectionByGroup.set(selection.groupId, selection.optionIds as string[]);
        }
        const validGroupIds = new Set(groups.map((group: any) => String(group.id)));
        if ([...selectionByGroup.keys()].some((groupId) => !validGroupIds.has(groupId))) {
          await client.query('ROLLBACK'); return fail(reply, request, 400, 'INVALID_POS_MODIFIERS', 'A selected modifier group does not belong to this menu item.');
        }
        for (const group of groups) {
          const groupId = String(group.id);
          const optionIds = selectionByGroup.get(groupId) ?? [];
          const options = Array.isArray(group.options) ? group.options as Array<any> : [];
          const minSelections = Number(group.minSelections ?? (group.required ? 1 : 0));
          const maxSelections = Number(group.maxSelections ?? 1);
          if (!Number.isInteger(minSelections) || !Number.isInteger(maxSelections) || minSelections < 0 || maxSelections < minSelections || optionIds.length < minSelections || optionIds.length > maxSelections || new Set(optionIds).size !== optionIds.length) {
            await client.query('ROLLBACK'); return fail(reply, request, 400, 'INVALID_POS_MODIFIERS', 'Choose the required number of options for each modifier group.');
          }
          const selectedOptions: Array<Record<string, unknown>> = [];
          for (const optionId of optionIds) {
            const option = options.find((candidate: any) => String(candidate.id) === optionId);
            const priceDeltaMinor = Number(option?.priceDeltaMinor);
            if (!option || !Number.isSafeInteger(priceDeltaMinor) || priceDeltaMinor < 0 || typeof option.name !== 'string') {
              await client.query('ROLLBACK'); return fail(reply, request, 400, 'INVALID_POS_MODIFIERS', 'A selected modifier option is invalid.');
            }
            modifierDelta += priceDeltaMinor;
            selectedOptions.push({ id: optionId, name: option.name, priceDeltaMinor });
          }
          if (selectedOptions.length) modifierSnapshot.push({ groupId, groupName: String(group.name), options: selectedOptions });
        }
      } else {
        if (!item.sourceVariantId) { await client.query('ROLLBACK'); return fail(reply, request, 400, 'POS_VARIANT_REQUIRED', 'Product and service lines require an active variant.'); }
        source = (await client.query(
          "SELECT p.id,p.name,p.kind,p.status AS product_status,p.store_id,v.id AS variant_id,v.sku,v.title AS variant_title,v.price_amount_minor AS amount_minor,v.currency,v.status AS variant_status,v.options FROM products p JOIN product_variants v ON v.product_id=p.id AND v.organization_id=p.organization_id WHERE p.id=$1 AND v.id=$2 AND p.organization_id=$3 AND p.store_id=$4 FOR SHARE OF p,v",
          [item.sourceItemId, item.sourceVariantId, organizationId, storeId]
        )).rows[0];
        const expectedKind = item.sourceType === 'service' ? 'service' : undefined;
        if (!source || source.product_status !== 'active' || source.variant_status !== 'active' || (expectedKind ? source.kind !== expectedKind : source.kind === 'service')) {
          await client.query('ROLLBACK'); return fail(reply, request, 400, 'INVALID_POS_ITEM', 'Every product or service line must reference an active variant of the expected type in this store.');
        }
      }
      const unitAmount = Number(source.amount_minor) + modifierDelta;
      const lineTotal = unitAmount * item.quantity;
      if (!Number.isSafeInteger(unitAmount) || !Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(subtotal + lineTotal)) {
        await client.query('ROLLBACK'); return fail(reply, request, 400, 'POS_AMOUNT_TOO_LARGE', 'The POS order exceeds the supported amount.');
      }
      if (String(source.currency).trim() !== currency) {
        await client.query('ROLLBACK'); return fail(reply, request, 400, 'POS_CURRENCY_MISMATCH', 'Every POS item must use the store currency.');
      }
      subtotal += lineTotal;
      lines.push({
        sourceType: item.sourceType, sourceItemId: item.sourceItemId,
        sourceVariantId: item.sourceVariantId ?? null,
        sourceMenuId: item.sourceType === 'menu_item' ? String(source.menu_id) : null,
        productId: item.sourceType === 'menu_item' ? null : String(source.id),
        sku: item.sourceType === 'menu_item' || !source.sku ? null : String(source.sku),
        variantTitle: item.sourceType === 'menu_item' ? 'Menu item' : String(source.variant_title),
        options: item.sourceType === 'menu_item' ? (modifierSnapshot.length ? { modifiers: modifierSnapshot } : {}) : (source.options ?? {}),
        name: item.sourceType === 'menu_item' ? String(source.name) : String(source.name) + (source.variant_title ? ' · ' + source.variant_title : ''),
        quantity: item.quantity, unitAmount, total: lineTotal, metadata: { ...(item.metadata ?? {}), ...(modifierSnapshot.length ? { modifierSnapshot } : {}) }
      });
    }
    const numberResult = await client.query('SELECT GREATEST(COALESCE((SELECT MAX(order_number) FROM orders WHERE organization_id=$1),0),COALESCE((SELECT MAX(order_number) FROM pos_orders WHERE organization_id=$1),0))+1 AS order_number', [organizationId]);
    const orderNumber = Number(numberResult.rows[0].order_number);
    const history = [{ status: 'confirmed', actorUserId: request.identity!.uid, at: now.toISOString() }];
    const canonicalMetadata = {
      channel: parsed.data.channel === 'qr' ? 'QR' : 'POS',
      posChannel: parsed.data.channel,
      posOrderId: orderId,
      fulfillment: parsed.data.fulfillment,
      tableLabel: parsed.data.tableLabel ?? null
    };
    await client.query(
      'INSERT INTO orders (id,organization_id,store_id,customer_id,order_number,status,payment_status,fulfillment_status,currency,subtotal_minor,discount_minor,tax_minor,shipping_minor,total_minor,customer_email,billing_address_snapshot,shipping_address_snapshot,notes,metadata,idempotency_key,placed_at,created_at,updated_at) VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,0,0,0,$9,NULL,NULL,NULL,$10,$11::jsonb,$12,$13,$13,$13)',
      [orderId, organizationId, storeId, orderNumber, 'confirmed', 'unpaid', 'unfulfilled', currency, subtotal, parsed.data.customerNote ?? null, JSON.stringify(canonicalMetadata), parsed.data.idempotencyKey ? 'pos:' + storeId + ':' + parsed.data.idempotencyKey : null, now]
    );
    await client.query(
      'INSERT INTO pos_orders (id,organization_id,store_id,session_id,order_number,status,channel,fulfillment,table_label,customer_note,currency,subtotal_minor,tax_minor,discount_minor,total_minor,created_by,status_history,idempotency_key,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,0,$12,$13,$14::jsonb,$15,$16,$16)',
      [orderId, organizationId, storeId, parsed.data.sessionId, orderNumber, 'confirmed', parsed.data.channel, parsed.data.fulfillment, parsed.data.tableLabel ?? null, parsed.data.customerNote ?? null, currency, subtotal, request.identity!.uid, JSON.stringify(history), parsed.data.idempotencyKey ?? null, now]
    );
    for (const line of lines) {
      await client.query(
        'INSERT INTO pos_order_lines (id,organization_id,order_id,source_type,source_item_id,source_variant_id,source_menu_id,name_snapshot,quantity,unit_amount_minor,line_total_minor,currency,metadata_snapshot,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)',
        [randomUUID(), organizationId, orderId, line.sourceType, line.sourceItemId, line.sourceVariantId, line.sourceMenuId, line.name, line.quantity, line.unitAmount, line.total, currency, JSON.stringify(line.metadata), now]
      );
      await client.query(
        'INSERT INTO order_items (id,organization_id,order_id,product_id,variant_id,sku_snapshot,product_name_snapshot,variant_title_snapshot,options_snapshot,quantity,unit_amount_minor,discount_minor,tax_minor,total_minor,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,0,0,$12,$13)',
        [randomUUID(), organizationId, orderId, line.productId, line.sourceVariantId, line.sku, line.name, line.variantTitle, JSON.stringify(line.options), line.quantity, line.unitAmount, line.total, now]
      );
    }
    await client.query(
      'INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,request_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
      [randomUUID(), organizationId, request.identity!.uid, 'pos.order_created', 'pos_order', orderId, request.id, JSON.stringify({ storeId, sessionId: parsed.data.sessionId, channel: parsed.data.channel, fulfillment: parsed.data.fulfillment, totalMinor: subtotal }), now]
    );
    await client.query('COMMIT');
    const result = await pool.query(posOrderProjection + ' WHERE o.id=$1 AND o.organization_id=$2 AND o.store_id=$3', [orderId, organizationId, storeId]);
    return reply.code(201).send({ data: camelize(result.rows[0]), requestId: request.id });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'POS_ORDER_CONFLICT', 'The POS order or idempotency key already exists.');
    throw error;
  } finally { client.release(); }
});

app.patch<{ Params: { organizationId: string; storeId: string; orderId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/stores/:storeId/pos/orders/:orderId/status', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId, orderId } = request.params;
  if (!await requirePosOperator(request, reply, organizationId)) return;
  const parsed = PosOrderStatusInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide a supported POS order status.');
  const client = await pool.connect();
  const now = new Date();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM pos_orders WHERE id=$1 AND organization_id=$2 AND store_id=$3 FOR UPDATE', [orderId, organizationId, storeId]);
    if (!result.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'POS_ORDER_NOT_FOUND', 'The POS order does not exist in this store.'); }
    const current = String(result.rows[0].status);
    const next = parsed.data.status;
    const allowed: Record<string, string[]> = { confirmed: ['preparing', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['completed', 'cancelled'], completed: [], cancelled: [] };
    if (!allowed[current]?.includes(next)) { await client.query('ROLLBACK'); return fail(reply, request, 409, 'INVALID_POS_STATUS_TRANSITION', 'The requested POS order status transition is not allowed.'); }
    if (next === 'cancelled') {
      const paymentTotals = await client.query(
        "SELECT COALESCE((SELECT SUM(amount_minor) FROM payments WHERE order_id=$1 AND organization_id=$2 AND status='succeeded'),0)::text AS captured,COALESCE((SELECT SUM(amount_minor) FROM refunds WHERE order_id=$1 AND organization_id=$2 AND status='recorded'),0)::text AS refunded",
        [orderId, organizationId]
      );
      if (Number(paymentTotals.rows[0]?.captured ?? 0) > Number(paymentTotals.rows[0]?.refunded ?? 0)) {
        await client.query('ROLLBACK');
        return fail(reply, request, 409, 'POS_REFUND_REQUIRED', 'Record a full refund for collected payments before cancelling this POS order.');
      }
    }
    const inventoryDeductions: Array<{ variantId: string; locationId: string; quantity: number }> = [];
    if (next === 'completed') {
      const lines = await client.query(
        "SELECT DISTINCT l.source_variant_id AS variant_id,l.quantity,p.kind FROM pos_order_lines l JOIN product_variants v ON v.id=l.source_variant_id AND v.organization_id=l.organization_id JOIN products p ON p.id=v.product_id AND p.organization_id=v.organization_id WHERE l.order_id=$1 AND l.organization_id=$2 AND l.source_type='product' AND p.kind IN ('physical','food')",
        [orderId, organizationId]
      );
      const session = await client.query('SELECT location_id FROM pos_sessions WHERE id=$1 AND organization_id=$2 AND store_id=$3', [result.rows[0].session_id, organizationId, storeId]);
      const locationId = session.rows[0]?.location_id ? String(session.rows[0].location_id) : null;
      for (const line of lines.rows) {
        const variantId = String(line.variant_id);
        const quantity = Number(line.quantity);
        const levels = await client.query(
          'SELECT location_id,quantity_on_hand,quantity_reserved FROM inventory_levels WHERE organization_id=$1 AND variant_id=$2 ORDER BY location_id FOR UPDATE',
          [organizationId, variantId]
        );
        if (!levels.rowCount) continue;
        if (!locationId) {
          await client.query('ROLLBACK');
          return fail(reply, request, 409, 'POS_INVENTORY_LOCATION_REQUIRED', 'Choose a stock location for this register before completing tracked inventory sales.');
        }
        const level = levels.rows.find((row) => String(row.location_id) === locationId);
        if (!level) {
          await client.query('ROLLBACK');
          return fail(reply, request, 409, 'POS_STOCK_NOT_AT_REGISTER_LOCATION', 'This item is tracked at another location. Transfer or assign stock to the register location before completing the sale.');
        }
        const available = Number(level.quantity_on_hand) - Number(level.quantity_reserved);
        if (!Number.isSafeInteger(quantity) || available < quantity) {
          await client.query('ROLLBACK');
          return fail(reply, request, 409, 'POS_INSUFFICIENT_STOCK', 'There is not enough available stock at this register location to complete the sale.');
        }
        await client.query(
          'UPDATE inventory_levels SET quantity_on_hand=quantity_on_hand-$1,updated_at=$2 WHERE organization_id=$3 AND location_id=$4 AND variant_id=$5',
          [quantity, now, organizationId, locationId, variantId]
        );
        inventoryDeductions.push({ variantId, locationId, quantity });
      }
    }
    const history = Array.isArray(result.rows[0].status_history) ? result.rows[0].status_history : [];
    history.push({ status: next, actorUserId: request.identity!.uid, at: now.toISOString(), ...(inventoryDeductions.length ? { inventoryDeductions } : {}) });
    const updated = await client.query('UPDATE pos_orders SET status=$1,status_history=$2::jsonb,updated_at=$3 WHERE id=$4 AND organization_id=$5 AND store_id=$6 RETURNING id', [next, JSON.stringify(history), now, orderId, organizationId, storeId]);
    const canonicalStatus = next === 'preparing' || next === 'ready' ? 'processing' : next;
    await client.query(
      "UPDATE orders SET status=CASE WHEN status='refunded' THEN status ELSE $1 END,fulfillment_status=CASE WHEN $2 THEN 'fulfilled' ELSE fulfillment_status END,updated_at=$3 WHERE id=$4 AND organization_id=$5",
      [canonicalStatus, next === 'completed', now, orderId, organizationId]
    );
    await client.query(
      'INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,request_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
      [randomUUID(), organizationId, request.identity!.uid, 'pos.order_status_changed', 'pos_order', orderId, request.id, JSON.stringify({ from: current, to: next, inventoryDeductions }), now]
    );
    await client.query('COMMIT');
    const order = await pool.query(posOrderProjection + ' WHERE o.id=$1 AND o.organization_id=$2 AND o.store_id=$3', [updated.rows[0].id, organizationId, storeId]);
    return { data: camelize(order.rows[0]), requestId: request.id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
});

const RefundInput = z.object({
  paymentId: z.string().trim().min(1).max(100),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  reason: z.string().trim().max(1000).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional()
}).strict();

app.get<{ Params: { organizationId: string; orderId: string } }>('/api/v1/organizations/:organizationId/orders/:orderId/refunds', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, orderId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const order = await pool.query('SELECT id FROM orders WHERE id=$1 AND organization_id=$2', [orderId, organizationId]);
  if (!order.rowCount) return fail(reply, request, 404, 'ORDER_NOT_FOUND', 'The order does not exist in this organization.');
  const refunds = await pool.query(
    "SELECT id,order_id,payment_id,amount_minor,currency,reason,status,recorded_by,idempotency_key,created_at FROM refunds WHERE order_id=$1 AND organization_id=$2 ORDER BY created_at DESC",
    [orderId, organizationId]
  );
  return { data: camelize(refunds.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string; orderId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/orders/:orderId/refunds', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, orderId } = request.params;
  if (!await requireManagerRole(request, reply, organizationId)) return;
  const roleResult = await pool.query('SELECT role FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status=$3', [organizationId, request.identity!.uid, 'active']);
  if (!['owner', 'admin', 'manager'].includes(String(roleResult.rows[0]?.role ?? ''))) {
    return fail(reply, request, 403, 'REFUND_PERMISSION_DENIED', 'Only organization owners, admins, or managers can record refunds.');
  }
  const parsed = RefundInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide a payment ID, positive refund amount in minor currency units, and optional reason/idempotency key.');
  const client = await pool.connect();
  const now = new Date();
  const refundId = randomUUID();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      'SELECT id,total_minor,currency,status FROM orders WHERE id=$1 AND organization_id=$2 FOR UPDATE',
      [orderId, organizationId]
    );
    if (!orderResult.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'ORDER_NOT_FOUND', 'The order does not exist in this organization.'); }
    const order = orderResult.rows[0];
    if (String(order.status) === 'cancelled') {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'ORDER_NOT_REFUNDABLE', 'Cancelled orders cannot be refunded through this endpoint.');
    }
    if (parsed.data.idempotencyKey) {
      const existing = await client.query(
        'SELECT id,order_id,payment_id,amount_minor,currency,reason,status,recorded_by,idempotency_key,created_at FROM refunds WHERE organization_id=$1 AND idempotency_key=$2',
        [organizationId, parsed.data.idempotencyKey]
      );
      if (existing.rowCount) {
        if (String(existing.rows[0].order_id) !== orderId || String(existing.rows[0].payment_id) !== parsed.data.paymentId || Number(existing.rows[0].amount_minor) !== parsed.data.amountMinor) {
          await client.query('ROLLBACK');
          return fail(reply, request, 409, 'REFUND_CONFLICT', 'This idempotency key was already used for a different refund.');
        }
        await client.query('COMMIT');
        return { data: camelize(existing.rows[0]), requestId: request.id };
      }
    }
    const paymentResult = await client.query(
      "SELECT id,amount_minor,currency,status FROM payments WHERE id=$1 AND order_id=$2 AND organization_id=$3 FOR UPDATE",
      [parsed.data.paymentId, orderId, organizationId]
    );
    if (!paymentResult.rowCount) {
      await client.query('ROLLBACK');
      return fail(reply, request, 404, 'PAYMENT_NOT_FOUND', 'The payment does not exist for this order.');
    }
    const payment = paymentResult.rows[0];
    if (String(payment.status) !== 'succeeded') {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'PAYMENT_NOT_REFUNDABLE', 'Only successfully recorded payments can be refunded.');
    }
    const refundedResult = await client.query(
      "SELECT COALESCE(SUM(amount_minor),0)::text AS amount FROM refunds WHERE payment_id=$1 AND organization_id=$2 AND status='recorded'",
      [parsed.data.paymentId, organizationId]
    );
    const alreadyRefunded = Number(refundedResult.rows[0]?.amount ?? 0);
    const captured = Number(payment.amount_minor);
    if (!Number.isSafeInteger(captured) || parsed.data.amountMinor > captured - alreadyRefunded) {
      await client.query('ROLLBACK');
      return fail(reply, request, 409, 'REFUND_EXCEEDS_REMAINING_AMOUNT', 'The refund amount exceeds the payment amount that remains refundable.');
    }
    const currency = String(payment.currency).trim();
    const inserted = await client.query(
      'INSERT INTO refunds (id,organization_id,order_id,payment_id,amount_minor,currency,reason,idempotency_key,status,recorded_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,order_id,payment_id,amount_minor,currency,reason,status,recorded_by,idempotency_key,created_at',
      [refundId, organizationId, orderId, parsed.data.paymentId, parsed.data.amountMinor, currency, parsed.data.reason ?? null, parsed.data.idempotencyKey ?? null, 'recorded', request.identity!.uid, now]
    );
    const allTotals = await client.query(
      "SELECT COALESCE((SELECT SUM(amount_minor) FROM payments WHERE order_id=$1 AND organization_id=$2 AND status='succeeded'),0)::text AS captured, COALESCE((SELECT SUM(amount_minor) FROM refunds WHERE order_id=$1 AND organization_id=$2 AND status='recorded'),0)::text AS refunded",
      [orderId, organizationId]
    );
    const totalCaptured = Number(allTotals.rows[0]?.captured ?? 0);
    const totalRefunded = Number(allTotals.rows[0]?.refunded ?? 0);
    const paymentStatus = totalCaptured > 0 && totalRefunded >= totalCaptured ? 'refunded' : totalRefunded > 0 ? 'partially_refunded' : 'paid';
    await client.query(
      "UPDATE orders SET payment_status=$1,status=CASE WHEN $1='refunded' THEN 'refunded' ELSE status END,updated_at=$2 WHERE id=$3 AND organization_id=$4",
      [paymentStatus, now, orderId, organizationId]
    );
    await client.query(
      'INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,request_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
      [randomUUID(), organizationId, request.identity!.uid, 'order.refund_recorded', 'refund', refundId, request.id, JSON.stringify({ orderId, paymentId: parsed.data.paymentId, amountMinor: parsed.data.amountMinor, currency, reason: parsed.data.reason ?? null, paymentStatus }), now]
    );
    await client.query('COMMIT');
    return reply.code(201).send({ data: { ...camelize(inserted.rows[0]) as Record<string, unknown>, paymentStatus, totalCapturedMinor: totalCaptured, totalRefundedMinor: totalRefunded, remainingCapturedMinor: Math.max(0, totalCaptured - totalRefunded), processing: 'manual_record_only' }, requestId: request.id });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'REFUND_CONFLICT', 'This refund or idempotency key has already been recorded.');
    throw error;
  } finally { client.release(); }
});


const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';
await app.listen({ port, host });
