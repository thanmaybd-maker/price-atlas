// Live check when someone pins a target, so nobody waits for the hourly schedule.
// 1. Fetch the product page now (direct → TinyFish → Firecrawl, small paid cap).
// 2. Evaluate the target on that fresh price: if met and in stock, the normal alert goes out
//    at once on in-app, Telegram and Discord.
// 3. If not met (or out of stock / no price), send a "now watching" note on Telegram and
//    Discord with today's price, so the user knows tracking started; the real alert follows
//    the moment a later check reaches the target.
import { ruleNow } from '../domain/offer-rules';
import { randomUUID } from 'node:crypto';
import { fetchProductWithBudget } from './index';
import {
  dispatch,
  evaluateProduct,
  findProduct,
  importScraped,
  offers,
  postgres,
} from '../database/postgres';
import { type Rule } from '../domain/index';
import { deliverTelegram } from '../notifications/telegram';
import { deliverDiscord } from '../notifications/discord';
import { notifyTrackingStarted } from '../notifications/watch-started';

export type PinCheck = {
  checked: boolean;
  alerted: boolean;
  price: number | null;
  inStock: boolean | null;
  store: string | null;
  reason?: string;
};

export async function livePinCheck(
  userId: string,
  rule: Rule,
  started = Date.now(),
): Promise<PinCheck> {
  const listing = (
    await postgres().query(
      "SELECT id,url,store FROM atlas.listings WHERE product_id=$1 AND match_state='accepted' AND ($2='all' OR store=$2) ORDER BY last_success DESC NULLS LAST LIMIT 1",
      [rule.productId, rule.store],
    )
  ).rows[0];
  let checked = false;
  let reason: string | undefined;
  let scrapedStock: boolean | null = null;
  if (listing) {
    try {
      const scraped = await fetchProductWithBudget(listing.url, 20000, (cost) => cost <= 6);
      await importScraped(scraped, `pin-${randomUUID()}`);
      checked = true;
      scrapedStock = scraped.itemPrice === null ? null : scraped.stock === true;
    } catch (error) {
      reason = (error as { code?: string }).code || 'check_failed';
    }
  } else reason = 'no_listing';
  await evaluateProduct(rule.productId);
  await dispatch();
  await deliverTelegram().catch(() => 0);
  await deliverDiscord().catch(() => 0);
  const alerted =
    (
      await postgres().query(
        "SELECT 1 FROM atlas.notifications WHERE rule_id=$1 AND created_at>=$2 AND state='delivered' LIMIT 1",
        [rule.id, started],
      )
    ).rows.length > 0;
  // Same rule as the alert engine and every screen (packages/domain/offer-rules.ts).
  const now = ruleNow(rule, await offers(rule.productId));
  const result: PinCheck = {
    checked,
    alerted,
    price: now.price ?? (now.last?.basis === rule.basis ? now.last.price : null),
    inStock: now.price != null ? true : now.last ? now.last.inStock : scrapedStock,
    store: now.store ?? now.last?.store ?? listing?.store ?? null,
    reason,
  };
  if (!alerted) {
    const product = await findProduct(rule.productId);
    await notifyTrackingStarted(userId, {
      title: product?.name || 'Your product',
      productId: rule.productId,
      imageUrl: product?.imageUrl,
      target: rule.target,
      price: result.price,
      inStock: result.inStock,
      store: result.store,
    }).catch(() => undefined);
  }
  return result;
}
