// "Now watching" note sent once when a target is pinned and not yet met.
import { postgres } from '../database/postgres';
import { money } from '../domain/index';
import { sendTelegram } from './telegram';
import { postDiscord } from './discord';
import { publicOrigin } from './origin';

export type WatchNote = {
  title: string;
  productId: string;
  imageUrl?: string | null;
  target: number;
  price: number | null;
  inStock: boolean | null;
  store: string | null;
};

export function watchText(n: WatchNote) {
  const now =
    n.price == null
      ? 'No price available right now.'
      : n.inStock === false
        ? `${n.store}: ${money(n.price)}, out of stock right now.`
        : `${n.store}: ${money(n.price)} now, ${money(Math.max(0, n.price - n.target))} above your target.`;
  return { now };
}

export async function notifyTrackingStarted(userId: string, n: WatchNote) {
  const user = (
    await postgres().query('SELECT notifications FROM atlas.users WHERE id=$1', [userId])
  ).rows[0];
  if (!user || user.notifications !== 1) return;
  const link = `${publicOrigin()}/p/${encodeURIComponent(n.productId)}`;
  const { now } = watchText(n);
  const tg = (
    await postgres().query(
      'SELECT chat_id FROM atlas.telegram_connections WHERE user_id=$1 AND enabled',
      [userId],
    )
  ).rows[0];
  if (tg && process.env.TELEGRAM_BOT_TOKEN)
    await sendTelegram(
      tg.chat_id,
      `👀 Now watching: ${n.title.slice(0, 300)}\nYour target: ${money(n.target)}\n${now}\nYou'll get an alert here the moment a checked, in-stock price reaches your target.\n${link}`,
    ).catch(() => undefined);
  const dc = (
    await postgres()
      .query('SELECT webhook_url FROM atlas.discord_connections WHERE user_id=$1', [userId])
      .catch(() => ({ rows: [] as { webhook_url: string }[] }))
  ).rows[0];
  if (dc)
    await postDiscord(dc.webhook_url, '', fetch, {
      title: `Now watching: ${n.title.slice(0, 220)}`,
      url: link,
      description: `${now}\nYou'll get an alert here the moment a checked, in-stock price reaches your target.`,
      color: 0x2277a5,
      fields: [
        { name: 'Your target', value: money(n.target), inline: true },
        ...(n.price != null ? [{ name: 'Price now', value: money(n.price), inline: true }] : []),
      ],
      ...(n.imageUrl && /^https:\/\//.test(n.imageUrl) ? { thumbnail: { url: n.imageUrl } } : {}),
      footer: { text: 'Price Atlas · tracking started' },
      timestamp: new Date().toISOString(),
    }).catch(() => undefined);
}
