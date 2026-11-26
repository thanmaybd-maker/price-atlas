import type { Product } from './index';
import { isIsbn13 } from './isbn';
export const bundleMismatch = (title: string, query: string) =>
  /\b(?:bundle|combo|kit)\b/i.test(title) && !/\b(?:bundle|combo|kit|set|pack)\b/i.test(query);
export const normalizeQuery = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\b(?:face\s*wash|facial\s+cleanser|cleansers)\b/g, 'cleanser')
    .replace(/\bgraphics?\s*cards?\b/g, 'graphics card')
    .replace(/\b97[89](?:[\s-]*\d){10}\b/g, (isbn) => {
      const digits = isbn.replace(/[\s-]/g, '');
      return isIsbn13(digits) ? digits : isbn;
    })
    .replace(
      /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+edition\b/g,
      (_, word) =>
        `${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'].indexOf(word) + 1} edition`,
    )
    .replace(/\b(\d+)(?:st|nd|rd|th)\s+edition\b/g, '$1 edition')
    .replace(/\bmillilit(?:er|re)s?\b/g, 'ml')
    .replace(/\bkilograms?\b/g, 'kg')
    .replace(/\blit(?:er|re)s?\b/g, 'l')
    .replace(/\bgrams?\b/g, 'g')
    .replace(/\b(cook\s+top|air\s+fryer|t[ -]shirt|smart\s+watch|smart\s+phone)\b/g, (word) =>
      word.replace(/[ -]/g, ''),
    )
    .replace(/\b(fx|wh|wf|sm|rtx|gtx|mx|dx|dhx|iphone|pixel)[\s-]+(?=\d)/g, '$1')
    .replace(/\b(fx\d+[a-z]+)\s+plus\b/g, '$1plus')
    .replace(/cancell?ing|cancellation/g, 'cancel')
    .replace(/\b(headphones|earphones|earbuds|calculators)\b/g, (word) => word.slice(0, -1))
    .replace(/(\d)\s+(gb|tb|ml|kg|g|oz|inch|cm|mah|w|l)\b/g, '$1$2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
// Words that never identify a product.
const IGNORED_WORDS = new Set([
  'buy',
  'price',
  'best',
  'online',
  'india',
  'electric',
  'with',
  'and',
  'for',
  'the',
  'of',
]);
export function editDistance(a: string, b: string) {
  const m = a.length,
    n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}
export function matchesQuery(
  product: Pick<Product, 'name' | 'brand' | 'subtitle'> & Partial<Pick<Product, 'attributes'>>,
  query: string,
) {
  if (bundleMismatch(product.name, query)) return false;
  const details = Object.entries(product.attributes || {})
    .filter(([key]) =>
      [
        'Brand',
        'Model Number',
        'Model Name',
        'RAM',
        'Storage',
        'Color',
        'Shade',
        'Size',
        'Capacity',
        'Pack',
        'GTIN',
        'ISBN',
        'ISBN-13',
        'Edition',
        'Binding',
        'Language',
        'Author',
      ].includes(key),
    )
    .map(([key, value]) => `${key} ${value}`)
    .join(' ');
  const text = `${product.name} ${product.brand} ${product.subtitle} ${details}`;
  // Board listings often omit the generic noun while retaining GPU model and GDDR type.
  // Host computers must not acquire that standalone-card synonym.
  const graphicsBoard =
    /\b(?:rtx|gtx)[ -]?\d{3,4}\b/i.test(text) &&
    /\b(?:GDDR[3-9]|\d+\s*GB)\b/i.test(text) &&
    !/\b(?:laptop|notebook|desktop|computer|pc)\b/i.test(text);
  const haystack = normalizeQuery(`${text} ${graphicsBoard ? 'graphics card gpu' : ''}`);
  const words = haystack.split(' ');
  const tokens = new Set(words);
  // "firebolt" still finds "Fire-Boltt", and "rubix" finds "Rubik's".
  const compact = haystack.replace(/ /g, '');
  const near = (word: string) =>
    word.length >= 5 &&
    (compact.includes(word) ||
      words.some(
        (t) =>
          t[0] === word[0] &&
          ((t.length >= word.length - 1 && editDistance(word, t.slice(0, word.length)) <= 1) ||
            (Math.abs(t.length - word.length) <= 1 && editDistance(word, t) <= 1)),
      ));
  return normalizeQuery(query)
    .split(' ')
    .filter((word) => Boolean(word) && !IGNORED_WORDS.has(word))
    .every((word) => (/\d/.test(word) ? tokens.has(word) : haystack.includes(word) || near(word)));
}
