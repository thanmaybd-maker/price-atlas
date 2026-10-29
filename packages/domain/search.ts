import type { Product } from './index';
export const bundleMismatch = (title: string, query: string) =>
  /\b(?:bundle|combo|kit)\b/i.test(title) && !/\b(?:bundle|combo|kit|set|pack)\b/i.test(query);
export const normalizeQuery = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
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
    .replace(/cancell?ing|cancellation/g, 'cancel')
    .replace(/\b(headphones|earphones|earbuds|calculators)\b/g, (word) => word.slice(0, -1))
    .replace(/(\d)\s+(gb|tb|ml|kg|g|oz|inch|cm|mah|w|l)\b/g, '$1$2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
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
  const haystack = normalizeQuery(
    `${product.name} ${product.brand} ${product.subtitle} ${details}`,
  );
  const tokens = new Set(haystack.split(' '));
  return normalizeQuery(query)
    .split(' ')
    .filter(
      (word) =>
        Boolean(word) && !['buy', 'price', 'best', 'online', 'india', 'electric'].includes(word),
    )
    .every((word) =>
      /^\d+(?:gb|tb|ml|kg|g|oz|inch|cm|mah|w|l)?$/.test(word)
        ? tokens.has(word)
        : haystack.includes(word),
    );
}
