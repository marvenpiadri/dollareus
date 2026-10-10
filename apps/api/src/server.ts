import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from './db/pool.js';

declare module 'fastify' {
  interface FastifyRequest { identity: DecodedIdToken | null; }
}

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required for identity verification.');
if (getApps().length === 0) initializeApp({ projectId });

const app = Fastify({ logger: true, trustProxy: process.env.NODE_ENV === 'production', bodyLimit: 1_048_576, genReqId: () => randomUUID() });
app.decorateRequest('identity', null);
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200').split(',').map((origin) => origin.trim()).filter(Boolean);

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, { origin: allowedOrigins, credentials: true });
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

app.setErrorHandler((error, request, reply) => {
  const normalized = error instanceof Error ? error : new Error('Unknown request error');
  request.log.error({ err: normalized }, 'Request failed');
  const candidate = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
  const statusCode = typeof candidate === 'number' && candidate >= 400 && candidate < 600 ? candidate : 500;
  return reply.code(statusCode).send({ error: { code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR', message: statusCode >= 500 ? 'An unexpected error occurred.' : normalized.message, requestId: request.id } });
});

async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    await reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'A valid bearer token is required.', requestId: request.id } });
    return;
  }
  try { request.identity = await getAuth().verifyIdToken(authorization.slice(7), true); }
  catch { await reply.code(401).send({ error: { code: 'INVALID_TOKEN', message: 'The session token is invalid or expired.', requestId: request.id } }); }
}

async function requireMembership(request: FastifyRequest, reply: FastifyReply, organizationId: string): Promise<boolean> {
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

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()), camelize(item)]));
  }
  return value;
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

app.get('/health', async () => ({ status: 'ok', service: 'dollareus-api' }));
app.get('/api/v1/health', async (request) => ({ data: { status: 'ok', service: 'dollareus-api', version: '0.2.0' }, requestId: request.id }));

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
    'SELECT p.*, COALESCE((SELECT jsonb_agg(jsonb_build_object(\'id\',v.id,\'sku\',v.sku,\'title\',v.title,\'options\',v.options,\'amountMinor\',v.price_amount_minor,\'currency\',v.currency,\'status\',v.status,\'barcode\',v.barcode,\'weightGrams\',v.weight_grams,\'metadata\',v.metadata) ORDER BY v.created_at) FROM product_variants v WHERE v.product_id=p.id), \'[]\'::jsonb) AS variants FROM products p WHERE p.organization_id=$1 ORDER BY p.updated_at DESC LIMIT $2',
    [organizationId, limit]
  );
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/products', { preHandler: authenticate }, async (request, reply) => {
  const organizationId = request.params.organizationId;
  if (!await requireMembership(request, reply, organizationId)) return;
  const parsed = ProductInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The product payload is invalid.');
  const client = await pool.connect();
  const productId = randomUUID();
  const now = new Date();
  try {
    await client.query('BEGIN');
    const store = await client.query('SELECT id FROM stores WHERE id=$1 AND organization_id=$2 FOR SHARE', [parsed.data.storeId, organizationId]);
    if (!store.rowCount) { await client.query('ROLLBACK'); return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The selected store does not exist in this organization.'); }
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

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/stores', { preHandler: authenticate }, async (request, reply) => {
  const organizationId = request.params.organizationId;
  if (!await requireMembership(request, reply, organizationId)) return;
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

app.get<{ Params: { storeSlug: string } }>('/api/v1/public/stores/:storeSlug', async (request, reply) => {
  const result = await pool.query('SELECT s.id,s.name,s.description,s.slug,s.business_type,s.default_currency,s.locale,s.time_zone,f.default_experience,f.enabled_experiences,f.published,f.seo_title,f.seo_description,f.theme FROM stores s JOIN store_frontends f ON f.store_id=s.id WHERE s.slug=$1 AND s.status=$2 AND f.published=true LIMIT 1', [request.params.storeSlug, 'active']);
  if (!result.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The published store does not exist.');
  return { data: camelize(result.rows[0]), requestId: request.id };
});

app.get<{ Params: { storeSlug: string } }>('/api/v1/public/stores/:storeSlug/catalog', async (request, reply) => {
  const store = await pool.query('SELECT s.id,s.organization_id FROM stores s JOIN store_frontends f ON f.store_id=s.id WHERE s.slug=$1 AND s.status=$2 AND f.published=true LIMIT 1', [request.params.storeSlug, 'active']);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The published store does not exist.');
  const products = await pool.query('SELECT p.*, COALESCE((SELECT jsonb_agg(jsonb_build_object(\'id\',v.id,\'title\',v.title,\'options\',v.options,\'amountMinor\',v.price_amount_minor,\'currency\',v.currency) ORDER BY v.created_at) FROM product_variants v WHERE v.product_id=p.id AND v.status=$3), \'[]\'::jsonb) AS variants FROM products p WHERE p.organization_id=$1 AND p.store_id=$2 AND p.status=$3 ORDER BY p.updated_at DESC', [store.rows[0].organization_id, store.rows[0].id, 'active']);
  return { data: camelize(products.rows), requestId: request.id };
});

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';
await app.listen({ port, host });
