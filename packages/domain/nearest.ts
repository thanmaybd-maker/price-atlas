// Nearest-product matching and relaxed-query generation for searches with no exact match.
// Exact search stays strict ("same model, same storage, same size"); this module finds and
// labels the closest real alternatives in the catalog or builds a clean fallback query for
// live store lookup.
import type { Category, Offer, Product, Store } from './index';
import { bundleMismatch, editDistance, normalizeQuery } from './search';
import { knownPrice, parseQueryIntent, sameBrand, soldAt, type KnownPrice } from './query-intent';
import { retailers, storesForCategory } from './retailers';
import { categoryFor } from '../matching/index';

export type SpecQuantity = {
  /** Normalized numeric value (TB -> GB * 1024, L -> ml * 1000, kg -> g * 1000). */
  value: number;
  unit: 'gb' | 'ml' | 'g' | 'inch' | 'mah' | 'w' | 'hz' | 'mp' | 'mcg' | 'mg' | '%';
  role?: 'ram' | 'storage';
  raw: string;
};

export type NearestQuery = {
  /** Cleaned, relaxed search query suitable for live store search. */
  query: string;
  /** Typo-corrected version of the original query (keeping specs). */
  corrected: string;
  category?: Category;
  brand?: string;
  specs: SpecQuantity[];
  /** Non-spec identity words (brand, product line, key traits). */
  coreTokens: string[];
  /** Feature traits like ssd, gaming, wireless, 5g, oled. */
  featureTokens: string[];
  maxPaise?: number;
  minPaise?: number;
  store?: Store;
  /** True when the relaxed query differs meaningfully from the original query. */
  relaxed: boolean;
};

export type NearestMatch = {
  p: Product;
  price: (KnownPrice & { inStock: boolean }) | null;
  score: number;
  sameBrand: boolean;
  sameCategory: boolean;
  reason: string;
};

const KNOWN_BRANDS = new Set([
  'lenovo',
  'asus',
  'acer',
  'dell',
  'hp',
  'apple',
  'msi',
  'samsung',
  'oneplus',
  'xiaomi',
  'redmi',
  'motorola',
  'sony',
  'jbl',
  'boat',
  'bose',
  'sennheiser',
  'lg',
  'philips',
  'canon',
  'nikon',
  'logitech',
  'nothing',
  'google',
  'realme',
  'vivo',
  'oppo',
  'iqoo',
  'poco',
  'infinix',
  'tecno',
  'honor',
  'gigabyte',
  'zotac',
  'nvidia',
  'foxtale',
  'cetaphil',
  'lakme',
  'maybelline',
  'nivea',
  'minimalist',
  'noise',
  'fireboltt',
  'casio',
  'milton',
  'prestige',
  'bajaj',
  'crompton',
  'pigeon',
  'bosch',
  'agaro',
  'kobo',
  'kindle',
  'mamaearth',
  'pilgrim',
  'bioderma',
  'cosrx',
  'laneige',
  'revlon',
  'titan',
  'fossil',
  'sugar',
]);

const BRAND_BY_LINE: [RegExp, string][] = [
  [/\b(?:macbook|iphone|ipad|airpods)\b/i, 'apple'],
  [/\b(?:ideapad|thinkpad|thinkbook|legion|yoga|loq)\b/i, 'lenovo'],
  [/\b(?:vivobook|zenbook|expertbook|rog|tuf)\b/i, 'asus'],
  [/\b(?:inspiron|xps|vostro|latitude|alienware)\b/i, 'dell'],
  [/\b(?:pavilion|victus|omen|elitebook|probook|omnibook|envy|spectre)\b/i, 'hp'],
  [/\b(?:aspire|swift|nitro|predator|extensa|travelmate)\b/i, 'acer'],
  [/\b(?:galaxy)\b/i, 'samsung'],
  [/\b(?:pixel)\b/i, 'google'],
  [/\b(?:motobook|moto)\b/i, 'motorola'],
  [/\b(?:airdopes|rockerz|nirvana)\b/i, 'boat'],
];

const CATEGORY_NOUN: Partial<Record<Category, string>> = {
  laptops: 'laptop',
  phones: 'phone',
  tablets: 'tablet',
  wearables: 'smartwatch',
  audio: 'headphones',
  monitors: 'monitor',
  beauty: 'makeup',
  'personal-care': 'skincare',
  books: 'book',
  stationery: 'calculator',
  accessories: 'accessory',
};

const SPEC_FILLER = new Set([
  'ram',
  'rom',
  'hard',
  'disk',
  'drive',
  'hdd',
  'storage',
  'memory',
  'capacity',
  'internal',
  'gb',
  'tb',
  'mb',
  'ml',
  'gm',
  'gms',
  'kg',
  'mah',
  'inch',
  'inches',
  'size',
  'pack',
  'count',
  'with',
  'and',
  'for',
  'the',
  'of',
  'in',
  'on',
  'at',
  'by',
  'best',
  'cheap',
  'buy',
  'price',
  'online',
  'india',
  'new',
  'latest',
]);

const COLOR_WORDS = new Set([
  'black',
  'white',
  'blue',
  'red',
  'pink',
  'green',
  'silver',
  'gold',
  'grey',
  'gray',
  'purple',
  'yellow',
  'orange',
  'brown',
  'beige',
  'titanium',
  'midnight',
  'starlight',
  'graphite',
  'obsidian',
  'coral',
  'lavender',
  'teal',
  'cream',
  'rose',
  'arctic',
  'luna',
  'abyss',
  'cosmic',
  'matte',
]);

const FEATURE_WORDS = new Set([
  'ssd',
  'nvme',
  'gaming',
  'oled',
  'amoled',
  'touchscreen',
  'wireless',
  'bluetooth',
  'anc',
  '5g',
  '4g',
  'wifi',
  'waterproof',
  'backlit',
  'mechanical',
  'rgb',
  'dewy',
  'matte',
  'spf',
  'paperback',
  'hardcover',
]);

const ACCESSORY_RE =
  /\b(?:case|cover|sleeve|bag|backpack|protector|tempered glass|replacement|earpads|adapter|adaptor|charger|power cord|laptop battery|cooling pad|stand|cable|skin|decal|keyboard cover|extended warranty|care pack|protection plan)\b/i;

const SPEC_TOKEN_RE = /^(\d+(?:\.\d+)?)(gb|tb|ml|l|g|gm|gms|kg|inch|mah|w|hz|mp|mcg|mg|%)$/i;

function unitFamily(rawUnit: string): { unit: SpecQuantity['unit']; factor: number } | null {
  const u = rawUnit.toLowerCase();
  if (u === 'gb') return { unit: 'gb', factor: 1 };
  if (u === 'tb') return { unit: 'gb', factor: 1024 };
  if (u === 'ml') return { unit: 'ml', factor: 1 };
  if (u === 'l') return { unit: 'ml', factor: 1000 };
  if (u === 'g' || u === 'gm' || u === 'gms') return { unit: 'g', factor: 1 };
  if (u === 'kg') return { unit: 'g', factor: 1000 };
  if (u === 'inch') return { unit: 'inch', factor: 1 };
  if (u === 'mah') return { unit: 'mah', factor: 1 };
  if (u === 'w') return { unit: 'w', factor: 1 };
  if (u === 'hz') return { unit: 'hz', factor: 1 };
  if (u === 'mp') return { unit: 'mp', factor: 1 };
  if (u === 'mcg') return { unit: 'mcg', factor: 1 };
  if (u === 'mg') return { unit: 'mg', factor: 1 };
  if (u === '%') return { unit: '%', factor: 1 };
  return null;
}

/** Extract numeric spec quantities (with RAM vs storage role hints) from free text. */
export function extractSpecQuantities(text: string): SpecQuantity[] {
  const normalized = normalizeQuery(text.replace(/%/g, ' %'));
  const tokens = normalized.split(' ').filter(Boolean);
  const out: SpecQuantity[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let match = tokens[i].match(SPEC_TOKEN_RE);
    let consumedNext = false;
    if (!match && /^\d+(?:\.\d+)?$/.test(tokens[i]) && tokens[i + 1]) {
      const nextUnit = tokens[i + 1];
      if (/^(?:gb|tb|ml|l|g|gm|gms|kg|inch|mah|w|hz|mp|mcg|mg|%)$/i.test(nextUnit)) {
        match = [`${tokens[i]}${nextUnit}`, tokens[i], nextUnit];
        consumedNext = true;
      }
    }
    if (!match) continue;
    const num = Number(match[1]);
    const fam = unitFamily(match[2]);
    if (!Number.isFinite(num) || num <= 0 || !fam) continue;
    const nextStart = i + (consumedNext ? 2 : 1);
    const afterTokens: string[] = [];
    for (let k = nextStart; k < Math.min(tokens.length, nextStart + 3); k++) {
      if (SPEC_TOKEN_RE.test(tokens[k]) || /^\d+(?:\.\d+)?$/.test(tokens[k])) break;
      afterTokens.push(tokens[k]);
    }
    const beforeTokens: string[] = [];
    for (let k = i - 1; k >= Math.max(0, i - 2); k--) {
      if (SPEC_TOKEN_RE.test(tokens[k]) || /^\d+(?:\.\d+)?$/.test(tokens[k])) break;
      beforeTokens.unshift(tokens[k]);
    }
    const after = afterTokens.join(' ');
    const before = beforeTokens.join(' ');
    let role: 'ram' | 'storage' | undefined;
    if (fam.unit === 'gb') {
      if (
        /\bram\b/.test(after) ||
        (/\bram\b/.test(before) && !/\b(?:ssd|hdd|hard|disk|storage|rom|emmc|nvme)\b/.test(after))
      )
        role = 'ram';
      else if (
        /\b(?:ssd|hdd|hard|disk|storage|rom|emmc|nvme)\b/.test(after) ||
        /\b(?:ssd|hdd|hard|disk|storage|rom|emmc|nvme)\b/.test(before)
      )
        role = 'storage';
    }
    out.push({
      value: num * fam.factor,
      unit: fam.unit,
      role,
      raw: `${match[1]}${match[2].toLowerCase()}`,
    });
    if (consumedNext) i++;
  }
  // If we saw two untagged GB figures (e.g. "8GB/512GB" or "16GB 1TB"), the smaller <= 64GB is
  // RAM and the larger >= 64GB is storage.
  const gbSpecs = out.filter((s) => s.unit === 'gb');
  if (gbSpecs.length >= 2) {
    const sorted = [...gbSpecs].sort((a, b) => a.value - b.value);
    if (!sorted[0].role && sorted[0].value <= 64) sorted[0].role = 'ram';
    for (const s of sorted.slice(1)) if (!s.role && s.value >= 64) s.role = 'storage';
  }
  return out;
}

function detectBrand(text: string): string | undefined {
  const tokens = normalizeQuery(text).split(' ').filter(Boolean);
  for (const t of tokens) {
    if (KNOWN_BRANDS.has(t)) return t;
    if (t.length >= 5) {
      for (const b of KNOWN_BRANDS) {
        if (b[0] === t[0] && Math.abs(b.length - t.length) <= 1 && editDistance(t, b) <= 1)
          return b;
      }
    }
  }
  for (const [re, brand] of BRAND_BY_LINE) if (re.test(text)) return brand;
  return undefined;
}

function displayBrand(brand: string) {
  if (brand.length <= 3) return brand.toUpperCase();
  if (brand === 'oneplus') return 'OnePlus';
  if (brand === 'iqoo') return 'iQOO';
  if (brand === 'fireboltt') return 'Fire-Boltt';
  return brand[0].toUpperCase() + brand.slice(1);
}

/** Build a clean, relaxed store-search query from a user's exact query. */
export function buildNearestQuery(raw: string): NearestQuery {
  const intent = parseQueryIntent(raw);
  const correctedBase =
    [intent.text, ...(intent.categoryWords || [])].filter(Boolean).join(' ').trim() || raw.trim();
  const normalizedCorrected = normalizeQuery(correctedBase);
  const specs = extractSpecQuantities(correctedBase);
  const brand = detectBrand(correctedBase);

  let category: Category | undefined = intent.category;
  if (!category) {
    const inferred = categoryFor(correctedBase, {});
    if (inferred !== 'other') category = inferred;
    else if (
      /\b(?:ssd|hdd|hard\s*disk|ryzen|intel\s*core|celeron|windows\s*11)\b/i.test(correctedBase)
    )
      category = 'laptops';
  }

  const tokens = normalizedCorrected.split(' ').filter(Boolean);
  const specRawSet = new Set(specs.map((s) => normalizeQuery(s.raw)));
  const categoryWordSet = new Set((intent.categoryWords || []).map((w) => normalizeQuery(w)));

  const coreTokens: string[] = [];
  const featureTokens: string[] = [];
  for (const t of tokens) {
    if (specRawSet.has(t) || SPEC_TOKEN_RE.test(t)) continue;
    if (categoryWordSet.has(t)) continue;
    if (SPEC_FILLER.has(t)) continue;
    if (FEATURE_WORDS.has(t)) {
      if (!featureTokens.includes(t)) featureTokens.push(t);
      continue;
    }
    if (!coreTokens.includes(t)) coreTokens.push(t);
  }

  // Build relaxed search terms: brand first, then core model words, then category noun, then
  // high-signal non-conflicting traits (like ssd/gaming/5g).
  const hasBrandAlready = brand && coreTokens.some((t) => t === brand);
  const queryParts: string[] = [];
  let strippedColor = false;
  if (brand && !hasBrandAlready) queryParts.push(brand);
  for (const t of coreTokens) {
    if (COLOR_WORDS.has(t) && (coreTokens.length > 1 || brand || category)) {
      strippedColor = true;
      continue;
    }
    if (!queryParts.includes(t)) queryParts.push(t);
  }

  const catNoun = category ? CATEGORY_NOUN[category] : undefined;
  const alreadyNamesDevice =
    catNoun &&
    (queryParts.includes(catNoun) ||
      queryParts.includes(`${catNoun}s`) ||
      (category === 'laptops' &&
        queryParts.some((t) =>
          /^(?:macbook|chromebook|ideapad|thinkpad|vivobook|zenbook|notebook)\d*$/.test(t),
        )) ||
      (category === 'phones' &&
        queryParts.some((t) => /^(?:iphone\d*|pixel\d*|smartphone|mobile)$/.test(t))) ||
      (category === 'tablets' && queryParts.some((t) => /^(?:ipad\d*)$/.test(t))) ||
      (category === 'audio' &&
        queryParts.some((t) =>
          /^(?:earbuds|earphone|airpods|airdopes|speaker|soundbar)$/.test(t),
        )));
  if (
    catNoun &&
    !alreadyNamesDevice &&
    !['beauty', 'personal-care', 'accessories'].includes(category!)
  ) {
    queryParts.push(catNoun);
  }

  for (const f of featureTokens) {
    // Only keep up to 1 strong feature trait (e.g. "ssd", "5g", "gaming") so store search stays broad.
    if (queryParts.length >= 4) break;
    if (!queryParts.includes(f)) queryParts.push(f);
  }

  // If nothing was relaxed yet (no unit specs, colors, budgets, or typos removed — e.g.
  // "sony wh-1000xm6"), broaden one step by dropping digit-bearing model codes while keeping
  // the brand/line + category noun.
  const origNorm = normalizeQuery(raw);
  const hadRelaxation =
    specs.length > 0 ||
    strippedColor ||
    intent.maxPaise != null ||
    intent.minPaise != null ||
    normalizedCorrected !== origNorm;
  const pretty = (text: string) =>
    text
      .replace(/\b(iphone|pixel|rtx|gtx)(?=\d)/gi, '$1 ')
      .replace(/\s+/g, ' ')
      .trim();
  let query = queryParts.join(' ').trim();
  if (!query || (!hadRelaxation && queryParts.length > 1)) {
    const withoutModelDigits = queryParts.filter((t) => !/\d/.test(t) || t === '5g' || t === '4g');
    const hasNonCategoryWord = withoutModelDigits.some((t) => t !== catNoun);
    if (hasNonCategoryWord && withoutModelDigits.length < queryParts.length) {
      const broadened = [...withoutModelDigits];
      if (catNoun && !broadened.includes(catNoun)) broadened.push(catNoun);
      query = broadened.join(' ').trim();
    } else if (queryParts.length > 2) {
      query = queryParts.slice(0, 2).join(' ').trim();
    } else if (brand && catNoun && !alreadyNamesDevice) {
      query = `${brand} ${catNoun}`;
    } else {
      query = queryParts.join(' ').trim() || correctedBase;
    }
  }
  query = pretty(query);

  return {
    query,
    corrected: correctedBase,
    category,
    brand,
    specs,
    coreTokens,
    featureTokens,
    maxPaise: intent.maxPaise,
    minPaise: intent.minPaise,
    store: intent.store,
    relaxed: normalizeQuery(query) !== origNorm,
  };
}

/**
 * Guard for nearest-mode live discovery: allows spec/variant differences (e.g. 8GB/512GB
 * for a 10GB/60GB query), while still blocking accessories, bundles and wrong categories.
 */
export function nearestConflict(title: string, nearest: NearestQuery, rawQuery: string): boolean {
  if (bundleMismatch(title, rawQuery)) return true;
  const normTitle = normalizeQuery(title);
  const normQuery = normalizeQuery(rawQuery);
  if (ACCESSORY_RE.test(normTitle) && !ACCESSORY_RE.test(normQuery)) return true;
  if (nearest.category && nearest.category !== 'other') {
    const titleCat = categoryFor(title, {});
    if (titleCat !== 'other' && titleCat !== nearest.category) return true;
    // Reject warranty / service listings for non-service queries.
    if (titleCat === 'services' && nearest.category !== 'services') return true;
  }
  return false;
}

function tokenMatchesHaystack(token: string, haystack: string, words: string[]): boolean {
  if (haystack.includes(token)) return true;
  if (token.length >= 5 && !/\d/.test(token)) {
    return words.some(
      (w) =>
        w[0] === token[0] && Math.abs(w.length - token.length) <= 1 && editDistance(token, w) <= 1,
    );
  }
  // Model-series prefix overlap (e.g. "wh1000xm6" matches "wh1000xm5", "s25" matches "s24").
  if (token.length >= 4 && /\d/.test(token)) {
    const stem = token.replace(/\d+$/, '');
    if (stem.length >= 3) return words.some((w) => w.startsWith(stem) && /\d/.test(w));
  }
  return false;
}

function productSpecs(
  product: Pick<Product, 'name' | 'subtitle'> & Partial<Pick<Product, 'attributes'>>,
) {
  const attrText = [
    product.attributes?.RAM ? `${product.attributes.RAM} ram` : '',
    product.attributes?.Storage ? `${product.attributes.Storage} storage` : '',
    product.attributes?.Size || '',
    product.attributes?.Capacity || '',
  ]
    .filter(Boolean)
    .join(' ');
  return extractSpecQuantities(`${product.name} ${product.subtitle} ${attrText}`);
}

function formatSpecSummary(specs: SpecQuantity[]): string {
  const ram = specs.find((s) => s.unit === 'gb' && s.role === 'ram');
  const storage = specs.find((s) => s.unit === 'gb' && s.role === 'storage');
  const fmtGb = (v: number) => (v >= 1024 && v % 1024 === 0 ? `${v / 1024} TB` : `${v} GB`);
  if (ram && storage) return `${fmtGb(ram.value)} RAM / ${fmtGb(storage.value)}`;
  if (ram) return `${fmtGb(ram.value)} RAM`;
  if (storage) return `${fmtGb(storage.value)} storage`;
  const first = specs[0];
  if (!first) return '';
  if (first.unit === 'gb') return fmtGb(first.value);
  if (first.unit === 'ml')
    return first.value >= 1000 ? `${first.value / 1000} L` : `${first.value} ml`;
  if (first.unit === 'g')
    return first.value >= 1000 ? `${first.value / 1000} kg` : `${first.value} g`;
  return first.raw.toUpperCase();
}

function specClosenessScore(requested: SpecQuantity[], candidate: SpecQuantity[]): number {
  if (!requested.length || !candidate.length) return 0;
  let total = 0;
  let matched = 0;
  for (const req of requested) {
    const pool = candidate.filter(
      (c) => c.unit === req.unit && (!req.role || !c.role || c.role === req.role),
    );
    const fallbackPool = pool.length ? pool : candidate.filter((c) => c.unit === req.unit);
    if (!fallbackPool.length) continue;
    let best = 0;
    for (const c of fallbackPool) {
      const ratio = Math.max(c.value, req.value) / Math.max(0.001, Math.min(c.value, req.value));
      const proximity = 1 / (1 + Math.log2(ratio));
      if (proximity > best) best = proximity;
    }
    total += best;
    matched++;
  }
  return matched ? (total / requested.length) * 18 : 0;
}

export function scoreNearestCandidate(
  product: Pick<Product, 'name' | 'brand' | 'subtitle' | 'category'> &
    Partial<Pick<Product, 'attributes'>>,
  nearest: NearestQuery,
  rawQuery: string,
): { score: number; sameBrand: boolean; sameCategory: boolean; reason: string } | null {
  if (nearestConflict(product.name, nearest, rawQuery)) return null;
  if (product.category === 'accessories' && nearest.category && nearest.category !== 'accessories')
    return null;
  if (product.category === 'services' && nearest.category && nearest.category !== 'services')
    return null;

  const text = `${product.name} ${product.brand} ${product.subtitle} ${product.attributes?.['Model Name'] || ''} ${product.attributes?.['Model Number'] || ''} ${product.attributes?.RAM || ''} ${product.attributes?.Storage || ''}`;
  const haystack = normalizeQuery(text);
  const words = haystack.split(' ').filter(Boolean);

  const prodBrand =
    product.brand && !/^unknown\b/i.test(product.brand)
      ? normalizeQuery(product.brand)
      : detectBrand(product.name) || '';
  const hasBrandMatch = Boolean(
    nearest.brand &&
    (sameBrand(prodBrand, nearest.brand) ||
      words.includes(nearest.brand) ||
      detectBrand(product.name) === nearest.brand),
  );

  const effectiveCat =
    product.category && product.category !== 'other'
      ? product.category
      : categoryFor(product.name, product.attributes || {});
  const hasCategoryMatch = Boolean(nearest.category && effectiveCat === nearest.category);

  // If the query names a clear category (like laptops/phones), never suggest a different
  // specific category unless there is strong model-name identity (like "b12 tablet" under other).
  if (
    nearest.category &&
    nearest.category !== 'other' &&
    effectiveCat !== 'other' &&
    effectiveCat !== nearest.category
  ) {
    return null;
  }

  const identityTokens = nearest.coreTokens.filter(
    (t) => t !== nearest.brand && !COLOR_WORDS.has(t),
  );
  const matchedIdentity = identityTokens.filter((t) => tokenMatchesHaystack(t, haystack, words));
  const matchedFeatures = nearest.featureTokens.filter((t) =>
    tokenMatchesHaystack(t, haystack, words),
  );

  // Relevance floor: avoid showing unrelated items for gibberish or unknown non-category words.
  const hasAnySignal =
    hasBrandMatch ||
    matchedIdentity.length > 0 ||
    (hasCategoryMatch &&
      (nearest.brand ||
        nearest.specs.length > 0 ||
        nearest.maxPaise != null ||
        nearest.minPaise != null ||
        nearest.featureTokens.length > 0 ||
        !identityTokens.length));
  if (!hasAnySignal) return null;

  // If the query had specific non-brand identity words and no category match, require at least
  // brand + 1 identity match or >= 50% of identity words.
  if (!hasCategoryMatch && !hasBrandMatch) {
    if (identityTokens.length === 0) return null;
    if (matchedIdentity.length / identityTokens.length < 0.5) return null;
  }

  let score = 0;
  if (hasCategoryMatch) score += 30;
  if (hasBrandMatch) score += 45;
  if (identityTokens.length) {
    score += (matchedIdentity.length / identityTokens.length) * 35;
  }
  if (nearest.featureTokens.length) {
    score += (matchedFeatures.length / nearest.featureTokens.length) * 10;
  }

  const pSpecs = productSpecs(product);
  const specScore = specClosenessScore(nearest.specs, pSpecs);
  score += specScore;

  // Build an honest, concise reason badge.
  const specLabel = formatSpecSummary(pSpecs);
  let reason = 'Closest match';
  if (nearest.specs.length > 0 && specLabel) {
    reason = hasBrandMatch
      ? `Different specs · ${specLabel}`
      : nearest.brand
        ? `Closest alternative · ${specLabel}`
        : `Closest specs · ${specLabel}`;
  } else if (hasBrandMatch && hasCategoryMatch) {
    reason = `Closest ${displayBrand(nearest.brand!)} option`;
  } else if (hasCategoryMatch && nearest.brand && !hasBrandMatch) {
    reason = `Similar in category (not ${displayBrand(nearest.brand)})`;
  } else if (matchedIdentity.length > 0) {
    reason = 'Closest variant';
  }

  return { score, sameBrand: hasBrandMatch, sameCategory: hasCategoryMatch, reason };
}

/**
 * Find the closest honest alternatives in the catalog when exact search returns 0 products.
 * Never mixes unrelated categories or accessories; ranks same-brand & closest-spec items first.
 */
export function findNearestProducts(
  products: Product[],
  offers: Offer[],
  rawQuery: string,
  options: {
    store?: string;
    category?: string;
    brand?: string;
    now?: number;
    limit?: number;
  } = {},
): { items: NearestMatch[]; nearest: NearestQuery; brandFallback: boolean } {
  const nearest = buildNearestQuery(rawQuery);
  const limit = options.limit ?? 12;
  if (normalizeQuery(rawQuery).length < 2 || /^https?:\/\//i.test(rawQuery.trim())) {
    return { items: [], nearest, brandFallback: false };
  }
  const effectiveCategory = options.category || nearest.category;
  const scopedNearest: NearestQuery = {
    ...nearest,
    category: (effectiveCategory as Category | undefined) || nearest.category,
  };
  const store = options.store && options.store !== 'all' ? options.store : nearest.store;

  const byProduct = new Map<string, Offer[]>();
  for (const o of offers) {
    const list = byProduct.get(o.productId);
    if (list) list.push(o);
    else byProduct.set(o.productId, [o]);
  }

  const scored: NearestMatch[] = [];
  for (const p of products) {
    if (options.brand && !sameBrand(p.brand, options.brand)) continue;
    if (options.category && p.category !== options.category) continue;
    const po = byProduct.get(p.id) || [];
    if (store && store !== 'all' && !soldAt(p, po, store)) continue;
    const match = scoreNearestCandidate(p, scopedNearest, rawQuery);
    if (!match) continue;
    const price = knownPrice(p.id, po, store, options.now, true);
    // Slight tie-breaker for priced & in-stock items so actionable options sit near the top.
    const priceBonus = price ? (price.inStock ? 3 : 1) : 0;
    const budgetPenalty =
      nearest.maxPaise != null && price && price.paise > nearest.maxPaise
        ? -Math.min(10, ((price.paise - nearest.maxPaise) / Math.max(1, nearest.maxPaise)) * 10)
        : 0;
    scored.push({
      p,
      price,
      score: match.score + priceBonus + budgetPenalty,
      sameBrand: match.sameBrand,
      sameCategory: match.sameCategory,
      reason: match.reason,
    });
  }

  const hasSameBrand = Boolean(nearest.brand && scored.some((s) => s.sameBrand));
  const pool = hasSameBrand ? scored.filter((s) => s.sameBrand) : scored;
  pool.sort(
    (a, b) =>
      b.score - a.score ||
      (a.price?.paise ?? Infinity) - (b.price?.paise ?? Infinity) ||
      a.p.name.localeCompare(b.p.name),
  );

  return {
    items: pool.slice(0, limit),
    nearest: scopedNearest,
    brandFallback: Boolean(nearest.brand && !hasSameBrand && pool.length > 0),
  };
}

/** Category-appropriate domestic stores for external search links (max 4). */
export function nearestStoresFor(category?: Category): Store[] {
  const candidates = storesForCategory(category || 'other').filter(
    (s) => !retailers[s].international,
  );
  // Prefer major electronics stores over Meesho for laptops/phones/monitors/tablets.
  const preferredOrder: Store[] =
    category && ['beauty', 'personal-care'].includes(category)
      ? ['Nykaa', 'Amazon', 'Flipkart', 'Myntra']
      : category && ['fashion'].includes(category)
        ? ['Myntra', 'AJIO', 'Amazon', 'Flipkart']
        : ['Amazon', 'Flipkart', 'Croma', 'Reliance Digital', 'Meesho'];
  const ordered = [
    ...preferredOrder.filter((s) => candidates.includes(s)),
    ...candidates.filter((s) => !preferredOrder.includes(s)),
  ];
  return ordered.slice(0, 4);
}
