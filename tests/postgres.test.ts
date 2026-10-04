import { beforeAll, afterAll, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import * as store from '../packages/database/postgres';
import { demoPolicy } from '../packages/providers/index';
import { parseProductHtml } from '../packages/providers/scraper';
import { deliverNotifications, reserveSource } from '../packages/jobs/index';
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
