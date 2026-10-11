import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const baseUrl = process.env.DOLLAREUS_SMOKE_URL ?? 'http://127.0.0.1:3000';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const token = randomUUID() + randomUUID();
const userId = randomUUID();
const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
let organizationId = null;
let signupUserId = null;

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

  const signupEmail = `signup-${suffix}@example.test`;
  const signupPassword = 'Dollareus-Smoke-2026!';
  const signup = await request('/api/v1/auth/register', 201, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: signupEmail, password: signupPassword, displayName: 'Signup Smoke Test' })
  });
  signupUserId = signup.payload?.data?.id;
  if (!signupUserId || signup.payload?.data?.email !== signupEmail || !signup.response.headers.get('set-cookie')?.includes('dollareus_session=')) {
    throw new Error('Signup did not create an account and issue a session cookie without email-provider configuration.');
  }
  const signupCookie = signup.response.headers.get('set-cookie')?.match(/dollareus_session=([^;]+)/)?.[1];
  if (!signupCookie) throw new Error('Signup session cookie was not present.');
  const signupSession = await request('/api/v1/auth/session', 200, { headers: { cookie: `dollareus_session=${signupCookie}` } });
  if (signupSession.payload?.data?.id !== signupUserId) throw new Error('The session created during signup is not valid.');
  await request('/api/v1/auth/logout', 200, { method: 'POST', headers: { cookie: `dollareus_session=${signupCookie}` } });
  const login = await request('/api/v1/auth/login', 200, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: signupEmail, password: signupPassword })
  });
  if (!login.response.headers.get('set-cookie')?.includes('dollareus_session=')) throw new Error('Login did not issue a session cookie.');
  checks.push('signup, session cookie, logout, and login without email-provider configuration');

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

  const menu = await request(`/api/v1/organizations/${organizationId}/menus`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ storeId, slug: `smoke-menu-${suffix}`, name: 'Smoke Menu', description: null, servicePeriods: ['lunch', 'dinner'], status: 'draft', position: 0 })
  });
  const menuItem = await request(`/api/v1/organizations/${organizationId}/menus/${menu.payload?.data?.id}/items`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ slug: `smoke-dish-${suffix}`, name: 'Smoke Dish', description: null, priceAmountMinor: 4500, currency: 'MAD', status: 'active', categoryId: null, allergens: [], dietaryLabels: ['vegetarian'], availability: 'available', position: 0, metadata: {} })
  });
  const menuItems = await request(`/api/v1/organizations/${organizationId}/menus/${menu.payload?.data?.id}/items`, 200, { headers: authHeaders });
  if (!menuItems.payload?.data?.some((item) => item.id === menuItem.payload?.data?.id)) throw new Error('Restaurant menu item did not persist.');
  const entryPoint = await request(`/api/v1/organizations/${organizationId}/entry-points`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ storeId, type: 'qr', targetPath: '/menu' })
  });
  const entryPoints = await request(`/api/v1/organizations/${organizationId}/stores/${storeId}/entry-points`, 200, { headers: authHeaders });
  if (!entryPoints.payload?.data?.some((item) => item.id === entryPoint.payload?.data?.id)) throw new Error('QR entry point did not persist.');
  checks.push('restaurant menus, menu items, and managed QR entry points');

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

  const category = await request(`/api/v1/organizations/${organizationId}/categories`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ storeId, name: 'Accessories', slug: `accessories-${suffix}`, description: null, position: 0, status: 'active' })
  });
  const categories = await request(`/api/v1/organizations/${organizationId}/stores/${storeId}/categories`, 200, { headers: authHeaders });
  if (!categories.payload?.data?.some((item) => item.id === category.payload?.data?.id)) throw new Error('Category did not persist.');
  checks.push('category create and listing');

  const customer = await request(`/api/v1/organizations/${organizationId}/customers`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ displayName: 'Smoke Customer', email: `customer-${suffix}@example.test`, phone: null, firstName: 'Smoke', lastName: 'Customer', notes: null, metadata: {} })
  });
  const customers = await request(`/api/v1/organizations/${organizationId}/customers`, 200, { headers: authHeaders });
  if (!customers.payload?.data?.some((item) => item.id === customer.payload?.data?.id)) throw new Error('Customer did not persist.');
  checks.push('customer create and listing');

  const location = await request(`/api/v1/organizations/${organizationId}/inventory/locations`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ storeId, name: 'Main stockroom' })
  });
  const variantId = product.payload?.data?.variants?.[0]?.id;
  if (!variantId) throw new Error('Product creation did not return its variant id.');
  await request(`/api/v1/organizations/${organizationId}/inventory/levels`, 200, {
    method: 'PUT', headers: authHeaders,
    body: JSON.stringify({ locationId: location.payload?.data?.id, variantId, quantityOnHand: 12, reorderPoint: 3 })
  });
  const inventory = await request(`/api/v1/organizations/${organizationId}/inventory`, 200, { headers: authHeaders });
  if (!inventory.payload?.data?.some((item) => item.variantId === variantId && Number(item.quantityOnHand) === 12)) throw new Error('Inventory adjustment did not persist.');
  checks.push('inventory locations and guarded stock levels');

  const activeProduct = await request(`/api/v1/organizations/${organizationId}/products`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({
      storeId, slug: `order-product-${suffix}`, name: 'Orderable Smoke Product',
      description: null, status: 'active', kind: 'physical', availabilityStatus: 'available',
      availabilityNote: null, attributes: {}, categoryIds: [],
      variants: [{ id: `order-variant-${suffix}`, sku: `ORDER-${suffix}`, title: 'Standard', options: {}, amountMinor: 1299, currency: 'MAD', status: 'active', barcode: null, weightGrams: null, metadata: {} }]
    })
  });
  const orderPayload = { storeId, customerId: customer.payload?.data?.id, notes: 'Smoke test order', idempotencyKey: `smoke-order-${suffix}`, items: [{ variantId: activeProduct.payload?.data?.variants?.[0]?.id, quantity: 2 }] };
  const order = await request(`/api/v1/organizations/${organizationId}/orders`, 201, { method: 'POST', headers: authHeaders, body: JSON.stringify(orderPayload) });
  if (Number(order.payload?.data?.totalMinor) !== 2598 || order.payload?.data?.status !== 'pending' || order.payload?.data?.items?.length !== 1) throw new Error('Order totals or immutable item snapshots are incorrect.');
  const replay = await request(`/api/v1/organizations/${organizationId}/orders`, 200, { method: 'POST', headers: authHeaders, body: JSON.stringify(orderPayload) });
  if (replay.payload?.data?.id !== order.payload?.data?.id) throw new Error('Order idempotency key did not return the existing order.');
  const orders = await request(`/api/v1/organizations/${organizationId}/orders`, 200, { headers: authHeaders });
  if (!orders.payload?.data?.some((item) => item.id === order.payload?.data?.id)) throw new Error('Created order did not appear in order listing.');
  checks.push('server-priced order creation, snapshots, idempotency and listing');

  const variantIdForPatch = product.payload?.data?.variants?.[0]?.id;
  if (!variantIdForPatch) throw new Error('Product creation did not return its variant id.');
  const updated = await request(`/api/v1/organizations/${organizationId}/products/${createdProductId}`, 200, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({
      name: 'Updated CI Smoke Product', status: 'archived',
      variant: { id: variantIdForPatch, sku: `SMOKE-UPDATED-${suffix}`, title: 'Updated CI Smoke Product', amountMinor: 2499, currency: 'MAD' }
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
  await request(`/api/v1/public/stores/smoke-store-${suffix}/menus`, 404);
  await request(`/api/v1/public/entry-points/${entryPoint.payload?.data?.id}`, 404);
  checks.push('unpublished stores and their QR entry points stay private');

  console.log(`API integration smoke checks passed (${checks.length} checks):`);
  for (const check of checks) console.log(`  ✓ ${check}`);
} finally {
  if (organizationId) {
    await pool.query('DELETE FROM order_items WHERE organization_id=$1', [organizationId]).catch(() => undefined);
    await pool.query('DELETE FROM orders WHERE organization_id=$1', [organizationId]).catch(() => undefined);
    await pool.query('DELETE FROM customers WHERE organization_id=$1', [organizationId]).catch(() => undefined);
    await pool.query('DELETE FROM organizations WHERE id=$1', [organizationId]).catch(() => undefined);
  }
  if (signupUserId) await pool.query('DELETE FROM users WHERE id=$1', [signupUserId]).catch(() => undefined);
  await pool.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => undefined);
  await pool.end();
}
