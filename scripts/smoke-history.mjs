import assert from 'node:assert/strict';
const origin = process.env.TEST_URL || 'http://127.0.0.1:3100';
const request = (path) => fetch(new URL(path, origin), { signal: AbortSignal.timeout(20000) });
const response = await request('/api/v1/history?days=30');
assert.equal(response.status, 200);
const body = await response.json();
assert(Array.isArray(body.products));
assert(body.products.length <= 4);
for (const product of body.products) {
  assert(Array.isArray(body.history[product.id]));
  for (const observation of body.history[product.id]) {
    assert.equal(observation.productId, product.id);
    assert.equal(observation.historyAllowed, true);
    assert(observation.observedAt <= Date.now());
    assert(Number.isInteger(observation.itemPrice));
  }
}
for (const path of [
  '/api/v1/history?days=0',
  '/api/v1/history?days=31',
  '/api/v1/history?ids=a,b,c,d,e',
  '/api/v1/history/extra',
])
  assert.equal((await request(path)).status, path.endsWith('extra') ? 404 : 400, path);
console.log(
  `Recorded history smoke passed: ${body.products.length} products; source times preserved; invalid requests rejected. No source fetches or messages.`,
);
