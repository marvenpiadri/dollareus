const baseUrl = process.env.DOLLAREUS_SMOKE_URL ?? 'http://127.0.0.1:3000';

async function expectStatus(path, expected, init) {
  const response = await fetch(new URL(path, baseUrl), init);
  const body = await response.text();
  if (response.status !== expected) {
    throw new Error(`${init?.method ?? 'GET'} ${path}: expected HTTP ${expected}, received ${response.status}. Body: ${body.slice(0, 500)}`);
  }
  return { path, status: response.status };
}

const checks = [];
const health = await fetch(new URL('/api/v1/health', baseUrl));
if (!health.ok) throw new Error(`Health endpoint returned HTTP ${health.status}`);
const healthBody = await health.json();
if (healthBody?.data?.status !== 'ok') throw new Error('Health endpoint did not return status=ok.');
checks.push({ path: '/api/v1/health', status: health.status });

checks.push(await expectStatus('/api/v1/auth/session', 401));
checks.push(await expectStatus('/api/v1/organizations', 401));
checks.push(await expectStatus('/api/v1/organizations', 401, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Smoke test', slug: 'smoke-test' })
}));
checks.push(await expectStatus('/api/v1/public/stores/__smoke_missing_store__', 404));
checks.push(await expectStatus('/api/v1/public/stores/__smoke_missing_store__/catalog', 404));

console.log(`API smoke checks passed (${checks.length} checks):`);
for (const check of checks) console.log(`  ${check.status} ${check.path}`);
