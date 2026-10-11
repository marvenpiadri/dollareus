import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from './db/pool.js';
import { authenticate, registerAuthRoutes } from './auth.js';

const app = Fastify({ logger: true, trustProxy: process.env.NODE_ENV === 'production', bodyLimit: 1_048_576, genReqId: () => randomUUID() });
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200').split(',').map((origin) => origin.trim()).filter(Boolean);

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
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
await registerAuthRoutes(app);

app.setErrorHandler((error, request, reply) => {
  const normalized = error instanceof Error ? error : new Error('Unknown request error');
  request.log.error({ err: normalized }, 'Request failed');
  const candidate = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
  const statusCode = typeof candidate === 'number' && candidate >= 400 && candidate < 600 ? candidate : 500;
  return reply.code(statusCode).send({ error: { code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR', message: statusCode >= 500 ? 'An unexpected error occurred.' : normalized.message, requestId: request.id } });
});

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
const ProductPatchInput = z.object({
  slug: Slug.optional(), name: z.string().trim().min(1).max(180).optional(),
  description: z.string().max(10000).nullable().optional(), status: z.enum(['draft', 'active', 'archived']).optional(),
  variant: z.object({
    id: z.string().min(1).max(100), sku: z.string().max(100).nullable(), title: z.string().trim().min(1).max(180),
    amountMinor: z.number().int().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/)
  }).strict().optional()
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'At least one product field must be provided.' });

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

app.patch<{ Params: { organizationId: string; productId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/products/:productId', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, productId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const parsed = ProductPatchInput.safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'Provide at least one valid product field.');
  const client = await pool.connect();
  const now = new Date();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ slug: string; name: string; description: string | null; status: string }>(
      'SELECT slug, name, description, status FROM products WHERE id=$1 AND organization_id=$2 FOR UPDATE',
      [productId, organizationId]
    );
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return fail(reply, request, 404, 'PRODUCT_NOT_FOUND', 'The product does not exist in this organization.');
    }
    const current = existing.rows[0]!;
    const slug = parsed.data.slug ?? current.slug;
    const name = parsed.data.name ?? current.name;
    const description = parsed.data.description === undefined ? current.description : parsed.data.description;
    const status = parsed.data.status ?? current.status;
    await client.query(
      'UPDATE products SET slug=$1,name=$2,description=$3,status=$4,updated_by=$5,updated_at=$6 WHERE id=$7 AND organization_id=$8',
      [slug, name, description, status, request.identity!.uid, now, productId, organizationId]
    );
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
  if (!await requireMembership(request, reply, organizationId)) return;
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
  if (!await requireMembership(request, reply, organizationId)) return;
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
  if (!await requireMembership(request, reply, organizationId)) return;
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

app.get<{ Params: { organizationId: string }; Querystring: { limit?: string } }>('/api/v1/organizations/:organizationId/orders', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const parsedLimit = Number.parseInt(request.query.limit ?? '50', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 50;
  const result = await pool.query(
    "SELECT o.*, CASE WHEN o.payment_status='paid' THEN 'paid' WHEN COALESCE((SELECT SUM(p.amount_minor) FROM payments p WHERE p.order_id=o.id AND p.organization_id=o.organization_id AND p.status='succeeded'),0)>0 THEN 'partially_paid' ELSE o.payment_status END AS effective_payment_status, COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'variantId',i.variant_id,'sku',i.sku_snapshot,'productName',i.product_name_snapshot,'variantTitle',i.variant_title_snapshot,'options',i.options_snapshot,'quantity',i.quantity,'unitAmountMinor',i.unit_amount_minor,'totalMinor',i.total_minor) ORDER BY i.created_at) FROM order_items i WHERE i.order_id=o.id), '[]'::jsonb) AS items FROM orders o WHERE o.organization_id=$1 ORDER BY o.created_at DESC LIMIT $2",
    [organizationId, limit]
  );
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/orders', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
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
const MenuItemInput = z.object({
  slug: Slug, name: z.string().trim().min(1).max(180), description: z.string().max(5000).nullable().optional(),
  priceAmountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(['draft', 'active', 'archived']), categoryId: z.string().min(1).max(100).nullable().optional(),
  allergens: z.array(z.string().trim().min(1).max(80)).max(50), dietaryLabels: z.array(z.string().trim().min(1).max(80)).max(50),
  availability: z.enum(['available', 'unavailable', 'limited']), position: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict();
const EntryPointInput = z.object({
  storeId: z.string().min(1).max(100), type: z.enum(['direct-link', 'qr', 'embed']),
  targetPath: z.enum(['/', '/menu', '/catalog', '/services'])
}).strict();

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
  const menu = await pool.query('SELECT id FROM restaurant_menus WHERE id=$1 AND organization_id=$2', [menuId, organizationId]);
  if (!menu.rowCount) return fail(reply, request, 404, 'MENU_NOT_FOUND', 'The selected menu does not exist in this organization.');
  const result = await pool.query('SELECT * FROM restaurant_menu_items WHERE menu_id=$1 AND organization_id=$2 ORDER BY position,name LIMIT 500', [menuId, organizationId]);
  return { data: camelize(result.rows), requestId: request.id };
});

app.post<{ Params: { organizationId: string; menuId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/menus/:menuId/items', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, menuId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
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
      [randomUUID(), organizationId, menu.rows[0].store_id, menuId, parsed.data.slug, parsed.data.name, parsed.data.description ?? null, parsed.data.priceAmountMinor, parsed.data.currency, parsed.data.status, parsed.data.categoryId ?? null, parsed.data.allergens, parsed.data.dietaryLabels, parsed.data.availability, parsed.data.position ?? 0, JSON.stringify(parsed.data.metadata ?? {}), now]
    );
    return reply.code(201).send({ data: camelize(result.rows[0]), requestId: request.id });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return fail(reply, request, 409, 'MENU_ITEM_SLUG_TAKEN', 'A menu item with this slug already exists in the selected menu.');
    throw error;
  }
});

app.get<{ Params: { storeSlug: string } }>('/api/v1/public/stores/:storeSlug/menus', async (request, reply) => {
  const store = await pool.query('SELECT s.id,s.organization_id FROM stores s JOIN store_frontends f ON f.store_id=s.id WHERE s.slug=$1 AND s.status=$2 AND f.published=true LIMIT 1', [request.params.storeSlug, 'active']);
  if (!store.rowCount) return fail(reply, request, 404, 'STORE_NOT_FOUND', 'The published store does not exist.');
  const result = await pool.query(
    "SELECT m.id,m.slug,m.name,m.description,m.service_periods,m.position,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'slug',i.slug,'name',i.name,'description',i.description,'priceAmountMinor',i.price_amount_minor,'currency',i.currency,'categoryId',i.category_id,'allergens',i.allergens,'dietaryLabels',i.dietary_labels,'availability',i.availability ,'position',i.position) ORDER BY i.position,i.name) FROM restaurant_menu_items i WHERE i.menu_id=m.id AND i.organization_id=m.organization_id AND i.status='active' AND i.availability<>'unavailable'), '[]'::jsonb) AS items FROM restaurant_menus m WHERE m.store_id=$1 AND m.organization_id=$2 AND m.status='active' ORDER BY m.position,m.name",
    [store.rows[0].id, store.rows[0].organization_id]
  );
  return { data: camelize(result.rows), requestId: request.id };
});

app.get<{ Params: { organizationId: string; storeId: string } }>('/api/v1/organizations/:organizationId/stores/:storeId/entry-points', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, storeId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const result = await pool.query('SELECT id,organization_id,store_id,type,target_path,status,created_by,created_at,updated_at FROM entry_points WHERE organization_id=$1 AND store_id=$2 ORDER BY created_at DESC LIMIT 200', [organizationId, storeId]);
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
  const result = await pool.query('INSERT INTO entry_points (id,organization_id,store_id,type,target_path,status,created_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id,organization_id,store_id,type,target_path,status,created_by,created_at,updated_at', [randomUUID(), organizationId, parsed.data.storeId, parsed.data.type, parsed.data.targetPath, 'active', request.identity!.uid, now]);
  return reply.code(201).send({ data: camelize(result.rows[0]), requestId: request.id });
});

app.patch<{ Params: { organizationId: string; entryPointId: string }; Body: unknown }>('/api/v1/organizations/:organizationId/entry-points/:entryPointId', { preHandler: authenticate }, async (request, reply) => {
  const { organizationId, entryPointId } = request.params;
  if (!await requireMembership(request, reply, organizationId)) return;
  const parsed = z.object({ status: z.enum(['active', 'disabled']) }).strict().safeParse(request.body);
  if (!parsed.success) return fail(reply, request, 400, 'VALIDATION_ERROR', 'The entry-point status is invalid.');
  const result = await pool.query('UPDATE entry_points SET status=$1,updated_at=$2 WHERE id=$3 AND organization_id=$4 RETURNING id,organization_id,store_id,type,target_path,status,created_by,created_at,updated_at', [parsed.data.status, new Date(), entryPointId, organizationId]);
  if (!result.rowCount) return fail(reply, request, 404, 'ENTRY_POINT_NOT_FOUND', 'The entry point does not exist in this organization.');
  return { data: camelize(result.rows[0]), requestId: request.id };
});

app.get<{ Params: { entryPointId: string } }>('/api/v1/public/entry-points/:entryPointId', async (request, reply) => {
  const result = await pool.query(
    "SELECT e.id,e.type,e.target_path,s.slug AS store_slug,s.name AS store_name FROM entry_points e JOIN stores s ON s.id=e.store_id AND s.organization_id=e.organization_id JOIN store_frontends f ON f.store_id=s.id WHERE e.id=$1 AND e.status='active' AND s.status='active' AND f.published=true LIMIT 1",
    [request.params.entryPointId]
  );
  if (!result.rowCount) return fail(reply, request, 404, 'ENTRY_POINT_NOT_FOUND', 'The published entry point does not exist.');
  const row = result.rows[0];
  return { data: { id: row.id, type: row.type, targetPath: row.target_path, storeSlug: row.store_slug, storeName: row.store_name, targetUrlPath: row.target_path === '/' ? '/' + row.store_slug : '/' + row.store_slug + row.target_path }, requestId: request.id };
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
  if (!await requireMembership(request, reply, organizationId)) return;
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
  if (!await requireMembership(request, reply, organizationId)) return;
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

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';
await app.listen({ port, host });
