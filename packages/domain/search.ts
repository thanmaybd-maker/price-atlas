import type { Product } from './index';
export const normalizeQuery = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\b(cook\s+top|air\s+fryer|t[ -]shirt|smart\s+watch|smart\s+phone)\b/g, (word) =>
      word.replace(/[ -]/g, ''),
    )
    .replace(/\b(fx|wh|wf|sm|rtx|gtx|mx|dx|dhx|iphone|pixel)[\s-]+(?=\d)/g, '$1')
    .replace(/cancell?ing|cancellation/g, 'cancel')
    .replace(/\b(headphones|earphones|earbuds|calculators)\b/g, (word) => word.slice(0, -1))
    .replace(/(\d)\s+(gb|tb|ml|kg|inch|cm|mah|w|l)\b/g, '$1$2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
export function matchesQuery(product: Pick<Product, 'name' | 'brand' | 'subtitle'>, query: string) {
  const haystack = normalizeQuery(`${product.name} ${product.brand} ${product.subtitle}`);
  return normalizeQuery(query)
    .split(' ')
    .filter(
      (word) =>
        Boolean(word) && !['buy', 'price', 'best', 'online', 'india', 'electric'].includes(word),
    )
    .every((word) => haystack.includes(word));
}
