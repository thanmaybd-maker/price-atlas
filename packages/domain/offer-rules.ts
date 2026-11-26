// The single place for "which offers count" rules. Every screen and the alert engine call
// these, so a price shown, a target status and an alert can never disagree.
import { rank, total, type Offer, type Rule } from './index';
import { retailers } from './retailers';

/** Offers a shopper may see priced in rupees: same product, new, Indian store, allowed. */
export function shownOffers(offers: Offer[]) {
  return offers.filter(
    (o) =>
      o.currency === 'INR' &&
      !retailers[o.store]?.international &&
      o.condition === 'new' &&
      o.accepted &&
      o.displayAllowed,
  );
}

/** Offers that may trigger an alert for a store choice ('all' or one store). */
export function alertableOffers(offers: Offer[], store: string) {
  return offers.filter(
    (o) =>
      o.alertsAllowed &&
      !retailers[o.store]?.international &&
      (store === 'all' || o.store === store),
  );
}

/** Stores a target can be pinned to and actually alert from. */
export function alertStores(offers: Offer[]) {
  return [...new Set(alertableOffers(offers, 'all').map((o) => o.store))];
}

export type RuleNow = {
  /** Price on the rule's own basis from alert-eligible offers (what the alert engine sees). */
  price: number | null;
  store: string | null;
  met: boolean;
  /** When nothing is alert-eligible: the latest shown offer, for context only. */
  last: { price: number; store: string; observedAt: number; inStock: boolean } | null;
};

/** A target's status computed from the same inputs as evaluate() in the alert engine. */
export function ruleNow(
  rule: Pick<Rule, 'productId' | 'store' | 'basis' | 'target' | 'operator'>,
  offers: Offer[],
  now = Date.now(),
): RuleNow {
  const mine = offers.filter((o) => o.productId === rule.productId);
  const ranked = rank(alertableOffers(mine, rule.store), now, rule.basis);
  const price = ranked.lowest;
  const met =
    price != null && (rule.operator === 'lt' ? price < rule.target : price <= rule.target);
  const latest = shownOffers(mine)
    .filter((o) => rule.store === 'all' || o.store === rule.store)
    .sort((a, b) => b.observedAt - a.observedAt)[0];
  const latestPrice = latest ? (total(latest, rule.basis) ?? latest.itemPrice) : null;
  return {
    price,
    store: ranked.winners[0]?.store ?? null,
    met,
    last:
      latest && latestPrice != null
        ? {
            price: latestPrice,
            store: latest.store,
            observedAt: latest.observedAt,
            inStock: latest.stock,
          }
        : null,
  };
}

/** True only when a delivered notification exists for this product at or under the target. */
export function alertSent(
  rule: Pick<Rule, 'productId' | 'target'> & { id?: string },
  notifications: { productId?: string; rule_id?: string; price?: number; state: string }[],
) {
  return notifications.some(
    (n) =>
      n.state === 'delivered' &&
      ((rule.id != null && n.rule_id === rule.id) ||
        (n.productId === rule.productId && (n.price == null || n.price <= rule.target))),
  );
}
