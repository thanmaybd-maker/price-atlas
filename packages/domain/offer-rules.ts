// The single place for "which offers count" rules. Every screen and the alert engine call
// these, so a price shown, a target status and an alert can never disagree.
import { alertableOffers, rank, shownOffers, total, type Offer, type Rule } from './index';

export { alertableOffers, shownOffers };

const offerListingKey = (o: Offer) =>
  `${o.productId}::${o.store}::${o.purchaseUrl || `${o.condition}::${o.seller}`}`;

/** One latest observation per listing, so re-checks never duplicate a store row or offer count. */
export function dedupeOffers(offers: Offer[]): Offer[] {
  const byListing = new Map<string, Offer>();
  for (const o of offers) {
    const key = offerListingKey(o);
    const prev = byListing.get(key);
    if (!prev || o.observedAt > prev.observedAt) byListing.set(key, o);
  }
  return [...byListing.values()];
}

/** Merge newly fetched offers into existing state, replacing older observations of the same listing. */
export function mergeOffers(prior: Offer[], incoming: Offer[]): Offer[] {
  return dedupeOffers([...incoming, ...prior]);
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
  last: {
    price: number;
    /** The basis this price is on: 'item' when the delivery fee is unknown. */
    basis: 'item' | 'delivered';
    store: string;
    observedAt: number;
    inStock: boolean;
  } | null;
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
  const onBasis = latest ? total(latest, rule.basis) : null;
  const latestPrice = latest ? (onBasis ?? latest.itemPrice) : null;
  return {
    price,
    store: ranked.winners[0]?.store ?? null,
    met,
    last:
      latest && latestPrice != null
        ? {
            price: latestPrice,
            basis: onBasis != null ? rule.basis : 'item',
            store: latest.store,
            observedAt: latest.observedAt,
            inStock: latest.stock,
          }
        : null,
  };
}

export type SentNotification = {
  productId?: string;
  rule_id?: string;
  ruleVersion?: number | null;
  price?: number;
  state: string;
  created_at?: number;
};
/**
 * The delivered alert for this target, if any: same rule (and same rule version, when known),
 * at or under the current target. Lowering a target after an alert does not count as sent.
 */
export function alertSent<N extends SentNotification>(
  rule: Pick<Rule, 'productId' | 'target'> & { id?: string; version?: number },
  notifications: N[],
): N | undefined {
  return notifications.find(
    (n) =>
      n.state === 'delivered' &&
      (n.price == null || n.price <= rule.target) &&
      (n.rule_id != null
        ? n.rule_id === rule.id &&
          (n.ruleVersion == null || rule.version == null || n.ruleVersion === rule.version)
        : n.productId === rule.productId),
  );
}
