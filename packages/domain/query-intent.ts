// Shopper query understanding without AI: budgets ("under 1 lakh", "below 60k",
// "under ₹1,00,000"), category words ("laptop", "phones"), retailer names inside the
// query ("foxtale on nykaa") and common misspellings. Gemini may refine the words
// further, but this works with no key and no network.
import type { Category, Offer, Product } from './index';
import { STORE_NAMES, rank } from './index';
import { retailers } from './retailers';

export type QueryIntent = {
  /** Words left to match against product names, after budget/category/store removed. */
  text: string;
  category?: Category;
  /** Inclusive budget in paise. */
  maxPaise?: number;
  minPaise?: number;
  store?: (typeof STORE_NAMES)[number];
};

const CATEGORY_WORDS: [RegExp, Category][] = [
  [/\b(laptops?|notebooks?|ultrabooks?|macbooks?)\b/, 'laptops'],
  [/\b(phones?|mobiles?|smartphones?|cell ?phones?)\b/, 'phones'],
  [/\b(tablets?|ipads?)\b/, 'tablets'],
  [/\b(headphones?|earphones?|earbuds?|headsets?|speakers?|tws)\b/, 'audio'],
  [/\b(monitors?)\b/, 'monitors'],
  [/\b(lipsticks?|lip ?gloss|kajal|eyeliners?|mascara|foundations?|makeup|cosmetics?)\b/, 'beauty'],
  [
    /\b(serums?|sunscreens?|moisturi[sz]ers?|face ?wash|cleansers?|shampoos?|skincare|skin care)\b/,
    'personal-care',
  ],
  [/\b(books?|novels?|textbooks?)\b/, 'books'],
  [/\b(calculators?|pens?|notebook pack|stationery)\b/, 'stationery'],
  [/\b(mouse|mice|keyboards?|chargers?|cables?)\b/, 'accessories'],
];
// Words that only state the category and carry no product identity.
const PURE_CATEGORY = new Set([
  'laptop',
  'laptops',
  'notebook',
  'notebooks',
  'phone',
  'phones',
  'mobile',
  'mobiles',
  'smartphone',
  'smartphones',
  'tablet',
  'tablets',
  'headphone',
  'headphones',
  'earbuds',
  'monitor',
  'monitors',
  'lipstick',
  'lipsticks',
  'serum',
  'serums',
  'sunscreen',
  'sunscreens',
  'book',
  'books',
  'calculator',
  'calculators',
  'mouse',
  'keyboard',
]);
const SPELLING: [RegExp, string][] = [
  [/\bfoxtail\b/g, 'foxtale'],
  [/\bfox tale\b/g, 'foxtale'],
  [/\bmac ?book\b/g, 'macbook'],
  [/\bi ?phone\b/g, 'iphone'],
  [/\b(?:samsang|samsumg|samsng)\b/g, 'samsung'],
  [/\b(?:nykka|nyka|nayaka|naykaa|nayka)\b/g, 'nykaa'],
  [/\bflip ?kart\b/g, 'flipkart'],
];
const STORE_WORDS: [RegExp, (typeof STORE_NAMES)[number]][] = [
  [/\b(?:on |at |from )?nykaa\b/, 'Nykaa'],
  [/\b(?:on |at |from )?amazon(?:\.in)?\b/, 'Amazon'],
  [/\b(?:on |at |from )?flipkart\b/, 'Flipkart'],
  [/\b(?:on |at |from )?myntra\b/, 'Myntra'],
  [/\b(?:on |at |from )?croma\b/, 'Croma'],
  [/\b(?:on |at |from )?reliance(?: digital)?\b/, 'Reliance Digital'],
  [/\b(?:on |at |from )?meesho\b/, 'Meesho'],
  [/\b(?:on |at |from )?ajio\b/, 'AJIO'],
];

/** "1 lakh" -> 10000000 paise, "60k" -> 6000000, "1,00,000" -> 10000000. */
export function parseAmount(value: string, unit = ''): number | null {
  const n = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = unit.toLowerCase();
  const rupees = /^(l|lac|lacs|lakh|lakhs)$/.test(u)
    ? n * 100000
    : /^(cr|crore|crores)$/.test(u)
      ? n * 10000000
      : /^(k|thousand)$/.test(u)
        ? n * 1000
        : n;
  return rupees >= 1 && rupees <= 1e8 ? Math.round(rupees * 100) : null;
}

const AMOUNT = String.raw`(?:rs\.?|inr|₹)?\s*([\d][\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|l|k|thousand|crores?|cr)?\b`;

export function parseQueryIntent(raw: string): QueryIntent {
  let q = ` ${raw.toLowerCase().normalize('NFKC')} `.replace(/\s+/g, ' ');
  for (const [re, to] of SPELLING) q = q.replace(re, to);
  const intent: QueryIntent = { text: '' };
  const between = q.match(
    new RegExp(String.raw`\b(?:between|from)\s+${AMOUNT}\s*(?:and|to|-)\s*${AMOUNT}`),
  );
  if (between) {
    intent.minPaise = parseAmount(between[1], between[2] || between[4]) ?? undefined;
    intent.maxPaise = parseAmount(between[3], between[4]) ?? undefined;
    q = q.replace(between[0], ' ');
  }
  const under = q.match(
    new RegExp(
      String.raw`\b(?:under|below|less than|upto|up to|within|max|budget|<=?)\s*${AMOUNT}`,
    ),
  );
  if (under) {
    intent.maxPaise = parseAmount(under[1], under[2]) ?? undefined;
    q = q.replace(under[0], ' ');
  }
  const over = q.match(new RegExp(String.raw`\b(?:above|over|more than|min|>=?)\s*${AMOUNT}`));
  if (over) {
    intent.minPaise = parseAmount(over[1], over[2]) ?? undefined;
    q = q.replace(over[0], ' ');
  }
  for (const [re, store] of STORE_WORDS)
    if (re.test(q)) {
      intent.store = store;
      q = q.replace(re, ' ');
      break;
    }
  for (const [re, category] of CATEGORY_WORDS)
    if (re.test(q)) {
      intent.category = category;
      break;
    }
  intent.text = q
    .split(' ')
    .filter(
      (w) =>
        w && !PURE_CATEGORY.has(w) && !/^(for|the|a|an|best|cheap|buy|price|rs|inr|₹)$/.test(w),
    )
    .join(' ')
    .trim();
  return intent;
}

export type KnownPrice = {
  paise: number;
  store: Offer['store'];
  observedAt: number;
  /** True when the offer is still inside its display window (a current price). */
  fresh: boolean;
};

/**
 * The price shown and used for budget filters and sorting: the lowest current eligible
 * item price, otherwise the most recent recorded domestic item price within 14 days
 * (always shown with its date, never as current). Optionally limited to one store.
 */
export function knownPrice(
  productId: string,
  offers: Offer[],
  store?: string,
  now = Date.now(),
  includeOutOfStock = false,
): (KnownPrice & { inStock: boolean }) | null {
  const mine = offers.filter(
    (o) =>
      o.productId === productId &&
      (!store || store === 'all' || o.store === store) &&
      o.currency === 'INR' &&
      !retailers[o.store]?.international &&
      o.accepted &&
      o.condition === 'new' &&
      o.displayAllowed &&
      o.observedAt <= now,
  );
  const current = rank(mine, now, 'item');
  if (current.lowest != null && current.offers[0])
    return {
      paise: current.lowest,
      store: current.offers[0].store,
      observedAt: current.offers[0].observedAt,
      fresh: true,
      inStock: true,
    };
  const recent = mine
    .filter(
      (o) =>
        (o.stock || includeOutOfStock) && o.observedAt > now - 14 * 86400000 && o.itemPrice > 0,
    )
    .sort((a, b) => b.observedAt - a.observedAt || a.itemPrice - b.itemPrice)[0];
  return recent
    ? {
        paise: recent.itemPrice,
        store: recent.store,
        observedAt: recent.observedAt,
        fresh: false,
        inStock: recent.stock,
      }
    : null;
}

/**
 * When a budget query has no in-stock match, the nearest honest alternatives: the same
 * category/words, including out-of-stock and over-budget items, cheapest first. Callers
 * must label these as not matching the budget or not in stock.
 */
export function nearMisses(
  products: Product[],
  offers: Offer[],
  intent: QueryIntent,
  textMatches: (p: Product, text: string) => boolean,
  options: { store?: string; now?: number } = {},
) {
  if (intent.maxPaise == null && intent.minPaise == null) return [];
  const store = options.store && options.store !== 'all' ? options.store : intent.store;
  return products
    .filter(
      (p) =>
        (!intent.category || p.category === intent.category) &&
        (!intent.text || textMatches(p, intent.text)),
    )
    .map((p) => ({ p, price: knownPrice(p.id, offers, store, options.now, true) }))
    .sort((a, b) => (a.price?.paise ?? Infinity) - (b.price?.paise ?? Infinity))
    .slice(0, 12);
}

/** Products matching an intent, with the price used for budget and sort. */
export function applyIntent(
  products: Product[],
  offers: Offer[],
  intent: QueryIntent,
  textMatches: (p: Product, text: string) => boolean,
  options: { store?: string; sort?: string; now?: number } = {},
) {
  const store = options.store && options.store !== 'all' ? options.store : intent.store;
  const rows = products
    .map((p) => ({ p, price: knownPrice(p.id, offers, store, options.now) }))
    .filter(({ p, price }) => {
      if (intent.category && p.category !== intent.category) {
        // "laptop" also finds a MacBook filed under laptops; keep named matches outside it
        // only when the shopper typed a specific product, never for a bare category.
        if (!intent.text || !textMatches(p, intent.text)) return false;
      }
      if (intent.text && !textMatches(p, intent.text)) return false;
      if (store && !price && p.attributes.Retailer !== store) return false;
      if (intent.maxPaise != null && (!price || price.paise > intent.maxPaise)) return false;
      if (intent.minPaise != null && (!price || price.paise < intent.minPaise)) return false;
      return true;
    });
  const sort = options.sort || 'recommended';
  if (sort === 'price-asc' || sort === 'price-desc' || intent.maxPaise != null)
    rows.sort((a, b) => {
      // Unknown prices always last, never treated as zero.
      if (!a.price || !b.price) return a.price ? -1 : b.price ? 1 : 0;
      return (a.price.paise - b.price.paise) * (sort === 'price-desc' ? -1 : 1);
    });
  return rows;
}
