import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const baseUrl = process.env.DOLLAREUS_SMOKE_URL ?? 'http://127.0.0.1:3000';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const token = randomUUID() + randomUUID();
const userId = randomUUID();
const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
let organizationId = null;

async function request(path, expectedStatus, init = {}) {
  const response = await fetch(new URL(path, baseUrl), init);
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { /* Include raw response in the assertion below. */ }
  if (response.status !== expectedStatus) {
    throw new Error(`${init.method ?? 'GET'} ${path}: expected HTTP ${expectedStatus}, received ${response.status}. Body: ${text.slice(0, 500)}`);
  }
  return { response, payload };
}

const checks = [];
try {
  const health = await request('/api/v1/health', 200);
  if (health.payload?.data?.status !== 'ok') throw new Error('Health endpoint did not return status=ok.');
  checks.push('health');

  await request('/api/v1/auth/session', 401);
  await request('/api/v1/organizations', 401);
  checks.push('unauthenticated access is rejected');

  const now = new Date();
  await pool.query(
    'INSERT INTO users (id,email,email_verified_at,display_name,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)',
    [userId, `smoke-${suffix}@example.test`, now, 'CI Smoke Test', 'active', now]
  );
  await pool.query(
    'INSERT INTO auth_sessions (id,user_id,token_hash,created_at,last_seen_at,expires_at) VALUES ($1,$2,$3,$4,$4,$5)',
    [randomUUID(), userId, createHash('sha256').update(token).digest('hex'), now, new Date(now.getTime() + 60_000)]
  );
  const authHeaders = { cookie: `dollareus_session=${token}`, 'content-type': 'application/json' };

  const session = await request('/api/v1/auth/session', 200, { headers: authHeaders });
  if (session.payload?.data?.id !== userId) throw new Error('Authenticated session did not return the seeded user.');
  checks.push('session authentication');

  const organization = await request('/api/v1/organizations', 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ name: 'CI Smoke Workspace', slug: `smoke-${suffix}` })
  });
  organizationId = organization.payload?.data?.id;
  if (!organizationId) throw new Error('Organization creation did not return an id.');
  checks.push('organization creation');

  const store = await request(`/api/v1/organizations/${organizationId}/stores`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({
      name: 'CI Smoke Store', slug: `smoke-store-${suffix}`, description: null,
      businessType: 'general', status: 'active', currency: 'MAD', locale: 'en',
      timeZone: 'Africa/Casablanca', defaultExperience: 'commerce',
      enabledExperiences: ['commerce'], published: false, theme: {}
    })
  });
  const storeId = store.payload?.data?.id;
  if (!storeId) throw new Error('Store creation did not return an id.');
  checks.push('store creation');

  const productId = `product-${suffix}`;
  const product = await request(`/api/v1/organizations/${organizationId}/products`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({
      storeId, slug: `smoke-product-${suffix}`, name: 'CI Smoke Product',
      description: 'Created by the API smoke test.', status: 'draft', kind: 'physical',
      availabilityStatus: 'available', availabilityNote: null, attributes: {}, categoryIds: [],
      variants: [{
        id: `variant-${suffix}`, sku: `SMOKE-${suffix}`, title: 'Standard',
        options: {}, amountMinor: 1299, currency: 'MAD', status: 'active',
        barcode: null, weightGrams: null, metadata: {}
      }]
    })
  });
  const createdProductId = product.payload?.data?.id;
  if (!createdProductId) throw new Error('Product creation did not return an id.');
  checks.push('product creation');

  const listed = await request(`/api/v1/organizations/${organizationId}/products`, 200, { headers: authHeaders });
  if (!Array.isArray(listed.payload?.data) || !listed.payload.data.some((item) => item.id === createdProductId)) {
    throw new Error('The created product was not returned by the catalog endpoint.');
  }
  checks.push('product listing');

  const variantId = product.payload?.data?.variants?.[0]?.id;
  if (!variantId) throw new Error('Product creation did not return its variant id.');
  const updated = await request(`/api/v1/organizations/${organizationId}/products/${createdProductId}`, 200, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({
      name: 'Updated CI Smoke Product', status: 'archived',
      variant: { id: variantId, sku: `SMOKE-UPDATED-${suffix}`, title: 'Updated CI Smoke Product', amountMinor: 2499, currency: 'MAD' }
    })
  });
  const updatedVariant = updated.payload?.data?.variants?.[0];
  if (updated.payload?.data?.name !== 'Updated CI Smoke Product' || updated.payload?.data?.status !== 'archived'
      || Number(updatedVariant?.amountMinor) !== 2499 || updatedVariant?.sku !== `SMOKE-UPDATED-${suffix}`) {
    throw new Error('Product details, variant price/SKU, or archived status did not persist.');
  }
  checks.push('product details, default variant price/SKU, and archive');

  await request(`/api/v1/public/stores/smoke-store-${suffix}`, 404);
  await request(`/api/v1/public/stores/smoke-store-${suffix}/catalog`, 404);
  checks.push('unpublished stores stay private');

  console.log(`API integration smoke checks passed (${checks.length} checks):`);
  for (const check of checks) console.log(`  ✓ ${check}`);
} finally {
  if (organizationId) await pool.query('DELETE FROM organizations WHERE id=$1', [organizationId]).catch(() => undefined);
  await pool.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => undefined);
  await pool.end();
}
