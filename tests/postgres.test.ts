import { beforeAll, afterAll, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import * as store from '../packages/database/postgres';
import { demoPolicy } from '../packages/providers/index';
import { parseProductHtml } from '../packages/providers/scraper';
import { deliverNotifications, reserveSource } from '../packages/jobs/index';
const db = new PGlite();
const alice = randomUUID(),
  bob = randomUUID();
const html = (price = '₹25,000') =>
  `<span id="productTitle">Test Phone 128 GB</span><span class="a-price"><span class="a-offscreen">${price}</span></span><div id="availability">In stock</div><input id="add-to-cart-button"><div id="deliveryBlockMessage">FREE delivery</div>`;
let productId: string, ruleId: string;
beforeAll(async () => {
  await db.exec(
    await readFile(
      new URL('../packages/database/migrations/001_live.sql', import.meta.url),
      'utf8',
    ),
  );
  const query = async (sql: string, params: unknown[] = []) => {
    const r = await db.query(
      sql,
      params.map((v) => (v && typeof v === 'object' ? JSON.stringify(v) : v)),
    );
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  store.useTestDatabase({
    query,
    connect: async () => ({ query, release: () => {} }),
  } as unknown as Pool);
  process.env.DATABASE_URL = 'isolated-tests';
  process.env.SOURCE_POLICIES_JSON = JSON.stringify({
    Amazon: {
      ...demoPolicy('Amazon'),
      mode: 'live',
      agreementReference: 'test-only-authorized-fixture',
      requestsPerMinute: 2,
    },
  });
  process.env.EMAIL_FROM = 'test@example.com';
  process.env.UNSUBSCRIBE_SECRET = 'test-only-secret-that-is-at-least-32-characters';
  process.env.APP_ORIGIN = 'https://atlas.example';
  await store.syncAccount({ id: alice, email: 'alice@example.com', email_confirmed_at: 'now' });
  await store.syncAccount({ id: bob, email: 'bob@example.com', email_confirmed_at: 'now' });
  const result = await store.importScraped(
    parseProductHtml(html(), 'https://www.amazon.in/dp/B000000001'),
    'run1',
  );
  productId = result.productId;
}, 30000);
afterAll(async () => {
  delete process.env.SOURCE_POLICIES_JSON;
  await db.close();
});
it('starts a live catalog without seeding any synthetic products', async () => {
  expect(await store.catalog()).toHaveLength(1);
  expect((await store.catalog())[0].sourceKind).toBe('live');
});
it('enforces RLS even when a query omits an ownership WHERE clause', async () => {
  await store.saveWatch(alice, productId);
  expect((await store.personal(alice)).watches).toHaveLength(1);
  expect((await store.personal(bob)).watches).toHaveLength(0);
  await store.removeWatch(bob, productId);
  expect((await store.personal(alice)).watches).toHaveLength(1);
  await expect(
    store.tx(
      (c) =>
        c.query('INSERT INTO atlas.watches VALUES($1,$2,$3,$4,$5)', [
          randomUUID(),
          alice,
          productId,
          'Intrusion',
          Date.now(),
        ]),
      bob,
    ),
  ).rejects.toThrow(/row-level security/);
});
it('deduplicates logical observations and keeps a late response from replacing the projection', async () => {
  const current = (await store.offers(productId))[0];
  await store.importScraped(
    parseProductHtml(html(), 'https://www.amazon.in/dp/B000000001', current.observedAt - 10000),
    'older',
  );
  expect((await store.offers(productId))[0].id).toBe(current.id);
  expect(
    (
      await store.importScraped(
        parseProductHtml(html(), 'https://www.amazon.in/dp/B000000001'),
        'run1',
      )
    ).observations,
  ).toBe(0);
});
it('creates one qualifying episode and refuses cross-account rule edits', async () => {
  const r = await store.saveRule(alice, {
    productId,
    target: 2500000,
    store: 'all',
    basis: 'delivered',
    operator: 'lte',
    enabled: true,
  });
  ruleId = r.id;
  await store.dispatch();
  expect((await store.personal(alice)).notifications).toHaveLength(1);
  expect((await store.personal(alice)).notifications[0].state).toBe('delivered');
  await expect(store.saveRule(bob, { ...r, target: 1 })).rejects.toThrow('Rule not found');
  await store.saveRule(alice, { ...r, enabled: false });
  await store.saveRule(alice, { ...r, enabled: true });
  expect((await store.personal(alice)).notifications).toHaveLength(1);
});
it('sends to an opted-in verified destination once and records the provider receipt', async () => {
  await store.preferences(alice, true, true);
  let sends = 0;
  await deliverNotifications({
    send: async () => {
      sends++;
      return { id: 'test-provider-id' };
    },
  });
  await deliverNotifications({
    send: async () => {
      sends++;
      return { id: 'unexpected' };
    },
  });
  expect(sends).toBe(1);
  expect((await store.personal(alice)).notifications[0].email_state).toBe('sent');
});
it('quarantines a major price anomaly without projecting or triggering it', async () => {
  const before = (await store.offers(productId))[0];
  const r = await store.importScraped(
    parseProductHtml(html('₹1'), 'https://www.amazon.in/dp/B000000001'),
    'anomaly',
  );
  expect(r.quarantined).toBe(true);
  expect((await store.offers(productId))[0].id).toBe(before.id);
});
it('reserves a source quota transactionally', async () => {
  await reserveSource('Amazon');
  await reserveSource('Amazon');
  await expect(reserveSource('Amazon')).rejects.toMatchObject({ code: 'rate_limited' });
});
it('revoked source capabilities immediately stop historical display and alert eligibility', async () => {
  const saved = process.env.SOURCE_POLICIES_JSON;
  delete process.env.SOURCE_POLICIES_JSON;
  expect(await store.history(productId)).toHaveLength(0);
  expect((await store.offers(productId))[0].alertsAllowed).toBe(false);
  process.env.SOURCE_POLICIES_JSON = saved;
});
it('removes a previous in-stock projection when the latest successful page has no stock or price', async () => {
  const unavailable = parseProductHtml(
    '<span id="productTitle">Test Phone 128 GB</span><div id="availability">Currently unavailable</div>',
    'https://www.amazon.in/dp/B000000001',
  );
  await store.importScraped(unavailable, 'no-stock');
  expect(await store.offers(productId)).toHaveLength(0);
});
it('reclaims expired job leases from the database', async () => {
  await db.query("INSERT INTO atlas.jobs VALUES('expired','collect','{}','running',0,1,1,NULL,0)");
  await store.maintenance();
  expect(
    (await db.query<{ state: string }>("SELECT state FROM atlas.jobs WHERE id='expired'")).rows[0]
      .state,
  ).toBe('pending');
});
it('uses deletion tombstones to prevent restored identities from resurrecting personal data', async () => {
  await store.deleteAccount(alice);
  expect((await store.personal(alice)).rules).toHaveLength(0);
  await expect(
    store.syncAccount({ id: alice, email: 'alice@example.com', email_confirmed_at: 'now' }),
  ).rejects.toThrow('deleted');
});
