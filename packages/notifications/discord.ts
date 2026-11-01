// Discord price alerts through a channel webhook the user pastes in Settings.
// Free, no bot or domain needed. The URL is a secret: stored server-side, never echoed back.
import { postgres } from '../database/postgres';
import { publicOrigin } from './origin';
import { money } from '../domain/index';

const WEBHOOK =
  /^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;

export function cleanDiscordWebhook(url: string): string {
  const trimmed = url.trim().replace(/^["']|["']$/g, '');
  try {
    const parsed = new URL(trimmed);
    parsed.search = '';
    parsed.hash = '';
    let pathname = parsed.pathname;
    if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    parsed.pathname = pathname;
    return parsed.href;
  } catch {
    return trimmed;
  }
}

export const validDiscordWebhook = (url: string) => WEBHOOK.test(cleanDiscordWebhook(url));

let ensured: Promise<void> | null = null;
/** Same DDL as migrations/012_discord.sql, so the feature works before `pnpm migrate` runs. */
export function ensureTables() {
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

type Embed = {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  footer?: { text: string };
  timestamp?: string;
};
const GREEN = 0x1f7a4c;

/** Posts text, optionally with one rich embed card. Retries one short Discord rate limit. */
export async function postDiscord(
  url: string,
  content: string,
  f: typeof fetch = fetch,
  embed?: Embed,
) {
  const body = JSON.stringify({
    content,
    embeds: embed ? [embed] : undefined,
    username: 'Price Atlas',
    allowed_mentions: { parse: [] },
  });
  const send = () =>
    f(`${url}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
  let res = await send();
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after') || 0);
    if (retryAfter > 0 && retryAfter <= 2) {
      await new Promise((resolve) => setTimeout(resolve, Math.ceil(retryAfter * 1000)));
      res = await send();
    }
  }
  await res.body?.cancel().catch(() => {});
  if (!res.ok) throw new Error(res.status === 404 ? 'webhook_deleted' : `http_${res.status}`);
}

/** The alert as a Discord card: product, price vs target, savings, store, link. */
export function alertEmbed(
  d: {
    title: string;
    store: string;
    price: number;
    target: number;
    productId: string;
    observedAt?: number;
  },
  origin: string,
  imageUrl?: string | null,
): Embed {
  const below = d.target - d.price;
  return {
    title: d.title.slice(0, 250),
    url: `${origin}/p/${encodeURIComponent(d.productId)}`,
    description: `Price hit your target at **${d.store}**.`,
    color: GREEN,
    fields: [
      { name: 'Price now', value: `**${money(d.price)}**`, inline: true },
      { name: 'Your target', value: money(d.target), inline: true },
      ...(below > 0 ? [{ name: 'Under target by', value: money(below), inline: true }] : []),
    ],
    ...(imageUrl && /^https:\/\//.test(imageUrl) ? { thumbnail: { url: imageUrl } } : {}),
    footer: { text: 'Price Atlas · prices and stock can change at the store' },
    ...(d.observedAt ? { timestamp: new Date(d.observedAt).toISOString() } : {}),
  };
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
export async function connectDiscord(userId: string, rawUrl: string, f: typeof fetch = fetch) {
  const url = cleanDiscordWebhook(rawUrl);
  if (!validDiscordWebhook(url)) return { ok: false as const, reason: 'invalid_url' };
  await ensureTables();
  try {
    await postDiscord(url, '', f, {
      title: 'Price Atlas is connected',
      description:
        'Alerts for your price targets will appear in this channel the moment a checked, in-stock price reaches your target.',
      color: GREEN,
      footer: { text: 'Manage alerts in Price Atlas → Settings' },
    });
  } catch (e) {
    return { ok: false as const, reason: (e as Error).message };
  }
  await postgres().query(
    'INSERT INTO atlas.discord_connections VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET webhook_url=excluded.webhook_url,connected_at=excluded.connected_at',
    [userId, url, Date.now()],
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
    await postDiscord(row.webhook_url, '', f, {
      title: 'Test alert',
      description:
        'This is how a price alert looks. No price changed; real alerts arrive when a fresh, in-stock price reaches your target.',
      color: 0x8e99b8,
      footer: { text: 'Price Atlas test' },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/** Sends delivered in-app alerts created after the user connected Discord, once each. */
export async function deliverDiscord(f: typeof fetch = fetch) {
  await ensureTables();
  const origin = publicOrigin();
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
      observedAt?: number;
    };
    // Claim first so a retry never double-posts.
    const claim = await postgres().query(
      "INSERT INTO atlas.discord_deliveries VALUES($1,'sending',$2) ON CONFLICT DO NOTHING RETURNING notification_id",
      [n.id, Date.now()],
    );
    if (!claim.rows.length) continue;
    try {
      const image = (
        await postgres()
          .query("SELECT data->>'imageUrl' AS image FROM atlas.products WHERE id=$1", [d.productId])
          .catch(() => ({ rows: [] as { image?: string }[] }))
      ).rows[0]?.image;
      await postDiscord(n.webhook_url, '🔔 Price alert', f, alertEmbed(d, origin, image));
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

export async function reviewDiscordDelivery(
  notificationId: string,
  decision: 'retry' | 'dismiss',
  actor: string,
  reason: string,
) {
  await ensureTables();
  if (decision === 'retry') {
    await postgres().query(
      "DELETE FROM atlas.discord_deliveries WHERE notification_id=$1 AND state IN ('failed', 'sending')",
      [notificationId],
    );
  } else {
    await postgres().query(
      "UPDATE atlas.discord_deliveries SET state='dismissed', last_error=$2 WHERE notification_id=$1",
      [notificationId, `Dismissed by operator ${actor}: ${reason}`],
    );
  }
}
