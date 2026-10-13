import assert from 'node:assert/strict';

const moduleUrl = process.env.PLAYWRIGHT_MODULE_URL;
if (!moduleUrl) throw new Error('Set PLAYWRIGHT_MODULE_URL to the installed Playwright entry point.');
const { chromium } = await import(moduleUrl);
const baseUrl = process.env.DOLLAREUS_BROWSER_URL ?? 'http://127.0.0.1:4000';
const apiUrl = process.env.DOLLAREUS_API_URL ?? 'http://127.0.0.1:3000';
const suffix = Math.random().toString(36).slice(2, 10);
const username = `browser_${suffix}`;
const email = `browser-${suffix}@example.test`;
const workspaceSlug = `browser-workspace-${suffix}`;
let storeSlug = `browser-restaurant-${suffix}`;
const menuName = `Browser lunch ${suffix}`;
const dishName = `Test sandwich ${suffix}`;
const password = `DollareusBrowser!${suffix}X9`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
await page.addInitScript((url) => { window.DOLLAREUS_API_URL = url; }, apiUrl);

async function waitForService(url) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* wait for the local service to start */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Service did not become ready: ${url}`);
}

try {
  await waitForService(`${apiUrl}/api/v1/health`);
  await waitForService(baseUrl);
  await page.goto(`${baseUrl}/signup`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Create your account' }).waitFor();
  await page.locator('input[name="displayName"]').fill('Browser Acceptance');
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Regression guard: registration must provision a usable workspace and land
  // on the dashboard, never the previous "couldn't load your workspace" error.
  await page.getByRole('heading', { name: 'Your business at a glance' }).waitFor({ timeout: 15000 });
  assert.equal(await page.getByText('We couldn’t load your workspace').count(), 0);

  // Signup provisions a default workspace/store. Convert that store to a
  // restaurant for this end-to-end test through the normal authenticated API.
  const bootstrap = await page.evaluate(async ({ apiUrl }) => {
    const read = async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message ?? `API request failed (${response.status})`);
      return payload.data;
    };
    const organizations = await read(await fetch(`${apiUrl}/api/v1/organizations`, { credentials: 'include' }));
    const organization = organizations?.[0];
    if (!organization?.id) throw new Error('Signup did not create an organization.');
    const stores = await read(await fetch(`${apiUrl}/api/v1/organizations/${encodeURIComponent(organization.id)}/stores`, { credentials: 'include' }));
    const store = stores?.[0];
    if (!store?.id || !store.slug) throw new Error('Signup did not create a default store.');
    await read(await fetch(`${apiUrl}/api/v1/organizations/${encodeURIComponent(organization.id)}/stores/${encodeURIComponent(store.id)}/storefront`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Browser Acceptance Restaurant', businessType: 'restaurant', status: 'active', currency: 'MAD', locale: 'en', timeZone: 'Africa/Casablanca' })
    }));
    return { organizationId: organization.id, storeId: store.id, storeSlug: store.slug, storeHandle: store.publicHandle, locationSlug: store.locationSlug };
  }, { apiUrl });
  storeSlug = bootstrap.storeSlug;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Your business at a glance' }).waitFor({ timeout: 15000 });

  // Real-browser restaurant path: create a menu and dish through merchant forms.
  await page.getByRole('button', { name: /Menus/ }).click();
  await page.getByRole('heading', { name: 'Restaurant menus' }).waitFor();
  const menuForm = page.locator('form').filter({ has: page.getByRole('button', { name: /Create menu/ }) });
  await menuForm.locator('input[name="name"]').fill(menuName);
  await menuForm.getByRole('button', { name: /Create menu/ }).click();
  await page.getByText(menuName, { exact: true }).waitFor();
  // POS only offers dishes from an active menu; publish it as a restaurant owner would.
  await page.getByRole('button', { name: 'Publish', exact: true }).first().click();
  await page.getByRole('button', { name: 'Unpublish', exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Manage items' }).first().click();
  await page.getByRole('heading', { name: 'Menu items' }).waitFor();

  const itemForm = page.locator('form').filter({ has: page.getByRole('button', { name: /Add item/ }) });
  await itemForm.locator('input[name="name"]').fill(dishName);
  await itemForm.locator('input[name="price"]').fill('45.00');
  await itemForm.getByRole('button', { name: /Add item/ }).click();
  await page.getByText(dishName, { exact: true }).waitFor();
  // Dishes are created as drafts too; publish the dish before selling it in POS.
  await page.getByRole('button', { name: 'Publish', exact: true }).first().click();
  await page.getByRole('button', { name: 'Unpublish', exact: true }).nth(1).waitFor();

  // Open a restaurant register, create a server-priced order, and record a
  // manually received cash payment. No payment provider or card data is used.
  await page.getByRole('button', { name: /POS/ }).click();
  await page.getByRole('heading', { name: 'Point of sale' }).waitFor();
  const registerForm = page.locator('form').filter({ has: page.getByRole('button', { name: /Open register/ }) });
  await registerForm.locator('input[name="label"]').fill(`Browser register ${suffix}`);
  await registerForm.locator('select').first().selectOption('restaurant');
  await registerForm.getByRole('button', { name: /Open register/ }).click();

  const saleForm = page.locator('form').filter({ has: page.getByRole('button', { name: /Add to ticket/ }) });
  await saleForm.locator('select').nth(0).selectOption('menu_item');
  const dishOption = await saleForm.locator('select').nth(1).locator('option').evaluateAll((options, targetName) =>
    options.map(option => ({ value: option.value, text: option.textContent ?? '' })).find(option => option.text.includes(targetName))
  , dishName);
  assert.ok(dishOption?.value, 'The newly saved dish should be selectable in POS.');
  await saleForm.locator('select').nth(1).selectOption(dishOption.value);
  await saleForm.getByRole('button', { name: /Add to ticket/ }).click();
  await page.getByRole('button', { name: /Create POS order/ }).click();
  await page.getByRole('button', { name: 'Print receipt' }).first().waitFor({ timeout: 15000 });

  await page.getByRole('button', { name: 'Record payment' }).first().click();
  await page.getByText(/Record an external payment/).waitFor();
  await page.locator('form').filter({ has: page.getByRole('button', { name: /Save payment record/ }) }).getByRole('button', { name: /Save payment record/ }).click();
  await page.getByRole('status').filter({ hasText: /Payment manually marked as received/ }).waitFor({ timeout: 15000 });

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Print receipt' }).first().click();
  const receipt = await popupPromise;
  await receipt.getByText('Sales receipt').waitFor({ timeout: 10000 });
  await receipt.getByText(dishName, { exact: true }).waitFor();
  assert.match(await receipt.locator('body').innerText(), /Order #/);
  await receipt.close();

  await page.getByRole('button', { name: /Inventory/ }).click();
  await page.getByRole('heading', { name: 'Inventory', exact: true, level: 1 }).waitFor();

  // Publish the restaurant menu through the authenticated storefront API and
  // verify the customer-facing menu route renders the saved dish.
  const publishResult = await page.evaluate(async ({ apiUrl, storeSlug }) => {
    const read = async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message ?? `API request failed (${response.status})`);
      return payload.data;
    };
    const organizations = await read(await fetch(`${apiUrl}/api/v1/organizations`, { credentials: 'include' }));
    const organization = organizations?.[0];
    if (!organization?.id) throw new Error('The browser-created workspace could not be reloaded from the API.');
    const stores = await read(await fetch(`${apiUrl}/api/v1/organizations/${encodeURIComponent(organization.id)}/stores`, { credentials: 'include' }));
    const store = stores?.find((row) => row.slug === storeSlug);
    if (!store?.id) throw new Error('The browser-created restaurant could not be reloaded from the API.');
    await read(await fetch(`${apiUrl}/api/v1/organizations/${encodeURIComponent(organization.id)}/stores/${encodeURIComponent(store.id)}/storefront`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ published: true, defaultExperience: 'menu', enabledExperiences: ['menu', 'catalog'], theme: { profileImageUrl: 'https://example.com/dollareus-browser-profile.webp' } })
    }));
    return { organizationId: organization.id, storeId: store.id };
  }, { apiUrl, storeSlug });
  assert.ok(publishResult.storeId, 'The restaurant storefront should publish successfully.');
  const publicPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await publicPage.addInitScript((url) => { window.DOLLAREUS_API_URL = url; }, apiUrl);
  await publicPage.goto(`${baseUrl}/${bootstrap.storeHandle}/${bootstrap.locationSlug}/menu`, { waitUntil: 'domcontentloaded' });
  await publicPage.getByText(dishName, { exact: true }).waitFor({ timeout: 15000 });
  assert.deepEqual(pageErrors, [], `Browser console/runtime errors: ${pageErrors.join(' | ')}`);
  assert.deepEqual(await publicPage.locator('body').evaluate((body, targetName) => body.innerText.includes(targetName), dishName), true);

  // Check the guest-facing menu at a real phone-sized viewport. This catches
  // horizontal overflow that can make a QR-linked menu difficult to use.
  await publicPage.setViewportSize({ width: 390, height: 844 });
  await publicPage.reload({ waitUntil: 'domcontentloaded' });
  await publicPage.getByText(dishName, { exact: true }).waitFor({ timeout: 15000 });
  const mobileLayout = await publicPage.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    dishVisible: [...document.querySelectorAll('h4')].some(element => element.textContent?.trim() === dishName)
  }));
  assert.ok(mobileLayout.documentWidth <= mobileLayout.viewportWidth + 1,
    `Public menu overflows phone viewport: ${mobileLayout.documentWidth}px document for ${mobileLayout.viewportWidth}px viewport.`);
  assert.equal(mobileLayout.dishVisible, true, 'The saved dish should remain visible on a phone-sized screen.');
  await publicPage.close();
  console.log('Browser acceptance passed: signup/workspace regression, restaurant onboarding, menu/dish creation, POS order, manual payment, printable receipt, inventory page, and published public menu at desktop and phone widths.');
} finally {
  await browser.close();
}
