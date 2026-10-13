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
const storeSlug = `browser-restaurant-${suffix}`;
const menuName = `Browser lunch ${suffix}`;
const dishName = `Test sandwich ${suffix}`;
const password = `DollareusBrowser!${suffix}X9`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
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
  await page.goto(`${baseUrl}/signup`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Create your account' }).waitFor();
  await page.locator('input[name="displayName"]').fill('Browser Acceptance');
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Regression guard: successful registration must create a workspace rather than
  // landing on the previous "couldn't load your workspace" error screen.
  await page.getByRole('heading', { name: 'Create your workspace' }).waitFor({ timeout: 15000 });
  await page.locator('input[name="name"]').fill('Browser Acceptance Restaurant');
  await page.locator('input[name="slug"]').fill(workspaceSlug);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('heading', { name: 'Create your first store' }).waitFor({ timeout: 15000 });
  await page.locator('input[name="name"]').fill('Browser Acceptance Restaurant');
  await page.locator('select[name="businessType"]').selectOption('restaurant');
  await page.locator('input[name="slug"]').fill(storeSlug);
  await page.getByRole('button', { name: 'Create store' }).click();
  await page.getByRole('heading', { name: 'Good morning, welcome back.' }).waitFor({ timeout: 15000 });
  assert.equal(await page.getByText('We couldn’t load your workspace').count(), 0);

  // Real-browser restaurant path: create a menu and dish through merchant forms.
  await page.getByRole('button', { name: 'Menus', exact: true }).click();
  await page.getByRole('heading', { name: 'Restaurant menus' }).waitFor();
  const menuForm = page.locator('form').filter({ has: page.getByRole('button', { name: /Create menu/ }) });
  await menuForm.locator('input[name="name"]').fill(menuName);
  await menuForm.getByRole('button', { name: /Create menu/ }).click();
  await page.getByText(menuName).waitFor();
  await page.getByRole('button', { name: 'Manage items' }).first().click();
  await page.getByRole('heading', { name: 'Menu items' }).waitFor();

  const itemForm = page.locator('form').filter({ has: page.getByRole('button', { name: /Add item/ }) });
  await itemForm.locator('input[name="name"]').fill(dishName);
  await itemForm.locator('input[name="price"]').fill('45.00');
  await itemForm.getByRole('button', { name: /Add item/ }).click();
  await page.getByText(dishName).waitFor();

  // Open a restaurant register, create a server-priced order, and record a
  // manually received cash payment. No payment provider or card data is used.
  await page.getByRole('button', { name: 'POS', exact: true }).click();
  await page.getByRole('heading', { name: 'Point of sale' }).waitFor();
  const registerForm = page.locator('form').filter({ has: page.getByRole('button', { name: /Open register/ }) });
  await registerForm.locator('input[name="label"]').fill(`Browser register ${suffix}`);
  await registerForm.locator('select').first().selectOption('restaurant');
  await registerForm.getByRole('button', { name: /Open register/ }).click();

  const saleForm = page.locator('form').filter({ has: page.getByRole('button', { name: /Add item to ticket/ }) });
  await saleForm.locator('select').nth(0).selectOption('menu_item');
  const dishOption = await saleForm.locator('select').nth(1).locator('option').evaluateAll(options =>
    options.map(option => ({ value: option.value, text: option.textContent ?? '' })).find(option => option.text.includes(dishName))
  );
  assert.ok(dishOption?.value, 'The newly saved dish should be selectable in POS.');
  await saleForm.locator('select').nth(1).selectOption(dishOption.value);
  await saleForm.getByRole('button', { name: /Add item to ticket/ }).click();
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
  await receipt.getByText(dishName).waitFor();
  assert.match(await receipt.locator('body').innerText(), /Order #/);
  await receipt.close();

  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('heading', { name: 'Inventory' }).waitFor();
  assert.deepEqual(pageErrors, [], `Browser console/runtime errors: ${pageErrors.join(' | ')}`);
  console.log('Browser acceptance passed: signup/workspace regression, restaurant onboarding, menu/dish creation, POS order, manual payment, printable receipt, and inventory page.');
} finally {
  await browser.close();
}
