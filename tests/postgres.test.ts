import { beforeAll, afterAll, it, expect, vi } from 'vitest';
vi.mock('../packages/providers/nykaa-http', () => ({
  nykaaFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import * as store from '../packages/database/postgres';
import { demoPolicy } from '../packages/providers/index';
import { livePolicy } from '../packages/providers/live';
import { credentialFingerprint } from '../packages/jobs/provider-pool';
import {
  startCatalogExpansion,
  runCatalogExpansionStep,
  catalogExpansionStatus,
  parseCatalogPage,
} from '../packages/jobs/catalog-expansion';
import { deliverTestAlerts } from '../packages/notifications/test-alerts';
import { parseProductHtml } from '../packages/providers/scraper';
import { discoverProducts } from '../packages/jobs/discovery';
import {
  deliverNotifications,
  reserveSource,
  runCollectionJob,
  fetchProductWithBudget,
} from '../packages/jobs/index';
import {
  createTelegramLink,
  handleTelegramUpdate,
  telegramStatus,
  disconnectTelegram,
  deliverTelegram,
  TelegramError,
  reviewTelegramDelivery,
} from '../packages/notifications/telegram';
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
  await db.exec(
    await readFile(
      new URL('../packages/database/migrations/002_telegram.sql', import.meta.url),
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
  await db.exec(
    await readFile(
      new URL('../packages/database/migrations/003_collection_budget.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec(
    await readFile(
      new URL('../packages/database/migrations/004_test_alerts.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec(
    await readFile(
      new URL('../packages/database/migrations/005_credit_budget.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec(
    await readFile(
      new URL('../packages/database/migrations/006_live_search.sql', import.meta.url),
      'utf8',
    ),
  );
  store.useTestDatabase({
    query,
    connect: async () => ({ query, release: () => {} }),
  } as unknown as Pool);
  await db.exec(
    await readFile(
      new URL('../packages/database/migrations/007_retailers.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec(
    await readFile(
      new URL('../packages/database/migrations/008_provider_keys.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec(
    await readFile(
      new URL('../packages/database/migrations/009_catalog_expansion.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec(
    await readFile(
      new URL('../packages/database/migrations/010_provider_cursor.sql', import.meta.url),
      'utf8',
    ),
  );
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
  await store.importScraped(
    parseProductHtml(
      '<span id="productTitle">Old unavailable phone</span><div id="availability">Currently unavailable</div>',
      'https://www.amazon.in/dp/B000000001',
      current.observedAt - 20000,
    ),
    'older-unavailable',
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
it('links Telegram with a single-use hashed token and keeps connection status private', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'isolated-test-token';
  process.env.TELEGRAM_BOT_USERNAME = 'atlas_test_bot';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'isolated-test-webhook-secret-at-least-32-chars';
  const link = await createTelegramLink(alice),
    token = new URL(link.url).searchParams.get('start')!;
  expect(
    (await db.query<{ token_hash: string }>('SELECT token_hash FROM atlas.telegram_links')).rows[0]
      .token_hash,
  ).not.toBe(token);
  const update = {
    update_id: 1,
    message: {
      text: `/start ${token}`,
      from: { id: 123, is_bot: false },
      chat: { id: 123, type: 'private' },
    },
  };
  expect((await handleTelegramUpdate(update))?.text).toContain('Connected');
  expect(await telegramStatus(alice)).toMatchObject({ connected: true });
  expect(await telegramStatus(bob)).toMatchObject({ connected: false });
  expect(await handleTelegramUpdate(update)).toBeNull();
  expect((await handleTelegramUpdate({ ...update, update_id: 2 }))?.text).toContain('already used');
});
it('refuses group linking, expired links and silent transfer of another account’s chat', async () => {
  let link = await createTelegramLink(bob),
    token = new URL(link.url).searchParams.get('start');
  const update = {
    update_id: 3,
    message: {
      text: `/start ${token}`,
      from: { id: 123, is_bot: false },
      chat: { id: 123, type: 'group' },
    },
  };
  expect(await handleTelegramUpdate(update)).toBeNull();
  expect(
    (
      await handleTelegramUpdate({
        ...update,
        message: { ...update.message, chat: { id: 123, type: 'private' } },
      })
    )?.text,
  ).toContain('another');
  await db.query('UPDATE atlas.telegram_links SET expires_at=1 WHERE user_id=$1', [bob]);
  expect(
    (
      await handleTelegramUpdate({
        ...update,
        update_id: 4,
        message: {
          ...update.message,
          chat: { id: 456, type: 'private' },
          from: { id: 456, is_bot: false },
        },
      })
    )?.text,
  ).toContain('expired');
  expect(await telegramStatus(bob)).toMatchObject({ connected: false });
});
it('delivers a new Telegram episode once without backfilling pre-connection alerts', async () => {
  let calls = 0;
  await deliverTelegram(async () => {
    calls++;
    return 'old-should-not-send';
  });
  expect(calls).toBe(0);
  const rule = (await store.personal(alice)).rules.find((r) => r.id === ruleId)!;
  await store.saveRule(alice, { ...rule, target: 2700000 });
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  delete process.env.TELEGRAM_BOT_USERNAME;
  await db.query('UPDATE atlas.users SET suppressed=true WHERE id=$1', [alice]);
  let emailCalls = 0;
  await deliverNotifications({
    send: async () => {
      emailCalls++;
      return { id: 'should-not-send' };
    },
  });
  expect(emailCalls).toBe(0);
  await deliverTelegram(async (chat, text) => {
    calls++;
    expect(chat).toBe('123');
    expect(text).toContain('Test Phone');
    return 'telegram-1';
  });
  await deliverTelegram(async () => {
    calls++;
    return 'duplicate';
  });
  expect(calls).toBe(1);
  process.env.TELEGRAM_BOT_USERNAME = botUsername;
  await db.query('UPDATE atlas.users SET suppressed=false WHERE id=$1', [alice]);
  expect(
    (await db.query<{ state: string }>('SELECT state FROM atlas.telegram_deliveries')).rows[0]
      .state,
  ).toBe('sent');
});
it('holds ambiguous Telegram sends for review instead of retrying duplicate DMs', async () => {
  const rule = (await store.personal(alice)).rules.find((r) => r.id === ruleId)!;
  await store.saveRule(alice, { ...rule, target: 2800000 });
  let calls = 0;
  await deliverTelegram(async () => {
    calls++;
    throw new TelegramError('ambiguous');
  });
  await deliverTelegram(async () => {
    calls++;
    return 'duplicate';
  });
  expect(calls).toBe(1);
  expect(
    (
      await db.query<{ state: string }>(
        "SELECT state FROM atlas.telegram_deliveries WHERE last_error='ambiguous'",
      )
    ).rows[0].state,
  ).toBe('review');
});
it('respects Telegram retry-after and stops sending to blocked chats', async () => {
  const rule = (await store.personal(alice)).rules.find((r) => r.id === ruleId)!;
  await store.saveRule(alice, { ...rule, target: 2900000 });
  await deliverTelegram(async () => {
    throw new TelegramError('rate_limited', 120);
  });
  const row = (
    await db.query<{ next_attempt: number; state: string }>(
      "SELECT next_attempt,state FROM atlas.telegram_deliveries WHERE last_error='rate_limited'",
    )
  ).rows[0];
  expect(row.state).toBe('pending');
  expect(Number(row.next_attempt)).toBeGreaterThan(Date.now() + 110000);
  await db.query("UPDATE atlas.telegram_deliveries SET next_attempt=0 WHERE state='pending'");
  await deliverTelegram(async () => {
    throw new TelegramError('blocked');
  });
  expect(await telegramStatus(alice)).toMatchObject({ connected: false });
});
it('records operator closure of uncertain Telegram delivery without resending it', async () => {
  const row = (
    await db.query<{ notification_id: string }>(
      "SELECT notification_id FROM atlas.telegram_deliveries WHERE state='review'",
    )
  ).rows[0];
  await reviewTelegramDelivery(
    row.notification_id,
    'dismiss',
    alice,
    'Confirmed receipt in the test chat',
  );
  expect(
    (
      await db.query<{ state: string }>(
        'SELECT state FROM atlas.telegram_deliveries WHERE notification_id=$1',
        [row.notification_id],
      )
    ).rows[0].state,
  ).toBe('dismissed');
  expect(
    (
      await db.query('SELECT * FROM atlas.audit WHERE action=$1', [
        `telegram:dismiss:${row.notification_id}`,
      ])
    ).rows,
  ).toHaveLength(1);
});
it('disconnect and /stop remove only the linked account and invalidate pending link tokens', async () => {
  const link = await createTelegramLink(bob),
    token = new URL(link.url).searchParams.get('start');
  await handleTelegramUpdate({
    update_id: 5,
    message: {
      text: `/start ${token}`,
      from: { id: 456, is_bot: false },
      chat: { id: 456, type: 'private' },
    },
  });
  await disconnectTelegram(alice);
  expect(await telegramStatus(bob)).toMatchObject({ connected: true });
  await handleTelegramUpdate({
    update_id: 6,
    message: {
      text: '/stop',
      from: { id: 456, is_bot: false },
      chat: { id: 456, type: 'private' },
    },
  });
  expect(await telegramStatus(bob)).toMatchObject({ connected: false });
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_USERNAME;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
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
  process.env.SOURCE_POLICIES_JSON = JSON.stringify({
    Amazon: {
      ...demoPolicy('Amazon'),
      mode: 'retail',
      history: false,
      alerts: false,
      matching: false,
      agreementReference: null,
    },
  });
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
it('enables retailer tracking without pretending to hold a licensed feed agreement', () => {
  const saved = process.env.SOURCE_POLICIES_JSON;
  delete process.env.SOURCE_POLICIES_JSON;
  expect(livePolicy('Amazon')).toMatchObject({
    mode: 'retail',
    history: true,
    alerts: true,
    matching: true,
    agreementReference: null,
  });
  process.env.SOURCE_POLICIES_JSON = saved;
});
it('shares a canonical product only when exact category attributes agree', async () => {
  const base = {
    ...parseProductHtml(html(), 'https://www.amazon.in/dp/B000000010'),
    title: 'Sony WH-1000XM5 Bluetooth Headphones',
    attributes: {
      Brand: 'Sony',
      'Model Number': 'WH-1000XM5',
      Color: 'Black',
      Connectivity: 'Bluetooth',
    },
  };
  const a = await store.importScraped(base, 'match-amazon');
  const b = await store.importScraped(
    {
      ...base,
      store: 'Flipkart',
      externalId: 'ACC000000010',
      url: 'https://www.flipkart.com/headphones/p/itm123456789abc?pid=ACC000000010',
    },
    'match-flipkart',
  );
  expect(b.productId).toBe(a.productId);
  expect(await store.offers(a.productId)).toHaveLength(2);
  const different = await store.importScraped(
    {
      ...base,
      store: 'Flipkart',
      externalId: 'ACC000000011',
      attributes: { ...base.attributes, Color: 'Silver' },
    },
    'different-color',
  );
  expect(different.productId).not.toBe(a.productId);
  const incomplete = await store.importScraped(
    {
      ...base,
      store: 'Flipkart',
      externalId: 'ACC000000012',
      attributes: { Brand: 'Sony', 'Model Number': 'WH-1000XM5' },
    },
    'missing-fields',
  );
  expect(incomplete.productId).not.toBe(a.productId);
});
it('keeps simulated alerts out of live history and holds uncertain sends for review', async () => {
  const before = (await db.query('SELECT count(*) AS n FROM atlas.observations')).rows[0];
  await store.preferences(bob, true, true);
  const id = randomUUID(),
    message = {
      id,
      eventKey: id,
      userId: bob,
      email: 'bob@example.com',
      productId,
      title: 'Fixture',
      price: 10000,
      target: 11000,
      store: 'Amazon',
      observedAt: Date.now(),
      createdAt: Date.now(),
    };
  await db.query(
    "INSERT INTO atlas.test_alerts(id,user_id,channel,data,created_at) VALUES($1,$2,'email',$3,$4)",
    [id, bob, JSON.stringify({ message }), Date.now()],
  );
  let sends = 0;
  await deliverTestAlerts({
    send: async (m) => {
      expect(m.test).toBe(true);
      sends++;
      throw new Error('Ambiguous');
    },
  });
  await deliverTestAlerts({
    send: async () => {
      sends++;
      return { id: 'duplicate' };
    },
  });
  expect(sends).toBe(1);
  expect(
    (await db.query('SELECT state FROM atlas.test_alerts WHERE id=$1', [id])).rows[0].state,
  ).toBe('review');
  expect((await db.query('SELECT count(*) AS n FROM atlas.observations')).rows[0]).toEqual(before);
});
it('enforces the shared daily quota independently of each retailer minute quota', async () => {
  await db.query('UPDATE atlas.provider_state SET window_start=0,requests=0');
  process.env.SCRAPER_REQUESTS_PER_DAY = '1';
  await db.query('DELETE FROM atlas.collection_budget');
  await reserveSource('Amazon');
  await expect(reserveSource('Flipkart')).rejects.toMatchObject({ code: 'daily_budget' });
  delete process.env.SCRAPER_REQUESTS_PER_DAY;
});
it('keeps tracked listings hourly after a successful refresh', async () => {
  const imported = await store.importScraped(
    parseProductHtml(html(), 'https://www.amazon.in/dp/B000000030'),
    'tracked-initial',
  );
  await store.saveRule(bob, {
    productId: imported.productId,
    target: 100,
    basis: 'item',
    operator: 'lte',
    store: 'all',
    enabled: true,
  });
  const now = Date.now();
  await store.importScraped(
    parseProductHtml(html(), 'https://www.amazon.in/dp/B000000030'),
    'tracked-refresh',
  );
  const row = (
    await db.query<{ next_check: number }>('SELECT next_check FROM atlas.listings WHERE id=$1', [
      imported.productId,
    ])
  ).rows[0];
  expect(Number(row.next_check) - now).toBeGreaterThanOrEqual(3600000);
  expect(Number(row.next_check) - now).toBeLessThan(3610000);
});
it('reuses recent imports and separates daily catalog display from hourly alert eligibility', async () => {
  const saved = process.env.SOURCE_POLICIES_JSON;
  delete process.env.SOURCE_POLICIES_JSON;
  try {
    const url = 'https://www.amazon.in/dp/B000000040';
    const result = await store.importScraped(
      parseProductHtml(html(), url, Date.now() - 2 * 3600000),
      'daily-display',
    );
    const offer = (await store.offers(result.productId))[0];
    expect(offer.validUntil).toBeGreaterThan(Date.now());
    expect(offer.alertsAllowed).toBe(false);
    expect(await store.reusableListing(url)).toBeNull();
    const freshUrl = 'https://www.amazon.in/dp/B000000041';
    const fresh = await store.importScraped(parseProductHtml(html(), freshUrl), 'reuse-fresh');
    expect(await store.reusableListing(freshUrl)).toMatchObject({
      productId: fresh.productId,
      cached: true,
      observations: 0,
    });
  } finally {
    process.env.SOURCE_POLICIES_JSON = saved;
  }
});
it('reserves premium credits across sources and defers jobs without counting a retailer failure', async () => {
  process.env.SCRAPER_PROVIDER = 'scrapingbee';
  process.env.SCRAPER_PREMIUM_PROXY = 'true';
  process.env.SCRAPER_CREDITS_PER_DAY = '10';
  process.env.SCRAPER_DIRECT_FIRST = 'false';
  try {
    await db.query('DELETE FROM atlas.collection_budget');
    await db.query('UPDATE atlas.provider_state SET window_start=0,requests=0');
    await reserveSource('Amazon');
    await expect(reserveSource('Flipkart')).rejects.toMatchObject({ code: 'daily_budget' });
    const row = (
      await db.query<{ credits: number; requests: number }>(
        'SELECT credits,requests FROM atlas.collection_budget',
      )
    ).rows[0];
    expect(row).toEqual({ credits: 10, requests: 1 });
    const listingId = 'amazon-b000000030';
    const payload = {
      listingId,
      url: 'https://www.amazon.in/dp/B000000030',
      runKey: 'credit-deferred',
    };
    await db.query(
      "INSERT INTO atlas.jobs VALUES('credit-deferred','collect',$1,'pending',0,NULL,0,NULL,0)",
      [payload],
    );
    const before = (
      await db.query<{ failures: number }>('SELECT failures FROM atlas.listings WHERE id=$1', [
        listingId,
      ])
    ).rows[0];
    process.env.SCRAPER_REQUESTS_PER_DAY = '1';
    await runCollectionJob('credit-deferred');
    delete process.env.SCRAPER_REQUESTS_PER_DAY;
    expect(
      (
        await db.query(
          "SELECT state,attempts,last_error FROM atlas.jobs WHERE id='credit-deferred'",
        )
      ).rows[0],
    ).toEqual({ state: 'pending', attempts: 0, last_error: 'daily_budget' });
    expect(
      (await db.query('SELECT failures FROM atlas.listings WHERE id=$1', [listingId])).rows[0],
    ).toEqual(before);
    await db.query('UPDATE atlas.listings SET next_check=0 WHERE id=$1', [listingId]);
    await store.collect('no-duplicate-deferred');
    expect(
      (
        await db.query(
          "SELECT id FROM atlas.jobs WHERE payload->>'listingId'=$1 AND state IN ('pending','running')",
          [listingId],
        )
      ).rows,
    ).toHaveLength(1);
    process.env.SCRAPER_CREDITS_PER_DAY = '100';
    process.env.SCRAPER_CREDITS_PER_MONTH = '10';
    await expect(reserveSource('Flipkart')).rejects.toMatchObject({ code: 'monthly_budget' });
  } finally {
    delete process.env.SCRAPER_PROVIDER;
    delete process.env.SCRAPER_PREMIUM_PROXY;
    delete process.env.SCRAPER_CREDITS_PER_DAY;
    delete process.env.SCRAPER_CREDITS_PER_MONTH;
    delete process.env.SCRAPER_DIRECT_FIRST;
    delete process.env.SCRAPER_REQUESTS_PER_DAY;
  }
});
it('backs off a terminal blocked listing for a day instead of scraping it every minute', async () => {
  process.env.SCRAPER_PROVIDER = 'direct';
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('<title>Phone</title><button id="retry_btn">Retry</button>', {
      headers: { 'content-type': 'text/html' },
    }),
  );
  try {
    await db.query('UPDATE atlas.provider_state SET window_start=0,requests=0');
    const id = 'terminal-blocked',
      listingId = 'amazon-b000000040';
    await db.query("INSERT INTO atlas.jobs VALUES($1,'collect',$2,'pending',0,NULL,0,NULL,0)", [
      id,
      { listingId, url: 'https://www.amazon.in/dp/B000000040', runKey: 'blocked-backoff' },
    ]);
    const before = Date.now();
    await runCollectionJob(id);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      (await db.query('SELECT state,last_error FROM atlas.jobs WHERE id=$1', [id])).rows[0],
    ).toEqual({ state: 'failed', last_error: 'blocked' });
    const next = (
      await db.query<{ next_check: number }>('SELECT next_check FROM atlas.listings WHERE id=$1', [
        listingId,
      ])
    ).rows[0];
    expect(Number(next.next_check)).toBeGreaterThanOrEqual(before + 86400000);
  } finally {
    fetcher.mockRestore();
    delete process.env.SCRAPER_PROVIDER;
  }
});
it('discovers a custom product, imports verified details, and reuses shared search results without scraping again', async () => {
  await db.query('UPDATE atlas.provider_state SET window_start=0,requests=0');
  process.env.SCRAPER_CREDITS_PER_DAY = '0';
  process.env.SCRAPER_CREDITS_PER_MONTH = '0';
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (!['www.amazon.in', 'www.flipkart.com'].includes(url.hostname))
      return new Response('<title>No results</title>');
    if (url.hostname === 'www.amazon.in' && url.pathname === '/s')
      return new Response(
        '<div data-component-type="s-search-result" data-asin="B000000090"><h2>Acme QZ9 Kitchen Mixer</h2></div>',
      );
    if (url.hostname === 'www.amazon.in')
      return new Response(
        '<span id="productTitle">Acme QZ9 Kitchen Mixer</span><span class="a-price"><span class="a-offscreen">₹4,200</span></span><div id="availability">In stock</div><input id="add-to-cart-button">',
      );
    if (url.pathname === '/search')
      return new Response(
        '<a href="/acme-qz9-mixer/p/itm999?pid=HOM000000090" title="Acme QZ9 Kitchen Mixer"></a>',
      );
    return new Response(
      '<h1>Acme QZ9 Kitchen Mixer</h1><div class="Nx9bqj">₹4,300</div><button>Add to cart</button>',
    );
  });
  try {
    const result = await discoverProducts('Acme QZ9 mixer');
    expect(result?.state).toBe('complete');
    expect(result?.products).toHaveLength(2);
    expect(result?.products.every((p) => p?.category === 'appliances')).toBe(true);
    expect(result?.offers.every((o) => o.itemPrice > 0)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(14);
    const cached = await discoverProducts('  ACME qz9 Mixer  ');
    expect(cached?.cached).toBe(true);
    expect(cached?.products).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(14);
    const network = vi.fn().mockRejectedValue(new Error('Network should not be needed'));
    const recorded = await discoverProducts('QZ9 Acme mixer', 'all', { beforeNetwork: network });
    expect(recorded?.products).toHaveLength(2);
    expect(recorded?.message).toContain('recorded catalog');
    expect(network).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(14);
    expect(
      (
        await db.query('SELECT credits FROM atlas.collection_budget WHERE day=$1', [
          new Date().toISOString().slice(0, 10),
        ])
      ).rows[0].credits,
    ).toBe(10);
  } finally {
    fetcher.mockRestore();
    delete process.env.SCRAPER_CREDITS_PER_DAY;
    delete process.env.SCRAPER_CREDITS_PER_MONTH;
  }
});
it('permits free product checks but stops a denied lookup allowance before contacting the paid provider', async () => {
  await db.query('UPDATE atlas.provider_state SET window_start=0,requests=0');
  process.env.SCRAPER_PROVIDER = 'scrapingbee';
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('<title>Access denied</title>', { status: 403 }));
  try {
    await expect(
      fetchProductWithBudget('https://www.amazon.in/dp/B000000091', 1000, () => false),
    ).rejects.toMatchObject({ code: 'lookup_budget' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetcher.mock.calls[0][0])).hostname).toBe('www.amazon.in');
  } finally {
    fetcher.mockRestore();
    delete process.env.SCRAPER_PROVIDER;
  }
});
it('stores an international original-currency product without creating INR history or eligible offers', async () => {
  const url = 'https://www.bhphotovideo.com/c/product/1706293-REG/test.html';
  const product = parseProductHtml(
    '<script type="application/ld+json">' +
      JSON.stringify({
        '@type': 'Product',
        name: 'Test International Camera',
        url,
        offers: {
          '@type': 'Offer',
          url,
          price: 298,
          priceCurrency: 'USD',
          availability: 'InStock',
          itemCondition: 'NewCondition',
        },
      }) +
      '</script>',
    url,
  );
  const imported = await store.importScraped(product, 'foreign-only');
  expect(imported.observations).toBe(0);
  expect((await store.findProduct(imported.productId))?.attributes['Source currency']).toBe('USD');
  expect(await store.offers(imported.productId)).toHaveLength(0);
  expect(await store.history(imported.productId)).toHaveLength(0);
});
it('never spends paid credits during an ordinary product-name search', async () => {
  await db.query('UPDATE atlas.provider_state SET window_start=0,requests=0');
  const policies = process.env.SOURCE_POLICIES_JSON;
  const key = process.env.SCRAPINGBEE_API_KEY;
  process.env.SOURCE_POLICIES_JSON = JSON.stringify({
    Amazon: { ...livePolicy('Amazon'), requestsPerMinute: 12 },
  });
  process.env.SCRAPER_PROVIDER = 'scrapingbee';
  process.env.SCRAPINGBEE_API_KEY = 'isolated-fixture';
  const paid: URL[] = [];
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'html.duckduckgo.com') return new Response('<title>No results</title>');
    if (url.hostname !== 'app.scrapingbee.com') return new Response('Blocked', { status: 403 });
    const target = new URL(url.searchParams.get('url')!);
    paid.push(target);
    if (target.hostname === 'www.amazon.in' && target.pathname === '/s')
      return new Response(
        '<div data-component-type="s-search-result" data-asin="B000000092"><h2>Acme ZX8 Kitchen Mixer</h2></div>',
      );
    if (target.hostname === 'www.flipkart.com' && target.pathname === '/search')
      return new Response(
        '<a href="/acme-zx8/p/itm999?pid=HOM000000092" title="Acme ZX8 Kitchen Mixer"></a>',
      );
    if (target.hostname === 'www.amazon.in')
      return new Response(
        '<span id="productTitle">Acme ZX8 Kitchen Mixer</span><span class="a-price"><span class="a-offscreen">₹5,000</span></span><input id="add-to-cart-button">',
      );
    return new Response(
      '<h1>Acme ZX8 Kitchen Mixer</h1><div class="Nx9bqj">₹5,200</div><button>Add to cart</button>',
    );
  });
  try {
    const result = await discoverProducts('Acme ZX8 mixer');
    expect(result?.products).toHaveLength(0);
    expect(paid).toHaveLength(0);
  } finally {
    fetcher.mockRestore();
    process.env.SOURCE_POLICIES_JSON = policies;
    delete process.env.SCRAPER_PROVIDER;
    if (key) process.env.SCRAPINGBEE_API_KEY = key;
    else delete process.env.SCRAPINGBEE_API_KEY;
  }
});
it('fails over an exhausted account and skips it on subsequent requests without persisting API keys', async () => {
  await db.query('UPDATE atlas.provider_state SET window_start=0,requests=0');
  const saved = { ...process.env };
  process.env.SCRAPER_PROVIDER = 'scrapingbee';
  process.env.SCRAPER_DIRECT_FIRST = 'false';
  process.env.SCRAPINGBEE_API_KEY = 'fixture-primary-exhausted';
  process.env.SCRAPINGBEE_FALLBACK_API_KEYS = 'fixture-backup-active';
  const auth: string[] = [];
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, options) => {
    const header = new Headers(options?.headers).get('Authorization') || '';
    auth.push(header);
    return header === 'Bearer fixture-primary-exhausted'
      ? new Response('', { status: 402 })
      : new Response(html());
  });
  try {
    await expect(
      fetchProductWithBudget('https://www.amazon.in/dp/B000000093'),
    ).resolves.toMatchObject({ itemPrice: 2500000 });
    expect(auth).toEqual(['Bearer fixture-primary-exhausted', 'Bearer fixture-backup-active']);
    const state = (
      await db.query('SELECT * FROM atlas.provider_keys WHERE fingerprint=$1', [
        credentialFingerprint('fixture-primary-exhausted'),
      ])
    ).rows[0];
    expect(state.disabled).toBe(true);
    expect(JSON.stringify(state)).not.toContain('fixture-primary');
    await db.query('DELETE FROM atlas.provider_keys WHERE fingerprint=$1', [
      credentialFingerprint('fixture-primary-exhausted'),
    ]);
    await db.query('UPDATE atlas.provider_state SET window_start=0,requests=0');
    auth.length = 0;
    await fetchProductWithBudget('https://www.amazon.in/dp/B000000093');
    expect(auth).toEqual(['Bearer fixture-backup-active']);
  } finally {
    fetcher.mockRestore();
    for (const key of [
      'SCRAPER_PROVIDER',
      'SCRAPER_DIRECT_FIRST',
      'SCRAPINGBEE_API_KEY',
      'SCRAPINGBEE_FALLBACK_API_KEYS',
    ]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
it('fails over a temporary provider outage but does not rotate accounts for a retailer CAPTCHA', async () => {
  await db.query('UPDATE atlas.provider_state SET window_start=0,requests=0');
  const saved = { ...process.env };
  process.env.SCRAPER_PROVIDER = 'scrapingbee';
  process.env.SCRAPER_DIRECT_FIRST = 'false';
  process.env.SCRAPINGBEE_API_KEY = 'fixture-temporary';
  process.env.SCRAPINGBEE_FALLBACK_API_KEYS = 'fixture-temporary-backup';
  let calls = 0;
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () =>
      ++calls === 1 ? new Response('', { status: 503 }) : new Response(html()),
    );
  try {
    await fetchProductWithBudget('https://www.amazon.in/dp/B000000094');
    expect(calls).toBe(2);
    const state = (
      await db.query('SELECT disabled,retry_after FROM atlas.provider_keys WHERE fingerprint=$1', [
        credentialFingerprint('fixture-temporary'),
      ])
    ).rows[0];
    expect(state.disabled).toBe(false);
    expect(Number(state.retry_after)).toBeGreaterThan(Date.now());
    await db.query('UPDATE atlas.provider_state SET window_start=0,requests=0');
    fetcher.mockResolvedValue(new Response('<title>Robot Check</title>'));
    fetcher.mockClear();
    await expect(
      fetchProductWithBudget('https://www.amazon.in/dp/B000000094'),
    ).rejects.toMatchObject({ code: 'blocked' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    fetcher.mockRestore();
    for (const key of [
      'SCRAPER_PROVIDER',
      'SCRAPER_DIRECT_FIRST',
      'SCRAPINGBEE_API_KEY',
      'SCRAPINGBEE_FALLBACK_API_KEYS',
    ]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
it('expands unique base products from free catalog discovery but saves only verified product-page prices', async () => {
  await db.query('UPDATE atlas.provider_state SET window_start=0,requests=0');
  const url = 'https://www.nykaa.com/test-lipstick/p/900001';
  const listing = {
    categoryListing: {
      pageNumber: 1,
      listingData: {
        totalFound: 1,
        products: [
          { parentId: '900001', slug: '/test-lipstick/p/900001', name: 'Test Lipstick', price: 1 },
          {
            parentId: '900001',
            slug: '/test-lipstick/p/900001?skuId=900003',
            name: 'Other shade',
            price: 1,
          },
        ],
      },
    },
  };
  const listHtml = `<script>window.__PRELOADED_STATE__ = ${JSON.stringify(listing)}</script>`;
  expect(parseCatalogPage(listHtml, 1).products).toHaveLength(1);
  expect(() => parseCatalogPage(listHtml, 2)).toThrow();
  const secondPageHtml = listHtml.replace('"pageNumber":1', '"pageNumber":"2"');
  expect(parseCatalogPage(secondPageHtml, 2).products).toHaveLength(1);
  const variant = {
    childId: '900002',
    sku: 'TEST_ROSE',
    name: 'Test Lipstick Rose',
    offerPrice: 50,
    inStock: true,
    buttonText: 'ADD TO BAG',
    packSize: '4g',
    variantName: 'Rose',
  };
  const state = {
    productPage: { product: { id: '900001', selectedVariantId: '900002', variants: [variant] } },
  };
  const product = {
    '@type': 'Product',
    name: variant.name,
    sku: variant.sku,
    url,
    brand: 'Test',
    offers: { '@type': 'Offer', url, price: 50, priceCurrency: 'INR', availability: 'InStock' },
  };
  const pageHtml = `<script>window.__PRELOADED_STATE__ = ${JSON.stringify(state)}</script><script type="application/ld+json">${JSON.stringify(product)}</script>`;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (input) => new Response(String(input).includes('/c/') ? listHtml : pageHtml),
    );
  await startCatalogExpansion(1);
  for (let i = 0; i < 5; i++) await runCatalogExpansionStep(fetcher);
  const status = await catalogExpansionStatus();
  expect(status.enabled).toBe(false);
  expect(status.counts.verified).toBe(1);
  const row = (
    await db.query(
      "SELECT product_id,catalog_interval_minutes FROM atlas.listings WHERE store='Nykaa' AND external_id='900002'",
    )
  ).rows[0];
  expect(row.catalog_interval_minutes).toBe(10080);
  expect((await store.offers(row.product_id))[0].itemPrice).toBe(5000);
  expect((await store.findProduct(row.product_id))?.category).toBe('beauty');
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it('preserves the expansion frontier and pauses until the next UTC day when the shared request budget is exhausted', async () => {
  await startCatalogExpansion(2);
  await db.query(
    "INSERT INTO atlas.catalog_frontier(id,url,name,priority) VALUES('900010','https://www.nykaa.com/another-lipstick/p/900010','Another lipstick',0)",
  );
  const prior = process.env.SCRAPER_REQUESTS_PER_DAY;
  process.env.SCRAPER_REQUESTS_PER_DAY = '1';
  const fetcher = vi.fn<typeof fetch>();
  try {
    expect(await runCatalogExpansionStep(fetcher)).toMatchObject({
      event: 'catalog_budget_pause',
      code: 'daily_budget',
    });
    expect(fetcher).not.toHaveBeenCalled();
    const status = await catalogExpansionStatus();
    expect(Number(status.blocked_until)).toBeGreaterThan(Date.now());
    expect(status.counts.pending).toBe(1);
    expect(
      (await db.query("SELECT attempts,state FROM atlas.catalog_frontier WHERE id='900010'"))
        .rows[0],
    ).toEqual({ attempts: 0, state: 'pending' });
    expect(await runCatalogExpansionStep(fetcher)).toEqual({ event: 'catalog_idle' });
  } finally {
    if (prior === undefined) delete process.env.SCRAPER_REQUESTS_PER_DAY;
    else process.env.SCRAPER_REQUESTS_PER_DAY = prior;
  }
});
