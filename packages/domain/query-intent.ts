// Shopper query understanding without AI: budgets ("under 1 lakh", "below 60k",
// "under ₹1,00,000"), category words ("laptop", "phones"), retailer names inside the
// query ("foxtale on nykaa") and common misspellings. Gemini may refine the words
// further, but this works with no key and no network.
import type { Category, Offer, Product } from './index';
import { STORE_NAMES, rank, shownOffers } from './index';
import { matchesQuery } from './search';

export type QueryIntent = {
  /** Words left to match against product names, after budget/category/store removed. */
  text: string;
  category?: Category;
  /** Inclusive budget in paise. */
  maxPaise?: number;
  minPaise?: number;
  store?: (typeof STORE_NAMES)[number];
  /** Category words taken out of `text` ("tablet" in "b12 tablet"), singular. */
  categoryWords?: string[];
};

const CATEGORY_WORDS: [RegExp, Category][] = [
  [/\b(laptops?|notebooks?|ultrabooks?|macbooks?)\b/, 'laptops'],
  [/\b(phones?|mobiles?|smartphones?|cell ?phones?)\b/, 'phones'],
  [/\b(tablets?|ipads?)\b/, 'tablets'],
  [/\b(smart ?watch(?:es)?|watch(?:es)?|fitness bands?|smart ?bands?)\b/, 'wearables'],
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
  'smartwatch',
  'smartwatches',
  'watch',
  'watches',
  'headphone',
  'headphones',
  'earbuds',
  'monitor',
  'monitors',
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
  [/\b(?:samsang|samsumg|samsng|samung)\b/g, 'samsung'],
  [/\b(?:lenevo|lenvo|lenov)\b/g, 'lenovo'],
  [/\b(?:latptop|lpatop|laptpo|lapotp|labtop|laptp|laptopp)(s?)\b/g, 'laptop$1'],
  [/\b(?:smartphne|samrtphone|smartpone)(s?)\b/g, 'smartphone$1'],
  [/\b(?:moblie|mobiel)(s?)\b/g, 'mobile$1'],
  [/\b(?:headphne|headpone)(s?)\b/g, 'headphone$1'],
  [/\b(?:earphne|earpone)(s?)\b/g, 'earphone$1'],
  [/\b(?:earbdus|earbus)\b/g, 'earbuds'],
  [/\b(?:moniter|montior)(s?)\b/g, 'monitor$1'],
  [/\b(?:keybord|keybaord)(s?)\b/g, 'keyboard$1'],
  [/\b(?:sunscren|suncreen)(s?)\b/g, 'sunscreen$1'],
  [/\b(?:calculater|caluclator)(s?)\b/g, 'calculator$1'],
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
      String.raw`\b(?:under|below|less than|upto|up to|within|max|budget(?: of|:)?|sub|<=?)\s*${AMOUNT}`,
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
  const words = q.split(' ').filter(Boolean);
  if (intent.category) {
    const removed = words.filter((w) => PURE_CATEGORY.has(w)).map((w) => w.replace(/s$/, ''));
    if (removed.length) intent.categoryWords = [...new Set(removed)];
  }
  intent.text = words
    .filter(
      (w) => !PURE_CATEGORY.has(w) && !/^(for|the|a|an|best|cheap|buy|price|rs|inr|₹)$/.test(w),
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
  const mine = shownOffers(offers).filter(
    (o) =>
      o.productId === productId &&
      (!store || store === 'all' || o.store === store) &&
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
  const eligibleRecent = mine.filter(
    (o) => (o.stock || includeOutOfStock) && o.observedAt > now - 14 * 86400000 && o.itemPrice > 0,
  );
  if (eligibleRecent.length) {
    eligibleRecent.sort((a, b) => b.observedAt - a.observedAt || a.itemPrice - b.itemPrice);
    const best = eligibleRecent[0];
    return {
      paise: best.itemPrice,
      store: best.store,
      observedAt: best.observedAt,
      fresh: false,
      inStock: best.stock,
    };
  }
  return null;
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
        (!intent.text || textMatches(p, intent.text)) &&
        soldAt(
          p,
          offers.filter((o) => o.productId === p.id),
          store || 'all',
        ),
    )
    .map((p) => ({ p, price: knownPrice(p.id, offers, store, options.now, true) }))
    .sort((a, b) => (a.price?.paise ?? Infinity) - (b.price?.paise ?? Infinity))
    .slice(0, 12);
}

/** One rule for "is this product sold at this store?", used by every filter and count. */
export function soldAt(p: Product, productOffers: Offer[], store: string) {
  if (!store || store === 'all') return true;
  // Stores that price in dollars (iHerb, B&H) keep no INR offer; their listing is the product.
  return (
    p.attributes?.Retailer === store ||
    productOffers.some((o) => o.productId === p.id && o.store === store && o.displayAllowed)
  );
}
/** One rule for brand equality: retailers write "SONY", "Sony" and "sony". */
export const sameBrand = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** Products matching an intent, with the price used for budget and sort. */
export function applyIntent(
  products: Product[],
  offers: Offer[],
  intent: QueryIntent,
  textMatches: (p: Product, text: string) => boolean,
  options: { store?: string; sort?: string; now?: number } = {},
) {
  const store = options.store && options.store !== 'all' ? options.store : intent.store;
  // One pass to group offers by product keeps this linear: the results page runs it several
  // times per render (once per filter) to count what each filter option would show.
  const byProduct = new Map<string, Offer[]>();
  for (const o of offers) {
    const list = byProduct.get(o.productId);
    if (list) list.push(o);
    else byProduct.set(o.productId, [o]);
  }
  const rows = products
    .map((p) => ({ p, price: knownPrice(p.id, byProduct.get(p.id) || [], store, options.now) }))
    .filter(({ p, price }) => {
      if (intent.category && p.category !== intent.category) {
        // "laptop" also finds a MacBook filed under laptops; keep named matches outside it
        // only when the shopper typed a specific product, never for a bare category.
        if (!intent.text || !textMatches(p, intent.text)) return false;
        // The typed category word must still describe it: "b12 tablet" is not a B12 face cream.
        if (intent.categoryWords?.length && !matchesQuery(p, intent.categoryWords.join(' ')))
          return false;
      }
      if (intent.text && !textMatches(p, intent.text)) return false;
      if (store && store !== 'all') {
        if (!soldAt(p, byProduct.get(p.id) || [], store)) return false;
        if (price && price.store !== store && p.attributes?.Retailer !== store) return false;
      }
      if (intent.maxPaise != null && (!price || price.paise > intent.maxPaise)) return false;
      if (intent.minPaise != null && (!price || price.paise < intent.minPaise)) return false;
      return true;
    });
  const sort = options.sort || 'recommended';
  if (sort === 'price-asc') {
    rows.sort((a, b) => {
      const aVal =
        a.price?.paise ?? (a.p.basePrice && a.p.basePrice > 0 ? a.p.basePrice : Infinity);
      const bVal =
        b.price?.paise ?? (b.p.basePrice && b.p.basePrice > 0 ? b.p.basePrice : Infinity);
      if (aVal === bVal) return 0;
      return aVal - bVal;
    });
  } else if (sort === 'price-desc') {
    rows.sort((a, b) => {
      const aVal =
        a.price?.paise ?? (a.p.basePrice && a.p.basePrice > 0 ? a.p.basePrice : -Infinity);
      const bVal =
        b.price?.paise ?? (b.p.basePrice && b.p.basePrice > 0 ? b.p.basePrice : -Infinity);
      if (aVal === bVal) return 0;
      return bVal - aVal;
    });
  } else if (intent.maxPaise != null) {
    rows.sort((a, b) => {
      const aVal =
        a.price?.paise ?? (a.p.basePrice && a.p.basePrice > 0 ? a.p.basePrice : Infinity);
      const bVal =
        b.price?.paise ?? (b.p.basePrice && b.p.basePrice > 0 ? b.p.basePrice : Infinity);
      return aVal - bVal;
    });
  }
  return rows;
}
