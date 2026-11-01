import type { Offer, Product } from './index';
import { matchesQuery, normalizeQuery } from './search';
import { discoveryConflict } from './discovery-guard';

/** A cross-store discovery query, never proof that two listings are the same variant. */
export function retailerComparisonQuery(product: Pick<Product, 'name' | 'brand'>) {
  const title = normalizeQuery(product.name);
  const model = title.match(
    /\b(?:galaxy\s+)?s\d{1,2}(?:\s*(?:ultra|plus|fe))?\b|\biphone\d+(?:\s+pro)?(?:\s+max|\s+plus)?\b|\b(?:wh|wf)\d+[a-z0-9]*\b/i,
  )?.[0];
  const accessory = /\b(case|cover|sleeve|protector)\b/.test(title);
  const brand = product.brand && !/^unknown\b/i.test(product.brand) ? product.brand : '';
  if (model)
    return [accessory ? '' : brand, model, accessory ? 'case' : ''].filter(Boolean).join(' ');
  if (/\bpanchatantra\b/.test(title))
    return [title.match(/\b\d+\b/)?.[0], 'Panchatantra'].filter(Boolean).join(' ');
  if (/\bweighted vest\b/.test(title)) return [brand, 'weighted vest'].filter(Boolean).join(' ');
  return product.name.split(/[|(,]/)[0].split(/\s+/).slice(0, 10).join(' ').trim().slice(0, 150);
}

export function otherRetailerListings(current: Product, products: Product[], offers: Offer[]) {
  const stores = (p: Product) =>
    [
      ...offers.filter((o) => o.productId === p.id).map((o) => o.store),
      p.attributes.Retailer,
    ].filter(Boolean);
  const currentStores = new Set(stores(current));
  const query = retailerComparisonQuery(current);
  return products
    .filter(
      (p) =>
        p.id !== current.id &&
        p.category === current.category &&
        stores(p).some((store) => !currentStores.has(store)) &&
        matchesQuery(p, query) &&
        !discoveryConflict(p.name, query),
    )
    .slice(0, 4);
}
