import assert from 'node:assert/strict';
const origin = process.env.TEST_URL || 'http://127.0.0.1:3000';
async function request(path, method = 'GET', body, extra = {}) {
  const response = await fetch(`${origin}/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin, ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
const health = await request('health');
assert.equal(health.status, 200);
assert.equal(health.body.mode, 'live');
const search = await request('search');
assert.equal(search.status, 200);
assert.equal(search.body.mode, 'live');
assert(search.body.products.every((p) => p.sourceKind === 'live'));
const session = await request('session');
assert.equal(session.body.user, null);
assert.equal(
  (await request('session', 'POST', { name: 'Should not create a demo user' })).status,
  400,
);
assert.equal(
  (await request('imports', 'POST', { url: 'https://www.amazon.in/dp/B09XS7JWHH' })).status,
  401,
);
assert.equal(
  (await request('imports', 'POST', { url: 'https://127.0.0.1/dp/B09XS7JWHH' })).status,
  400,
);
assert.equal((await request('watches', 'POST', { productId: 'amazon-b09xs7jwhh' })).status, 401);
assert.equal((await request('admin')).status, 403);
assert.equal(
  (
    await request(
      'preferences',
      'PATCH',
      { enabled: true },
      { Origin: 'https://untrusted.example' },
    )
  ).status,
  403,
);
if (search.body.products.length) {
  const product = await request(`products/${search.body.products[0].id}`);
  assert.equal(product.status, 200);
  assert.equal(product.body.mode, 'live');
  assert(product.body.offers.every((o) => o.itemPrice > 0 && o.historyAllowed && o.alertsAllowed));
}
console.log('Live API smoke: 10 checks passed. No users created and no messages sent.');
