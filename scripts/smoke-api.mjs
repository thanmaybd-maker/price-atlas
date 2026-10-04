import assert from 'node:assert/strict';
const base = process.env.TEST_URL || 'http://127.0.0.1:3000';
let passed = 0;
async function request(path, method = 'GET', body, cookie = '', origin = base) {
  const r = await fetch(`${base}/api/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get('set-cookie')?.split(';')[0],
  };
}
function check(name, test) {
  test();
  passed++;
  console.log(`PASS ${name}`);
}
let a, b;
try {
  const health = await request('health');
  check('health and explicit demo mode', () => {
    assert.equal(health.status, 200);
    assert.equal(health.data.mode, 'demo');
  });
  const search = await request('search?q=Pixel');
  check('canonical search', () => assert.equal(search.data.products[0].id, 'pixel-9'));
  const forbidden = await request(
    'session',
    'POST',
    { name: 'Rejected' },
    '',
    'https://untrusted.example',
  );
  check('cross-origin mutations denied', () => assert.equal(forbidden.status, 403));
  a = await request('session', 'POST', { name: 'Automated test Alice' });
  b = await request('session', 'POST', { name: 'Automated test Bob' });
  check('same-origin profiles created', () => {
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.ok(a.cookie);
  });
  const watch = await request('watches', 'POST', { productId: 'pixel-9' }, a.cookie);
  check('watch persisted', () => assert.equal(watch.status, 200));
  await request('watches/pixel-9', 'DELETE', undefined, b.cookie);
  const state = await request('session', 'GET', undefined, a.cookie);
  check('other profile cannot remove watch', () => assert.equal(state.data.watches.length, 1));
  const rule = await request('rules', 'POST', { productId: 'pixel-9', target: 99999999 }, a.cookie);
  check('valid target accepted', () => assert.equal(rule.status, 201));
  const intrusion = await request(
    'rules',
    'PATCH',
    { id: rule.data.rule.id, productId: 'pixel-9', target: 1 },
    b.cookie,
  );
  check('cross-account rule update denied', () => assert.equal(intrusion.status, 400));
  const after = await request('session', 'GET', undefined, a.cookie);
  check('qualifying target delivered in-app', () =>
    assert.equal(after.data.notifications[0]?.state, 'delivered'),
  );
  const invalid = await request('rules', 'POST', { productId: 'pixel-9', target: -100 }, a.cookie);
  check('negative money rejected', () => assert.equal(invalid.status, 400));
  const url = await request(
    'imports',
    'POST',
    { url: 'https://169.254.169.254/latest/meta-data' },
    a.cookie,
  );
  check('private-network import rejected', () => assert.equal(url.status, 400));
  const direct = await request(
    'imports',
    'POST',
    { url: 'https://www.amazon.in/dp/B012345678' },
    a.cookie,
  );
  check('unconnected provider is explicit', () => {
    assert.equal(direct.status, 422);
    assert.equal(direct.data.status, 'source_not_connected');
  });
  const admin = await request('admin/collect', 'POST', {}, a.cookie);
  check('operator mutation requires token', () => assert.equal(admin.status, 403));
  const exported = await request('export', 'GET', undefined, a.cookie);
  check('export is scoped to current account', () => {
    assert.equal(exported.data.user.id, a.data.user.id);
    assert.equal(exported.data.watches.length, 1);
  });
  console.log(`${passed} API smoke checks passed.`);
} finally {
  for (const profile of [a, b])
    if (profile?.cookie) await request('account', 'DELETE', undefined, profile.cookie);
}
