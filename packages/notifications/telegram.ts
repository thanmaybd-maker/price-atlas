import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { postgres, tx, offers } from '../database/postgres';
import { money, rank, type Rule } from '../domain/index';
import { z } from 'zod';

export function telegramConfigured() {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
    /^[A-Za-z0-9_]{5,32}bot$/i.test(process.env.TELEGRAM_BOT_USERNAME || '') &&
    (process.env.TELEGRAM_WEBHOOK_SECRET || '').length >= 32,
  );
}
export function telegramSecretValid(value: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  return (
    expected.length >= 32 &&
    value !== null &&
    Buffer.byteLength(value) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(value), Buffer.from(expected))
  );
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function telegramStatus(userId: string) {
  return tx(async (c) => {
    const row = (await c.query('SELECT enabled,connected_at FROM atlas.telegram_connections'))
      .rows[0];
    return {
      configured: telegramConfigured(),
      connected: !!row?.enabled,
      connectedAt: row?.enabled ? Number(row.connected_at) : null,
    };
  }, userId);
}
export async function createTelegramLink(userId: string) {
  if (!telegramConfigured()) throw new Error('Telegram is awaiting bot setup.');
  const token = randomBytes(24).toString('base64url');
  await tx(async (c) => {
    await c.query('DELETE FROM atlas.telegram_links');
    await c.query('INSERT INTO atlas.telegram_links VALUES($1,$2,$3)', [
      hash(token),
      userId,
      Date.now() + 10 * 60000,
    ]);
  }, userId);
  return {
    url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${token}`,
    expiresInSeconds: 600,
  };
}
export async function disconnectTelegram(userId: string) {
  await tx(async (c) => {
    await c.query('DELETE FROM atlas.telegram_links');
    await c.query('DELETE FROM atlas.telegram_connections');
  }, userId);
}
export async function reviewTelegramDelivery(
  id: string,
  decision: 'retry' | 'dismiss',
  actor: string,
  reason: string,
) {
  await tx(async (c) => {
    const updated = await c.query(
      "UPDATE atlas.telegram_deliveries SET state=$2,next_attempt=$3,attempts=0 WHERE notification_id=$1 AND state IN ('review','failed') RETURNING notification_id",
      [id, decision === 'retry' ? 'pending' : 'dismissed', Date.now()],
    );
    if (!updated.rows.length) throw new Error('Telegram delivery is not awaiting review.');
    await c.query('INSERT INTO atlas.audit VALUES($1,$2,$3,$4,$5)', [
      randomUUID(),
      actor,
      `telegram:${decision}:${id}`,
      reason,
      Date.now(),
    ]);
  });
}
const updateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z
    .object({
      text: z.string().max(4096).optional(),
      from: z.object({ id: z.number().int().positive(), is_bot: z.boolean() }).optional(),
      chat: z.object({ id: z.number().int(), type: z.string() }),
    })
    .optional(),
});
export async function handleTelegramUpdate(input: unknown) {
  const update = updateSchema.parse(input),
    message = update.message;
  if (
    !message ||
    message.chat.type !== 'private' ||
    !message.from ||
    message.from.is_bot ||
    message.chat.id !== message.from.id
  )
    return null;
  const text = message.text || '',
    chat = String(message.chat.id);
  return tx(async (c) => {
    const event = await c.query(
      'INSERT INTO atlas.webhook_events VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',
      [`telegram:${update.update_id}`, 'telegram.update', Date.now()],
    );
    if (!event.rows.length) return null;
    if (/^\/stop(?:@[\w]+)?$/.test(text.trim())) {
      await c.query('DELETE FROM atlas.telegram_connections WHERE chat_id=$1', [chat]);
      return {
        method: 'sendMessage',
        chat_id: chat,
        text: 'Telegram price alerts disconnected. Reconnect from Price Atlas Settings whenever you want.',
      };
    }
    const token = /^\/start(?:@[\w]+)? ([A-Za-z0-9_-]{32})$/.exec(text.trim())?.[1];
    if (!token)
      return {
        method: 'sendMessage',
        chat_id: chat,
        text: 'To connect price alerts, sign in to Price Atlas and choose Settings → Connect Telegram. Send /stop to disconnect.',
      };
    const link = (
      await c.query(
        'SELECT * FROM atlas.telegram_links WHERE token_hash=$1 AND expires_at>$2 FOR UPDATE',
        [hash(token), Date.now()],
      )
    ).rows[0];
    if (!link)
      return {
        method: 'sendMessage',
        chat_id: chat,
        text: 'That connection link expired or was already used. Create a new link in Price Atlas Settings.',
      };
    // A chat already linked to a different account must be disconnected explicitly.
    const occupied = (
      await c.query('SELECT user_id FROM atlas.telegram_connections WHERE chat_id=$1 FOR UPDATE', [
        chat,
      ])
    ).rows[0];
    if (occupied && occupied.user_id !== link.user_id)
      return {
        method: 'sendMessage',
        chat_id: chat,
        text: 'This chat is already linked to another Price Atlas account. Send /stop before connecting a different account.',
      };
    await c.query('DELETE FROM atlas.telegram_links WHERE token_hash=$1', [hash(token)]);
    await c.query(
      'INSERT INTO atlas.telegram_connections VALUES($1,$2,true,$3) ON CONFLICT(user_id) DO UPDATE SET chat_id=excluded.chat_id,enabled=true,connected_at=excluded.connected_at',
      [link.user_id, chat, Date.now()],
    );
    return {
      method: 'sendMessage',
      chat_id: chat,
      text: 'Connected to Price Atlas. You’ll receive qualifying alerts when a fresh matching offer reaches your target and the source permits alerts. Send /stop to disconnect.',
    };
  });
}
export class TelegramError extends Error {
  constructor(
    public code: string,
    public retryAfter = 60,
  ) {
    super('Telegram delivery could not be confirmed.');
  }
}
export type TelegramSender = (chatId: string, text: string) => Promise<string>;
export const sendTelegram: TelegramSender = async (chatId, text) => {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new TelegramError('not_configured');
  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new TelegramError('ambiguous');
  }
  let result: {
    ok?: boolean;
    result?: { message_id: number };
    error_code?: number;
    parameters?: { retry_after?: number };
  };
  try {
    result = await response.json();
  } catch {
    throw new TelegramError('ambiguous');
  }
  if (response.status === 429 || result.error_code === 429)
    throw new TelegramError(
      'rate_limited',
      Math.min(86400, Math.max(1, result.parameters?.retry_after || 60)),
    );
  if (response.status === 403 || result.error_code === 403) throw new TelegramError('blocked');
  if (!response.ok || !result.ok || !result.result)
    throw new TelegramError(response.status >= 500 ? 'ambiguous' : 'rejected');
  return String(result.result.message_id);
};
export async function deliverTelegram(sender: TelegramSender = sendTelegram) {
  // Sending needs only the bot token; username/secret belong to the web linking flow.
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  // A timed-out send has no Telegram idempotency key. Hold it for review instead of silently duplicating a DM.
  await postgres().query(
    "UPDATE atlas.telegram_deliveries SET state='review',last_error='expired_send_lease' WHERE state='sending' AND next_attempt<$1",
    [Date.now()],
  );
  await postgres().query('DELETE FROM atlas.telegram_links WHERE expires_at<$1', [Date.now()]);
  await postgres().query(
    `INSERT INTO atlas.telegram_deliveries(notification_id,chat_id,connected_at,next_attempt)
    SELECT n.id,c.chat_id,c.connected_at,$1 FROM atlas.notifications n JOIN atlas.telegram_connections c ON c.user_id=n.user_id AND c.enabled
    WHERE n.created_at>=c.connected_at AND n.state IN ('pending','delivered') ON CONFLICT DO NOTHING`,
    [Date.now()],
  );
  const rows = await tx(async (c) => {
    const due = (
      await c.query(
        "SELECT d.*,n.user_id,n.rule_id,n.data FROM atlas.telegram_deliveries d JOIN atlas.notifications n ON n.id=d.notification_id WHERE d.state='pending' AND d.next_attempt<=$1 ORDER BY n.created_at LIMIT 20 FOR UPDATE OF d SKIP LOCKED",
        [Date.now()],
      )
    ).rows;
    for (const row of due)
      await c.query(
        "UPDATE atlas.telegram_deliveries SET state='sending',attempts=attempts+1,next_attempt=$2 WHERE notification_id=$1",
        [row.notification_id, Date.now() + 120000],
      );
    return due;
  });
  for (const row of rows) {
    const user = (
      await postgres().query('SELECT verified,notifications FROM atlas.users WHERE id=$1', [
        row.user_id,
      ])
    ).rows[0];
    const connection = (
      await postgres().query('SELECT * FROM atlas.telegram_connections WHERE user_id=$1', [
        row.user_id,
      ])
    ).rows[0];
    const rule = (await postgres().query('SELECT data FROM atlas.rules WHERE id=$1', [row.rule_id]))
      .rows[0]?.data as Rule | undefined;
    const price = rule
      ? rank(
          (await offers(rule.productId)).filter(
            (o) => o.alertsAllowed && (rule.store === 'all' || o.store === rule.store),
          ),
          Date.now(),
          rule.basis,
        ).lowest
      : null;
    const allowed =
      user?.verified &&
      user.notifications === 1 &&
      connection?.enabled &&
      connection.chat_id === row.chat_id &&
      Number(connection.connected_at) === Number(row.connected_at) &&
      rule?.enabled &&
      rule.version === row.data.ruleVersion &&
      price !== null &&
      (rule.operator === 'lte' ? price <= rule.target : price < rule.target);
    if (!allowed) {
      await postgres().query(
        "UPDATE atlas.telegram_deliveries SET state='suppressed' WHERE notification_id=$1",
        [row.notification_id],
      );
      continue;
    }
    const origin = process.env.EMAIL_LINK_ORIGIN || process.env.APP_ORIGIN;
    if (!origin || !origin.startsWith('https://')) {
      await postgres().query(
        "UPDATE atlas.telegram_deliveries SET state='pending',next_attempt=$2,last_error='link_configuration' WHERE notification_id=$1",
        [row.notification_id, Date.now() + 300000],
      );
      continue;
    }
    const text = `${String(row.data.title).slice(0, 1000)}\n${row.data.store}: ${money(row.data.price)}\nYour target: ${money(row.data.target)}\nObserved: ${new Date(row.data.observedAt).toISOString()}\n${origin}/p/${encodeURIComponent(row.data.productId)}\nPrices and stock may change at checkout.\nSend /stop to disconnect alerts.`;
    try {
      const id = await sender(row.chat_id, text);
      await postgres().query(
        "UPDATE atlas.telegram_deliveries SET state='sent',provider_id=$2,last_error=NULL WHERE notification_id=$1",
        [row.notification_id, id],
      );
    } catch (error) {
      const failure = error instanceof TelegramError ? error : new TelegramError('ambiguous');
      if (failure.code === 'blocked')
        await postgres().query(
          'UPDATE atlas.telegram_connections SET enabled=false WHERE user_id=$1 AND chat_id=$2 AND connected_at=$3',
          [row.user_id, row.chat_id, row.connected_at],
        );
      const state =
        failure.code === 'ambiguous'
          ? 'review'
          : failure.code === 'rate_limited' && row.attempts < 4
            ? 'pending'
            : 'failed';
      await postgres().query(
        'UPDATE atlas.telegram_deliveries SET state=$2,last_error=$3,next_attempt=$4 WHERE notification_id=$1',
        [row.notification_id, state, failure.code, Date.now() + failure.retryAfter * 1000],
      );
    }
  }
}
