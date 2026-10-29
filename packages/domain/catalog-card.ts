import type { Product } from './index';
const identity = new Set([
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
  'Condition',
  'Variant memory',
  'Net Quantity',
  'Number of Items',
  'Bundle',
  'Verification status',
  'Availability',
  'Source price',
  'Source currency',
  'Retailer',
  'Product URL',
  'Checked at',
]);
/** List cards retain identity and eligibility signals; detailed specifications load on the detail route. */
export function catalogCard(product: Product): Product {
  return {
    ...product,
    description: '',
    attributes: Object.fromEntries(
      Object.entries(product.attributes).filter(([key]) => identity.has(key)),
    ),
  };
}
