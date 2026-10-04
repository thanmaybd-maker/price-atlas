export type Store = 'Amazon' | 'Flipkart';
export type Category = 'phones' | 'laptops' | 'tablets' | 'audio' | 'monitors';
export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: Category;
  color: string;
  subtitle: string;
  description: string;
  attributes: Record<string, string>;
  basePrice: number;
  accent: string;
  imageUrl?: string;
  sourceKind?: 'demo' | 'live';
}
export interface Offer {
  id: string;
  productId: string;
  store: Store;
  itemPrice: number;
  shipping: number | null;
  charges: number;
  discount: number;
  currency: string;
  stock: boolean;
  accepted: boolean;
  condition: string;
  observedAt: number;
  validUntil: number;
  historyAllowed: boolean;
  alertsAllowed: boolean;
  displayAllowed: boolean;
  seller: string;
  context: string;
  purchaseUrl?: string;
}
export interface Rule {
  id: string;
  productId: string;
  target: number;
  operator: 'lte' | 'lt';
  basis: 'delivered' | 'item';
  store: 'all' | Store;
  enabled: boolean;
  version: number;
  episode: number;
  activeEpisode: boolean;
  aboveCount: number;
  lastTriggeredAt: number | null;
  lastEvidence?: string | null;
}
export function money(paise: number | null | undefined) {
  return paise == null
    ? 'Unavailable'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
      }).format(paise / 100);
}
export function eligible(o: Offer, now = Date.now()) {
  return (
    o.accepted &&
    o.condition === 'new' &&
    o.currency === 'INR' &&
    o.stock &&
    o.displayAllowed &&
    o.observedAt <= now &&
    o.validUntil > now
  );
}
export function total(o: Offer, basis: 'delivered' | 'item' = 'delivered'): number | null {
  if (basis === 'delivered' && o.shipping === null) return null;
  return o.itemPrice + (basis === 'delivered' ? (o.shipping ?? 0) + o.charges : 0) - o.discount;
}
export function rank(offers: Offer[], now = Date.now(), basis: 'delivered' | 'item' = 'delivered') {
  const list = offers
    .filter((o) => eligible(o, now) && total(o, basis) !== null)
    .sort((a, b) => total(a, basis)! - total(b, basis)!);
  const lowest = list.length ? total(list[0], basis) : null;
  return {
    offers: list,
    lowest,
    winners: list.filter((o) => total(o, basis) === lowest),
    partial: offers.some((o) => !eligible(o, now) || total(o, basis) === null),
  };
}
export function exactMatch(
  a: Record<string, string>,
  b: Record<string, string>,
  required: string[],
) {
  const unknown = required.filter((k) => !a[k] || !b[k]);
  const conflicts = required.filter((k) => a[k] && b[k] && normalize(a[k]) !== normalize(b[k]));
  return {
    decision: conflicts.length ? 'rejected' : unknown.length ? 'review' : 'accepted',
    unknown,
    conflicts,
  } as const;
}
function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}
export function evaluate(
  rule: Rule,
  offers: Offer[],
  now = Date.now(),
): { state: Rule; trigger: Offer | null } {
  const state = { ...rule };
  if (!rule.enabled) return { state, trigger: null };
  const ranked = rank(
    offers.filter(
      (o) =>
        o.productId === rule.productId &&
        o.alertsAllowed &&
        (rule.store === 'all' || o.store === rule.store),
    ),
    now,
    rule.basis,
  );
  const offer = ranked.offers[0];
  if (!offer) return { state, trigger: null };
  const evidence = offer.id;
  if (state.lastEvidence === evidence) return { state, trigger: null };
  state.lastEvidence = evidence;
  const price = total(offer, rule.basis)!;
  const met = rule.operator === 'lte' ? price <= rule.target : price < rule.target;
  if (met) {
    state.aboveCount = 0;
    if (!state.activeEpisode) {
      state.activeEpisode = true;
      state.episode++;
      state.lastTriggeredAt = now;
      return { state, trigger: offer };
    }
  } else {
    state.aboveCount++;
    if (
      state.aboveCount >= 2 &&
      (state.lastTriggeredAt === null || now - state.lastTriggeredAt >= 86400000)
    )
      state.activeEpisode = false;
  }
  return { state, trigger: null };
}
export function parseRetailUrl(value: string): { store: Store; externalId: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid HTTPS product URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new Error('Use a direct HTTPS retailer product link.');
  const host = url.hostname.toLowerCase();
  if (['amazon.in', 'www.amazon.in'].includes(host)) {
    const id = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1];
    if (id) return { store: 'Amazon', externalId: id.toUpperCase() };
  }
  if (['flipkart.com', 'www.flipkart.com'].includes(host)) {
    const id = url.searchParams.get('pid');
    if (id && /^[A-Z0-9]{8,30}$/i.test(id))
      return { store: 'Flipkart', externalId: id.toUpperCase() };
    const item = url.pathname.match(/\/p\/(itm[a-f0-9]{10,24})(?:\/|$)/i)?.[1];
    if (!id && item) return { store: 'Flipkart', externalId: item.toUpperCase() };
  }
  throw new Error(
    'Use a direct Amazon.in /dp/ link or Flipkart /p/ product link. Short links and other destinations are not fetched.',
  );
}
