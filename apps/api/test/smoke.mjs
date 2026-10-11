import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const baseUrl = process.env.DOLLAREUS_SMOKE_URL ?? 'http://127.0.0.1:3000';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const token = randomUUID() + randomUUID();
const userId = randomUUID();
const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
let organizationId = null;
let viewerOrganizationId = null;
let signupUserId = null;
let viewerUserId = null;
let viewerToken = null;

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
  const authProviders = await request('/api/v1/auth/providers', 200);
  if (typeof authProviders.payload?.data?.emailFlows !== 'boolean' || typeof authProviders.payload?.data?.google !== 'boolean' || typeof authProviders.payload?.data?.facebook !== 'boolean') {
    throw new Error('Auth provider discovery did not return explicit configuration flags.');
  }
  checks.push('health and auth-provider discovery');

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
  const loginCookie = login.response.headers.get('set-cookie')?.match(/dollareus_session=([^;]+)/)?.[1];
  if (!loginCookie) throw new Error('Login session cookie was not present.');
  const loginSession = await request('/api/v1/auth/session', 200, { headers: { cookie: `dollareus_session=${loginCookie}` } });
  if (loginSession.payload?.data?.id !== signupUserId) throw new Error('Login did not create a valid session for the account.');
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
  const apiCredential = await request(`/api/v1/organizations/${organizationId}/api-credentials`, 201, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ name: 'CI read-only credential', scopes: ['read'] })
  });
  const rawApiToken = apiCredential.payload?.data?.token;
  const apiCredentialId = apiCredential.payload?.data?.id;
  if (!rawApiToken?.startsWith('dlr_live_') || !apiCredentialId) throw new Error('API credential creation did not return its one-time token and id.');
  const apiHeaders = { Authorization: `Bearer ${rawApiToken}` };
  await request(`/api/v1/organizations/${organizationId}/products`, 200, { headers: apiHeaders });
  await request(`/api/v1/organizations/${organizationId}/products`, 403, { method: 'POST', headers: apiHeaders, body: '{}' });
  await request(`/api/v1/organizations/${randomUUID()}/products`, 403, { headers: apiHeaders });
  await request(`/api/v1/organizations/${organizationId}/api-credentials/${apiCredentialId}`, 403, { method: 'DELETE', headers: apiHeaders });
  const usageEvents = await pool.query('SELECT count(*)::int AS count FROM api_usage_events WHERE credential_id=$1', [apiCredentialId]);
  if (Number(usageEvents.rows[0]?.count ?? 0) < 3) throw new Error('API credential usage was not metered.');
  await request(`/api/v1/organizations/${organizationId}/api-credentials/${apiCredentialId}`, 200, { method: 'DELETE', headers: authHeaders, body: JSON.stringify({}) });
  await request(`/api/v1/organizations/${organizationId}/products`, 401, { headers: apiHeaders });
  checks.push('organization-scoped developer API credentials, read/write scopes, usage metering and revocation');

  viewerUserId = randomUUID();
  viewerToken = randomUUID() + randomUUID();
  const viewerNow = new Date();
  await pool.query(
    'INSERT INTO users (id,email,display_name,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)',
    [viewerUserId, `viewer-${suffix}@example.test`, 'CI Viewer', 'active', viewerNow]
  );
  await pool.query(
    'INSERT INTO auth_sessions (id,user_id,token_hash,created_at,last_seen_at,expires_at) VALUES ($1,$2,$3,$4,$4,$5)',
    [randomUUID(), viewerUserId, createHash('sha256').update(viewerToken).digest('hex'), viewerNow, new Date(viewerNow.getTime() + 60_000)]
  );
  await pool.query(
    'INSERT INTO organization_memberships (organization_id,user_id,role,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)',
    [organizationId, viewerUserId, 'viewer', 'active', viewerNow]
  );
  const viewerHeaders = { cookie: `dollareus_session=${viewerToken}`, 'content-type': 'application/json' };
  const viewerSession = await request('/api/v1/auth/session', 200, { headers: viewerHeaders });
  if (viewerSession.payload?.data?.id !== viewerUserId) throw new Error('Viewer test account session was not valid.');
  await request(`/api/v1/organizations/${organizationId}/api-credentials`, 403, {
    method: 'POST', headers: viewerHeaders, body: JSON.stringify({ name: 'Viewer must not issue keys', scopes: ['read'] })
  });
  const viewerOrganization = await request('/api/v1/organizations', 201, {
    method: 'POST', headers: viewerHeaders,
    body: JSON.stringify({ name: 'CI Viewer Workspace', slug: `viewer-${suffix}` })
  });
  viewerOrganizationId = viewerOrganization.payload?.data?.id;
  if (!viewerOrganizationId) throw new Error('Viewer-owned organization was not created.');
  await request(`/api/v1/organizations/${viewerOrganizationId}/stores`, 403, { headers: authHeaders });
  checks.push('tenant isolation and authenticated viewer fixture');

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
  await request(`/api/v1/organizations/${organizationId}/stores/${storeId}/pos/sessions`, 403, {
    method: 'POST', headers: viewerHeaders,
    body: JSON.stringify({ label: 'Unauthorized register', terminalType: 'retail' })
  });
  checks.push('viewer role cannot open POS registers');
  checks.push('store creation');

  const menu = await request(`/api/v1/organizations/${organizationId}/menus`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ storeId, slug: `smoke-menu-${suffix}`, name: 'Smoke Menu', description: null, servicePeriods: ['lunch', 'dinner'], status: 'draft', position: 0 })
  });
  await request(`/api/v1/organizations/${organizationId}/menus/${menu.payload?.data?.id}/status`, 403, {
    method: 'PATCH', headers: viewerHeaders,
    body: JSON.stringify({ status: 'active' })
  });
  checks.push('viewer role cannot publish restaurant menus');
  const menuItem = await request(`/api/v1/organizations/${organizationId}/menus/${menu.payload?.data?.id}/items`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ slug: `smoke-dish-${suffix}`, name: 'Smoke Dish', description: null, priceAmountMinor: 4500, currency: 'MAD', status: 'active', categoryId: null, allergens: [], dietaryLabels: ['vegetarian'], availability: 'available', position: 0, metadata: {} })
  });
  await request(`/api/v1/organizations/${organizationId}/menus/${menu.payload?.data?.id}/items`, 403, {
    method: 'POST', headers: viewerHeaders,
    body: JSON.stringify({ slug: `viewer-dish-${suffix}`, name: 'Viewer Dish', description: null, priceAmountMinor: 100, currency: 'MAD', status: 'draft', categoryId: null, allergens: [], dietaryLabels: [], availability: 'available', position: 0, metadata: {} })
  });
  const menuItems = await request(`/api/v1/organizations/${organizationId}/menus/${menu.payload?.data?.id}/items`, 200, { headers: authHeaders });
  if (!menuItems.payload?.data?.some((item) => item.id === menuItem.payload?.data?.id)) throw new Error('Restaurant menu item did not persist.');
  const publishedMenu = await request(`/api/v1/organizations/${organizationId}/menus/${menu.payload?.data?.id}/status`, 200, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({ status: 'active' })
  });
  if (publishedMenu.payload?.data?.status !== 'active') throw new Error('Restaurant menu could not be published.');
  const unavailableItem = await request(`/api/v1/organizations/${organizationId}/menus/${menu.payload?.data?.id}/items/${menuItem.payload?.data?.id}`, 200, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({ availability: 'unavailable' })
  });
  if (unavailableItem.payload?.data?.availability !== 'unavailable') throw new Error('Restaurant menu item availability could not be updated.');
  const invalidMenuUpdate = await request(`/api/v1/organizations/${organizationId}/menus/${menu.payload?.data?.id}/status`, 400, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({ status: 'published' })
  });
  await request(`/api/v1/organizations/${organizationId}/menus/${menu.payload?.data?.id}/items/${menuItem.payload?.data?.id}`, 200, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({ availability: 'available' })
  });
  const entryPoint = await request(`/api/v1/organizations/${organizationId}/entry-points`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ storeId, type: 'qr', targetPath: '/menu', branding: { brandName: 'Smoke Restaurant', foregroundColor: '#123456', backgroundColor: '#ffffff', accentColor: '#2b7a55', frame: 'bottom-label', label: 'Scan to view menu' } })
  });
  if (entryPoint.payload?.data?.branding?.brandName !== 'Smoke Restaurant') throw new Error('QR branding was not returned after creation.');
  const entryPoints = await request(`/api/v1/organizations/${organizationId}/stores/${storeId}/entry-points`, 200, { headers: authHeaders });
  if (!entryPoints.payload?.data?.some((item) => item.id === entryPoint.payload?.data?.id && item.branding?.foregroundColor === '#123456')) throw new Error('QR entry point branding did not persist.');
  await request(`/api/v1/organizations/${organizationId}/entry-points/${entryPoint.payload?.data?.id}`, 403, {
    method: 'PATCH', headers: viewerHeaders, body: JSON.stringify({ branding: { brandName: 'Unauthorized edit' } })
  });
  await request(`/api/v1/organizations/${organizationId}/entry-points/${entryPoint.payload?.data?.id}`, 200, {
    method: 'PATCH', headers: authHeaders, body: JSON.stringify({ branding: { brandName: 'Updated Restaurant', foregroundColor: '#654321' } })
  });
  const updatedEntryPoints = await request(`/api/v1/organizations/${organizationId}/stores/${storeId}/entry-points`, 200, { headers: authHeaders });
  if (!updatedEntryPoints.payload?.data?.some((item) => item.id === entryPoint.payload?.data?.id && item.branding?.brandName === 'Updated Restaurant')) throw new Error('QR branding update did not persist.');
  checks.push('restaurant menu publishing, item availability, branded QR entry points, and role-restricted branding updates');
  await request('/api/v1/organizations/' + organizationId + '/domains', 403, {
    method: 'POST', headers: viewerHeaders,
    body: JSON.stringify({ storeId, hostname: 'viewer-' + suffix + '.example.org' })
  });
  checks.push('viewer role cannot register custom domains');
  const domainResponse = await request('/api/v1/organizations/' + organizationId + '/domains', 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ storeId, hostname: 'shop-' + suffix + '.example.org' })
  });
  if (domainResponse.payload?.data?.status !== 'verification_required' || domainResponse.payload?.data?.verification?.recordType !== 'TXT') throw new Error('Custom domain verification instructions were not returned.');
  const listedDomains = await request('/api/v1/organizations/' + organizationId + '/stores/' + storeId + '/domains', 200, { headers: authHeaders });
  if (!listedDomains.payload?.data?.some((domain) => domain.id === domainResponse.payload?.data?.id)) throw new Error('Custom domain was not listed.');
  await request('/api/v1/organizations/' + organizationId + '/domains/' + domainResponse.payload?.data?.id + '/disable', 200, { method: 'POST', headers: authHeaders, body: JSON.stringify({}) });
  checks.push('custom domain registration, listing, and disabling');

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
  await request(`/api/v1/organizations/${organizationId}/products/${createdProductId}/media`, 403, {
    method: 'POST', headers: { ...viewerHeaders, 'content-type': 'image/webp' }, body: Buffer.from('not-an-image')
  });
  await request(`/api/v1/organizations/${organizationId}/products/${createdProductId}/media`, 415, {
    method: 'POST', headers: { ...authHeaders, 'content-type': 'image/webp' }, body: Buffer.from('not-an-image')
  });
  checks.push('product creation and private image-upload authorization/type validation');

  const listed = await request(`/api/v1/organizations/${organizationId}/products`, 200, { headers: authHeaders });
  if (!Array.isArray(listed.payload?.data) || !listed.payload.data.some((item) => item.id === createdProductId)) {
    throw new Error('The created product was not returned by the catalog endpoint.');
  }
  const listedProduct = listed.payload.data.find((item) => item.id === createdProductId);
  if (!Array.isArray(listedProduct.media)) throw new Error('Product listing must return a media array.');
  checks.push('product listing and media metadata projection');

  await request(`/api/v1/organizations/${organizationId}/categories`, 403, {
    method: 'POST', headers: viewerHeaders,
    body: JSON.stringify({ storeId, name: 'Viewer category', slug: `viewer-category-${suffix}`, description: null, position: 0, status: 'active' })
  });
  const category = await request(`/api/v1/organizations/${organizationId}/categories`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ storeId, name: 'Accessories', slug: `accessories-${suffix}`, description: null, position: 0, status: 'active' })
  });
  const categories = await request(`/api/v1/organizations/${organizationId}/stores/${storeId}/categories`, 200, { headers: authHeaders });
  if (!categories.payload?.data?.some((item) => item.id === category.payload?.data?.id)) throw new Error('Category did not persist.');
  checks.push('category create and listing');
  const updatedMenuItem = await request(`/api/v1/organizations/${organizationId}/menus/${menu.payload?.data?.id}/items/${menuItem.payload?.data?.id}`, 200, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({ categoryId: category.payload?.data?.id, allergens: ['milk'], dietaryLabels: ['vegetarian'] })
  });
  if (updatedMenuItem.payload?.data?.categoryId !== category.payload?.data?.id || !updatedMenuItem.payload?.data?.allergens?.includes('milk') || !updatedMenuItem.payload?.data?.dietaryLabels?.includes('vegetarian')) throw new Error('Menu item category, allergens, or dietary labels did not persist.');
  checks.push('menu item category assignment and editable allergen/dietary metadata');

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
  await request(`/api/v1/organizations/${organizationId}/inventory/levels`, 403, {
    method: 'PUT', headers: viewerHeaders,
    body: JSON.stringify({ locationId: location.payload?.data?.id, variantId: product.payload?.data?.variants?.[0]?.id, quantityOnHand: 99, reorderPoint: 3 })
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
  await request(`/api/v1/organizations/${organizationId}/products`, 403, {
    method: 'POST', headers: viewerHeaders,
    body: JSON.stringify({ storeId, slug: `viewer-product-${suffix}`, name: 'Viewer product', description: null, status: 'draft', kind: 'physical', availabilityStatus: 'available', availabilityNote: null, attributes: {}, categoryIds: [], variants: [{ id: `viewer-variant-${suffix}`, sku: null, title: 'Standard', options: {}, amountMinor: 100, currency: 'MAD', status: 'active', barcode: null, weightGrams: null, metadata: {} }] })
  });
  await request(`/api/v1/organizations/${organizationId}/products/${activeProduct.payload?.data?.id}`, 403, {
    method: 'PATCH', headers: viewerHeaders, body: JSON.stringify({ name: 'Unauthorized edit' })
  });
  checks.push('viewer role cannot create or edit products');
  await request(`/api/v1/organizations/${organizationId}/products/${activeProduct.payload?.data?.id}`, 200, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({ categoryIds: [category.payload?.data?.id] })
  });
  const categorizedProducts = await request(`/api/v1/organizations/${organizationId}/products`, 200, { headers: authHeaders });
  const categorizedProduct = categorizedProducts.payload?.data?.find((item) => item.id === activeProduct.payload?.data?.id);
  if (!categorizedProduct?.categoryIds?.includes(category.payload?.data?.id)) throw new Error('Product category assignment did not persist.');
  checks.push('product category assignment and tenant/store validation');
  await request(`/api/v1/organizations/${organizationId}/inventory/levels`, 200, {
    method: 'PUT', headers: authHeaders,
    body: JSON.stringify({ locationId: location.payload?.data?.id, variantId: activeProduct.payload?.data?.variants?.[0]?.id, quantityOnHand: 5, reorderPoint: 1 })
  });
  const posBase = `/api/v1/organizations/${organizationId}/stores/${storeId}/pos`;
  const posSession = await request(`${posBase}/sessions`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ label: 'Main register', terminalType: 'retail', locationId: location.payload?.data?.id })
  });
  const posSessions = await request(`${posBase}/sessions`, 200, { headers: authHeaders });
  if (!posSessions.payload?.data?.some((session) => session.id === posSession.payload?.data?.id && session.status === 'open')) {
    throw new Error('POS session creation or listing did not persist.');
  }
  const posPayload = {
    sessionId: posSession.payload?.data?.id,
    channel: 'pos',
    fulfillment: 'counter',
    idempotencyKey: `smoke-pos-order-${suffix}`,
    items: [{ sourceType: 'product', sourceItemId: activeProduct.payload?.data?.id, sourceVariantId: activeProduct.payload?.data?.variants?.[0]?.id, quantity: 2 }]
  };
  const posOrder = await request(`${posBase}/orders`, 201, { method: 'POST', headers: authHeaders, body: JSON.stringify(posPayload) });
  if (Number(posOrder.payload?.data?.totalMinor) !== 2598 || posOrder.payload?.data?.status !== 'confirmed' || posOrder.payload?.data?.items?.length !== 1) {
    throw new Error('POS order pricing, initial status, or line snapshots are incorrect.');
  }
  const posMenuOrder = await request(`${posBase}/orders`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({
      sessionId: posSession.payload?.data?.id, channel: 'pos', fulfillment: 'takeaway',
      idempotencyKey: `smoke-pos-menu-order-${suffix}`,
      items: [{ sourceType: 'menu_item', sourceItemId: menuItem.payload?.data?.id, quantity: 1 }]
    })
  });
  if (Number(posMenuOrder.payload?.data?.totalMinor) !== 4500 || posMenuOrder.payload?.data?.items?.[0]?.sourceType !== 'menu_item') {
    throw new Error('POS could not price and snapshot an active restaurant menu item.');
  }
  await request(`${posBase}/orders/${posMenuOrder.payload?.data?.id}/status`, 200, {
    method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'cancelled' })
  });
  checks.push('restaurant menu items can be sold through POS');
  const posReplay = await request(`${posBase}/orders`, 200, { method: 'POST', headers: authHeaders, body: JSON.stringify(posPayload) });
  if (posReplay.payload?.data?.id !== posOrder.payload?.data?.id) throw new Error('POS idempotency did not return the original order.');
  await request(`${posBase}/orders/${posOrder.payload?.data?.id}/status`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'preparing' }) });
  await request(`${posBase}/orders/${posOrder.payload?.data?.id}/status`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'ready' }) });
  const posCompleted = await request(`${posBase}/orders/${posOrder.payload?.data?.id}/status`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'completed' }) });
  if (posCompleted.payload?.data?.status !== 'completed' || posCompleted.payload?.data?.items?.length !== 1) throw new Error('POS status transition or order history projection failed.');
  const inventoryAfterPosSale = await request(`/api/v1/organizations/${organizationId}/inventory`, 200, { headers: authHeaders });
  const soldVariantStock = inventoryAfterPosSale.payload?.data?.find((item) => item.variantId === activeProduct.payload?.data?.variants?.[0]?.id && item.locationId === location.payload?.data?.id);
  if (Number(soldVariantStock?.quantityOnHand) !== 3) throw new Error('Completing a POS sale did not deduct tracked stock exactly once.');
  checks.push('POS completion deducts tracked inventory at the register location');
  const posOversellOrder = await request(`${posBase}/orders`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({
      sessionId: posSession.payload?.data?.id, channel: 'pos', fulfillment: 'counter',
      idempotencyKey: `smoke-pos-oversell-${suffix}`,
      items: [{ sourceType: 'product', sourceItemId: activeProduct.payload?.data?.id, sourceVariantId: activeProduct.payload?.data?.variants?.[0]?.id, quantity: 4 }]
    })
  });
  await request(`${posBase}/orders/${posOversellOrder.payload?.data?.id}/status`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'preparing' }) });
  await request(`${posBase}/orders/${posOversellOrder.payload?.data?.id}/status`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'ready' }) });
  await request(`${posBase}/orders/${posOversellOrder.payload?.data?.id}/status`, 409, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'completed' }) });
  await request(`${posBase}/orders/${posOversellOrder.payload?.data?.id}/status`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'cancelled' }) });
  checks.push('POS refuses to complete tracked sales beyond available stock');
  const posPaidCancelOrder = await request(`${posBase}/orders`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({
      sessionId: posSession.payload?.data?.id, channel: 'pos', fulfillment: 'counter',
      idempotencyKey: `smoke-pos-paid-cancel-${suffix}`,
      items: [{ sourceType: 'product', sourceItemId: activeProduct.payload?.data?.id, sourceVariantId: activeProduct.payload?.data?.variants?.[0]?.id, quantity: 1 }]
    })
  });
  await request(`${posBase}/orders/${posPaidCancelOrder.payload?.data?.id}/status`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'preparing' }) });
  await request(`${posBase}/orders/${posPaidCancelOrder.payload?.data?.id}/status`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'ready' }) });
  const paidCancelPayment = await request(`/api/v1/organizations/${organizationId}/orders/${posPaidCancelOrder.payload?.data?.id}/payments`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ method: 'cash', amountMinor: 1299, status: 'succeeded', idempotencyKey: `smoke-pos-paid-cancel-payment-${suffix}` })
  });
  await request(`${posBase}/orders/${posPaidCancelOrder.payload?.data?.id}/status`, 409, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'cancelled' }) });
  await request(`/api/v1/organizations/${organizationId}/orders/${posPaidCancelOrder.payload?.data?.id}/refunds`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ paymentId: paidCancelPayment.payload?.data?.id, amountMinor: 1299, reason: 'POS cancellation smoke test', idempotencyKey: `smoke-pos-paid-cancel-refund-${suffix}` })
  });
  await request(`${posBase}/orders/${posPaidCancelOrder.payload?.data?.id}/status`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'cancelled' }) });
  checks.push('paid POS orders require full refund before cancellation');



  const canonicalOrders = await request(`/api/v1/organizations/${organizationId}/orders`, 200, { headers: authHeaders });
  const canonicalPosOrder = canonicalOrders.payload?.data?.find((item) => item.id === posOrder.payload?.data?.id);
  if (!canonicalPosOrder || canonicalPosOrder.channel !== 'POS' || Number(canonicalPosOrder.totalMinor) !== 2598 || canonicalPosOrder.items?.length !== 1) {
    throw new Error('POS order was not mirrored to the canonical order/payment workflow.');
  }
  await request(`/api/v1/organizations/${organizationId}/orders/${posOrder.payload?.data?.id}/payments`, 403, {
    method: 'POST', headers: viewerHeaders,
    body: JSON.stringify({ method: 'cash', amountMinor: 2598, status: 'succeeded', idempotencyKey: `viewer-payment-${suffix}` })
  });
  const posPayment = await request(`/api/v1/organizations/${organizationId}/orders/${posOrder.payload?.data?.id}/payments`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ method: 'cash', amountMinor: 2598, status: 'succeeded', reference: `POS-CASH-${suffix}`, idempotencyKey: `smoke-pos-payment-${suffix}` })
  });
  if (posPayment.payload?.data?.paymentStatus !== 'paid') throw new Error('POS order did not use the canonical manual payment workflow.');
  await request(`/api/v1/organizations/${organizationId}/orders/${posOrder.payload?.data?.id}/refunds`, 403, {
    method: 'POST', headers: viewerHeaders,
    body: JSON.stringify({ paymentId: posPayment.payload?.data?.id, amountMinor: 100, reason: 'Viewer must not refund', idempotencyKey: `viewer-refund-${suffix}` })
  });
  const posRefund = await request(`/api/v1/organizations/${organizationId}/orders/${posOrder.payload?.data?.id}/refunds`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ paymentId: posPayment.payload?.data?.id, amountMinor: 500, reason: 'POS smoke test partial refund', idempotencyKey: `smoke-pos-refund-${suffix}` })
  });
  if (posRefund.payload?.data?.paymentStatus !== 'partially_refunded') throw new Error('POS order did not use the canonical refund workflow.');
  const canonicalOrdersAfterRefund = await request(`/api/v1/organizations/${organizationId}/orders`, 200, { headers: authHeaders });
  const canonicalPosAfterRefund = canonicalOrdersAfterRefund.payload?.data?.find((item) => item.id === posOrder.payload?.data?.id);
  if (canonicalPosAfterRefund?.effectivePaymentStatus !== 'partially_refunded') throw new Error('Order listing did not preserve the POS order refund state.');
  await request(`${posBase}/orders/${posOrder.payload?.data?.id}/status`, 409, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'ready' }) });
  const posClosed = await request(`${posBase}/sessions/${posSession.payload?.data?.id}/close`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({}) });
  if (posClosed.payload?.data?.status !== 'closed') throw new Error('POS session did not close.');
  const closedSessionReplay = await request(`${posBase}/orders`, 200, { method: 'POST', headers: authHeaders, body: JSON.stringify(posPayload) });
  if (closedSessionReplay.payload?.data?.id !== posOrder.payload?.data?.id) throw new Error('POS idempotency replay failed after the register was closed.');
  await request(`${posBase}/orders`, 409, { method: 'POST', headers: authHeaders, body: JSON.stringify({ ...posPayload, idempotencyKey: `smoke-pos-closed-${suffix}` }) });
  checks.push('POS sessions, canonical order/payment/refund integration, idempotency, audited status transitions and close guards');

  const orderPayload = { storeId, customerId: customer.payload?.data?.id, notes: 'Smoke test order', idempotencyKey: `smoke-order-${suffix}`, items: [{ variantId: activeProduct.payload?.data?.variants?.[0]?.id, quantity: 2 }] };
  const order = await request(`/api/v1/organizations/${organizationId}/orders`, 201, { method: 'POST', headers: authHeaders, body: JSON.stringify(orderPayload) });
  if (Number(order.payload?.data?.totalMinor) !== 2598 || order.payload?.data?.status !== 'pending' || order.payload?.data?.items?.length !== 1) throw new Error('Order totals or immutable item snapshots are incorrect.');
  const replay = await request(`/api/v1/organizations/${organizationId}/orders`, 200, { method: 'POST', headers: authHeaders, body: JSON.stringify(orderPayload) });
  if (replay.payload?.data?.id !== order.payload?.data?.id) throw new Error('Order idempotency key did not return the existing order.');
  await request(`/api/v1/organizations/${organizationId}/orders/${order.payload?.data?.id}`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'confirmed' }) });
  await request(`/api/v1/organizations/${organizationId}/orders/${order.payload?.data?.id}`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'processing' }) });
  const completed = await request(`/api/v1/organizations/${organizationId}/orders/${order.payload?.data?.id}`, 200, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'completed' }) });
  if (completed.payload?.data?.status !== 'completed') throw new Error('Valid order status transitions did not persist.');
  await request(`/api/v1/organizations/${organizationId}/orders/${order.payload?.data?.id}`, 409, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: 'pending' }) });

  const orderIdForRefund = order.payload?.data?.id;
  const recordedPayment = await request(`/api/v1/organizations/${organizationId}/orders/${orderIdForRefund}/payments`, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ method: 'cash', amountMinor: 2598, status: 'succeeded', reference: `CASH-${suffix}`, idempotencyKey: `smoke-payment-${suffix}` })
  });
  const refundPath = `/api/v1/organizations/${organizationId}/orders/${orderIdForRefund}/refunds`;
  await request(refundPath, 403, {
    method: 'POST', headers: viewerHeaders,
    body: JSON.stringify({ paymentId: recordedPayment.payload?.data?.id, amountMinor: 100, reason: 'Viewer must not record refunds' })
  });
  const firstRefund = await request(refundPath, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ paymentId: recordedPayment.payload?.data?.id, amountMinor: 1000, reason: 'Smoke test partial refund', idempotencyKey: `smoke-refund-1-${suffix}` })
  });
  if (Number(firstRefund.payload?.data?.totalRefundedMinor) !== 1000 || firstRefund.payload?.data?.paymentStatus !== 'partially_refunded') {
    throw new Error('Partial refund totals or payment status are incorrect.');
  }
  await request(refundPath, 409, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ paymentId: recordedPayment.payload?.data?.id, amountMinor: 2000, reason: 'Exceeds remaining refundable amount' })
  });
  const secondRefund = await request(refundPath, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ paymentId: recordedPayment.payload?.data?.id, amountMinor: 1598, reason: 'Smoke test final refund', idempotencyKey: `smoke-refund-2-${suffix}` })
  });
  if (Number(secondRefund.payload?.data?.totalRefundedMinor) !== 2598 || secondRefund.payload?.data?.paymentStatus !== 'refunded') {
    throw new Error('Full refund totals or payment status are incorrect.');
  }
  const refundReplay = await request(refundPath, 200, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ paymentId: recordedPayment.payload?.data?.id, amountMinor: 1598, reason: 'Smoke test final refund', idempotencyKey: `smoke-refund-2-${suffix}` })
  });
  if (refundReplay.payload?.data?.id !== secondRefund.payload?.data?.id) throw new Error('Refund idempotency did not return the existing refund.');
  const refundHistory = await request(refundPath, 200, { headers: authHeaders });
  if (!Array.isArray(refundHistory.payload?.data) || refundHistory.payload.data.length !== 2) throw new Error('Refund history did not return both refund records.');
  checks.push('audited partial/full manual refunds, over-refund guard, idempotency and history');

  const shipmentOrderPayload = {
    storeId,
    customerId: customer.payload?.data?.id,
    notes: 'Smoke test shipment order',
    idempotencyKey: `smoke-shipment-order-${suffix}`,
    items: [{ variantId: activeProduct.payload?.data?.variants?.[0]?.id, quantity: 1 }]
  };
  const shipmentOrder = await request(`/api/v1/organizations/${organizationId}/orders`, 201, {
    method: 'POST', headers: authHeaders, body: JSON.stringify(shipmentOrderPayload)
  });
  if (!shipmentOrder.payload?.data?.id) throw new Error('Shipment test order did not return an id.');

  const expectedDeliveryDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const fulfillmentPath = `/api/v1/organizations/${organizationId}/orders/${shipmentOrder.payload?.data?.id}/fulfillments`;
  const shipment = await request(fulfillmentPath, 201, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ stage: 'preparing', carrier: 'Smoke Courier', trackingNumber: `TRACK-${suffix}`, trackingUrl: `https://example.test/track/${suffix}`, estimatedDeliveryDate: expectedDeliveryDate, notes: 'Leave at reception' })
  });
  if (shipment.payload?.data?.stage !== 'preparing' || shipment.payload?.data?.carrier !== 'Smoke Courier') throw new Error('Shipment creation did not return the saved carrier and stage.');
  await request(`${fulfillmentPath}/${shipment.payload?.data?.id}`, 409, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ stage: 'delivered', carrier: 'Smoke Courier', trackingNumber: `TRACK-${suffix}`, trackingUrl: `https://example.test/track/${suffix}`, estimatedDeliveryDate: expectedDeliveryDate, notes: 'Invalid skipped stage' }) });
  await request(fulfillmentPath, 400, { method: 'POST', headers: authHeaders, body: JSON.stringify({ stage: 'preparing', trackingUrl: 'javascript:alert(1)' }) });
  const shipped = await request(`${fulfillmentPath}/${shipment.payload?.data?.id}`, 200, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({ stage: 'shipped', carrier: 'Smoke Courier', trackingNumber: `TRACK-${suffix}`, trackingUrl: `https://example.test/track/${suffix}`, estimatedDeliveryDate: expectedDeliveryDate, notes: 'Parcel handed to courier' })
  });
  if (shipped.payload?.data?.stage !== 'shipped' || !shipped.payload?.data?.shippedAt) throw new Error('Shipment did not transition to shipped.');
  const outForDelivery = await request(`${fulfillmentPath}/${shipment.payload?.data?.id}`, 200, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({ stage: 'out_for_delivery', carrier: 'Smoke Courier', trackingNumber: `TRACK-${suffix}`, trackingUrl: `https://example.test/track/${suffix}`, estimatedDeliveryDate: expectedDeliveryDate, notes: 'Courier is on the way' })
  });
  if (outForDelivery.payload?.data?.stage !== 'out_for_delivery') throw new Error('Shipment did not transition to out for delivery.');
  const delivered = await request(`${fulfillmentPath}/${shipment.payload?.data?.id}`, 200, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({ stage: 'delivered', carrier: 'Smoke Courier', trackingNumber: `TRACK-${suffix}`, trackingUrl: `https://example.test/track/${suffix}`, estimatedDeliveryDate: expectedDeliveryDate, notes: 'Delivered to customer' })
  });
  if (delivered.payload?.data?.stage !== 'delivered' || !delivered.payload?.data?.deliveredAt) throw new Error('Shipment did not transition to delivered.');
  const shipmentHistory = await request(fulfillmentPath, 200, { headers: authHeaders });
  if (shipmentHistory.payload?.data?.fulfillments?.[0]?.id !== shipment.payload?.data?.id) throw new Error('Shipment history did not return the created shipment.');
  checks.push('audited shipment creation, carrier tracking, delivery stages and history');
  const orders = await request(`/api/v1/organizations/${organizationId}/orders`, 200, { headers: authHeaders });
  if (!orders.payload?.data?.some((item) => item.id === order.payload?.data?.id)) throw new Error('Created order did not appear in order listing.');
  checks.push('server-priced orders, snapshots, idempotency, audited status transitions and listing');

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

  await request(`/api/v1/organizations/${organizationId}/stores/${storeId}/storefront`, 403, {
    method: 'PATCH', headers: viewerHeaders, body: JSON.stringify({ published: true })
  });
  const storefront = await request(`/api/v1/organizations/${organizationId}/stores/${storeId}/storefront`, 200, {
    method: 'PATCH', headers: authHeaders, body: JSON.stringify({ published: true, defaultExperience: 'menu', enabledExperiences: ['menu', 'catalog'] })
  });
  if (storefront.payload?.data?.published !== true || storefront.payload?.data?.defaultExperience !== 'menu') throw new Error('Storefront publishing settings did not persist.');
  const publicMenu = await request(`/api/v1/public/stores/smoke-store-${suffix}/menus`, 200);
  if (!publicMenu.payload?.data?.some((item) => item.id === menu.payload?.data?.id && item.items?.some((dish) => dish.id === menuItem.payload?.data?.id))) throw new Error('Published restaurant menu or item was not publicly accessible.');
  const publicEntryPoint = await request(`/api/v1/public/entry-points/${entryPoint.payload?.data?.id}`, 200);
  if (publicEntryPoint.payload?.data?.branding?.brandName !== 'Updated Restaurant' || publicEntryPoint.payload?.data?.targetUrlPath !== `/smoke-store-${suffix}/menu`) throw new Error('Published QR entry point did not expose the expected public menu destination and branding.');
  checks.push('storefront publishing, public restaurant menu access, and branded public QR destinations');

  console.log(`API integration smoke checks passed (${checks.length} checks):`);
  for (const check of checks) console.log(`  ✓ ${check}`);
} finally {
  if (organizationId) {
    await pool.query('DELETE FROM pos_order_lines WHERE organization_id=$1', [organizationId]).catch(() => undefined);
    await pool.query('DELETE FROM pos_orders WHERE organization_id=$1', [organizationId]).catch(() => undefined);
    await pool.query('DELETE FROM pos_sessions WHERE organization_id=$1', [organizationId]).catch(() => undefined);
    await pool.query('DELETE FROM order_items WHERE organization_id=$1', [organizationId]).catch(() => undefined);
    await pool.query('DELETE FROM fulfillments WHERE organization_id=$1', [organizationId]).catch(() => undefined);
    await pool.query('DELETE FROM refunds WHERE organization_id=$1', [organizationId]).catch(() => undefined);
    await pool.query('DELETE FROM payments WHERE organization_id=$1', [organizationId]).catch(() => undefined);
    await pool.query('DELETE FROM orders WHERE organization_id=$1', [organizationId]).catch(() => undefined);
    await pool.query('DELETE FROM customers WHERE organization_id=$1', [organizationId]).catch(() => undefined);
    await pool.query('DELETE FROM organizations WHERE id=$1', [organizationId]).catch(() => undefined);
  }
  if (viewerOrganizationId) await pool.query('DELETE FROM organizations WHERE id=$1', [viewerOrganizationId]).catch(() => undefined);
  if (signupUserId) await pool.query('DELETE FROM users WHERE id=$1', [signupUserId]).catch(() => undefined);
  if (viewerUserId) await pool.query('DELETE FROM users WHERE id=$1', [viewerUserId]).catch(() => undefined);
  await pool.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => undefined);
  await pool.end();
}
