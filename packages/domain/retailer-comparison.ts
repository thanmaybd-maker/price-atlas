import type { Offer, Product } from './index';
import { matchesQuery, normalizeQuery } from './search';
import { discoveryConflict } from './discovery-guard';
import { sameBrand } from './query-intent';

const KNOWN_BRAND_RE =
  /\b(lenovo|asus|acer|dell|hp|apple|msi|samsung|oneplus|xiaomi|redmi|motorola|sony|jbl|boat|bose|sennheiser|lg|philips|canon|nikon|logitech|nothing|google|realme|vivo|oppo|iqoo|poco)\b/i;

const knownBrand = (brand?: string) =>
  brand && !/^unknown\b/i.test(brand.trim()) ? brand.trim() : '';

/** A cross-store discovery query, never proof that two listings are the same variant. */
export function retailerComparisonQuery(
  product: Pick<Product, 'name' | 'brand'> & Partial<Pick<Product, 'attributes'>>,
) {
  const title = normalizeQuery(product.name);
  const brand = knownBrand(product.brand);
  const isSamsung = /^samsung$/i.test(brand) || /\b(?:samsung|galaxy)\b/i.test(title);
  const galaxyModel = isSamsung
    ? title.match(/\b(?:galaxy\s+)?s\d{1,2}(?:\s*(?:ultra|plus|fe))?\b/i)?.[0]
    : undefined;
  const model =
    galaxyModel ||
    title.match(/\biphone\d+(?:\s+pro)?(?:\s+max|\s+plus)?\b|\b(?:wh|wf)\d+[a-z0-9]*\b/i)?.[0];
  const accessory = /\b(case|cover|sleeve|protector)\b/.test(title);
  if (model)
    return [accessory ? '' : brand, model, accessory ? 'case' : ''].filter(Boolean).join(' ');
  if (/\bpanchatantra\b/.test(title))
    return [title.match(/\b\d+\b/)?.[0], 'Panchatantra'].filter(Boolean).join(' ');
  if (/\bweighted vest\b/.test(title)) return [brand, 'weighted vest'].filter(Boolean).join(' ');
  const base = product.name
    .split(/[|(,]/)[0]
    .replace(/\s+-\s*$/, '')
    .split(/\s+/)
    .slice(0, 8)
    .join(' ')
    .trim();
  const effectiveBrand = brand || product.name.match(KNOWN_BRAND_RE)?.[1] || '';
  let query =
    effectiveBrand && !normalizeQuery(base).includes(normalizeQuery(effectiveBrand))
      ? `${effectiveBrand} ${base}`.trim()
      : base;
  // Short queries like "Lenovo 15" or "HP 15" match dozens of unrelated models; keep a
  // distinguishing model code or processor SKU when one is present.
  if (normalizeQuery(query).split(' ').filter(Boolean).length < 3) {
    const attrModel = product.attributes?.['Model Number']?.trim();
    const sku =
      attrModel && attrModel.length >= 3 && attrModel.length <= 20 && /\d/.test(attrModel)
        ? attrModel
        : product.name.match(
            /\b(?:[a-z]{1,4}\d{3,5}[a-z0-9-]{0,8}|\d{4}[a-z]{1,2}|n\d{4}|m[1-5](?:\s+(?:pro|max|air))?)\b/i,
          )?.[0];
    if (sku && !normalizeQuery(query).includes(normalizeQuery(sku))) query = `${query} ${sku}`;
  }
  return query.slice(0, 150);
}

export function otherRetailerListings(current: Product, products: Product[], offers: Offer[]) {
  const stores = (p: Product) =>
    [
      ...offers.filter((o) => o.productId === p.id).map((o) => o.store),
      p.attributes.Retailer,
    ].filter(Boolean);
  const currentStores = new Set(stores(current));
  const currentBrand = knownBrand(current.brand);
  const query = retailerComparisonQuery(current);
  return products
    .filter((p) => {
      if (p.id === current.id || p.category !== current.category) return false;
      const otherBrand = knownBrand(p.brand);
      if (currentBrand && otherBrand && !sameBrand(currentBrand, otherBrand)) return false;
      return (
        stores(p).some((store) => !currentStores.has(store)) &&
        matchesQuery(p, query) &&
        !discoveryConflict(p.name, query)
      );
    })
    .slice(0, 4);
}
