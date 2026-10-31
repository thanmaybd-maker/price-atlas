// Discord price alerts through a channel webhook the user pastes in Settings.
// Free, no bot or domain needed. The URL is a secret: stored server-side, never echoed back.
import { postgres } from '../database/postgres';
import { money } from '../domain/index';

const WEBHOOK =
  /^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;
export const validDiscordWebhook = (url: string) => WEBHOOK.test(url.trim());

let ensured: Promise<void> | null = null;
/** Same DDL as migrations/012_discord.sql, so the feature works before `pnpm migrate` runs. */
function ensureTables() {
  ensured ||= postgres()
    .query(
      `CREATE TABLE IF NOT EXISTS atlas.discord_connections (user_id uuid PRIMARY KEY REFERENCES atlas.users(id) ON DELETE CASCADE, webhook_url text NOT NULL, connected_at bigint NOT NULL);
       CREATE TABLE IF NOT EXISTS atlas.discord_deliveries (notification_id uuid PRIMARY KEY REFERENCES atlas.notifications(id) ON DELETE CASCADE, state text NOT NULL DEFAULT 'sent', sent_at bigint NOT NULL, last_error text);`,
    )
    .then(() => undefined)
    .catch((e) => {
      ensured = null;
      throw e;
    });
  return ensured;
}

export async function postDiscord(url: string, content: string, f: typeof fetch = fetch) {
  const res = await f(`${url}?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, username: 'Price Atlas', allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  await res.body?.cancel().catch(() => {});
  if (!res.ok) throw new Error(res.status === 404 ? 'webhook_deleted' : `http_${res.status}`);
}

export async function discordStatus(userId: string) {
  await ensureTables();
  const row = (
    await postgres().query('SELECT connected_at FROM atlas.discord_connections WHERE user_id=$1', [
      userId,
    ])
  ).rows[0];
  return { connected: Boolean(row), connectedAt: row ? Number(row.connected_at) : null };
}

/** Saves the webhook only after Discord accepts a confirmation message through it. */
export async function connectDiscord(userId: string, url: string, f: typeof fetch = fetch) {
  if (!validDiscordWebhook(url)) return { ok: false as const, reason: 'invalid_url' };
  await ensureTables();
  try {
    await postDiscord(
      url.trim(),
      '✅ Price Atlas is connected. Price alerts for your targets will appear in this channel.',
      f,
    );
  } catch (e) {
    return { ok: false as const, reason: (e as Error).message };
  }
  await postgres().query(
    'INSERT INTO atlas.discord_connections VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET webhook_url=excluded.webhook_url,connected_at=excluded.connected_at',
    [userId, url.trim(), Date.now()],
  );
  return { ok: true as const };
}

export async function disconnectDiscord(userId: string) {
  await ensureTables();
  await postgres().query('DELETE FROM atlas.discord_connections WHERE user_id=$1', [userId]);
}

export async function sendDiscordTest(userId: string, f: typeof fetch = fetch) {
  await ensureTables();
  const row = (
    await postgres().query('SELECT webhook_url FROM atlas.discord_connections WHERE user_id=$1', [
      userId,
    ])
  ).rows[0];
  if (!row) return { ok: false, reason: 'not_connected' };
  try {
    await postDiscord(
      row.webhook_url,
      'Price Atlas test alert. No price changed; real alerts arrive when a fresh in-stock offer reaches your target.',
      f,
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/** Sends delivered in-app alerts created after the user connected Discord, once each. */
export async function deliverDiscord(f: typeof fetch = fetch) {
  await ensureTables();
  const origin = process.env.EMAIL_LINK_ORIGIN || process.env.APP_ORIGIN || '';
  const due = (
    await postgres().query(
      `SELECT n.id,n.data,c.webhook_url FROM atlas.notifications n
       JOIN atlas.discord_connections c ON c.user_id=n.user_id
       JOIN atlas.users u ON u.id=n.user_id AND u.notifications=1
       WHERE n.state='delivered' AND n.created_at>=c.connected_at
         AND NOT EXISTS(SELECT 1 FROM atlas.discord_deliveries d WHERE d.notification_id=n.id)
       ORDER BY n.created_at LIMIT 20`,
    )
  ).rows;
  for (const n of due) {
    const d = n.data as {
      title: string;
      store: string;
      price: number;
      target: number;
      productId: string;
    };
    // Claim first so a retry never double-posts.
    const claim = await postgres().query(
      "INSERT INTO atlas.discord_deliveries VALUES($1,'sending',$2) ON CONFLICT DO NOTHING RETURNING notification_id",
      [n.id, Date.now()],
    );
    if (!claim.rows.length) continue;
    try {
      await postDiscord(
        n.webhook_url,
        `🔔 **${d.title}**\n${d.store}: **${money(d.price)}** (your target ${money(d.target)})${origin ? `\n${origin}/p/${encodeURIComponent(d.productId)}` : ''}\nPrices and stock can change at the store.`,
        f,
      );
      await postgres().query(
        "UPDATE atlas.discord_deliveries SET state='sent' WHERE notification_id=$1",
        [n.id],
      );
    } catch (e) {
      await postgres().query(
        "UPDATE atlas.discord_deliveries SET state='failed',last_error=$2 WHERE notification_id=$1",
        [n.id, (e as Error).message],
      );
    }
  }
  return due.length;
}
