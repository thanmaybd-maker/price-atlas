// Display clean-up for retailer-supplied product names and brands. Store <title> tags
// often wrap the name in marketing text ("Buy X Online from Flipkart.com", "X - Buy X Online
// at Best Prices in India - Sports & Fitness | Flipkart.com"), and imports without a brand
// field show "Unknown brand" even when the name starts with it.
import type { Product } from './index';

export function tidyName(name: string) {
  let n = name.replace(/\s+/g, ' ').trim();
  // "X - Buy X Online at Best Prices in India - ... | Flipkart.com" keeps the first part.
  n = n.replace(/\s+-\s+Buy\s.+$/i, '');
  n = n.replace(/\s*[|–-]\s*(?:Flipkart\.com|Amazon\.in|Nykaa|Myntra|AJIO|Croma|Meesho)\s*$/i, '');
  n = n.replace(
    /\s+(?:Online\s+)?(?:at\s+Best\s+Prices?\s+in\s+India|Online)\s+(?:from|on|at)\s+\S+\.(?:com|in)$/i,
    '',
  );
  n = n.replace(/\s+Online\s+(?:from|on|at)\s+\S+\.(?:com|in)$/i, '');
  n = n.replace(/^Buy\s+(?=\S)/i, '');
  return n.trim() || name;
}

const KNOWN =
  /^(?:sony|apple|samsung|oneplus|xiaomi|redmi|motorola|lenovo|asus|acer|dell|hp|msi|boat|jbl|realme|vivo|oppo|google|nothing|philips|lg|canon|nikon|logitech|zotac|gigabyte|foxtale|cetaphil|lakme|maybelline|nivea|minimalist)$/i;

export function tidyBrand(brand: string, name: string) {
  if (brand && !/^unknown brand$/i.test(brand)) return brand;
  const first = tidyName(name).split(/\s+/)[0] || '';
  if (!KNOWN.test(first)) return brand;
  return first.length <= 3
    ? first.toUpperCase()
    : first[0].toUpperCase() + first.slice(1).toLowerCase();
}

export function tidyProduct<T extends Pick<Product, 'name' | 'brand'>>(p: T): T {
  const name = tidyName(p.name);
  return { ...p, name, brand: tidyBrand(p.brand, name) };
}
