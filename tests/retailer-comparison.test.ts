import { expect, it } from 'vitest';
import type { Product } from '../packages/domain/index';
import {
  otherRetailerListings,
  retailerComparisonQuery,
} from '../packages/domain/retailer-comparison';
const product = (
  id: string,
  name: string,
  store: string,
  category: Product['category'] = 'phones',
): Product => ({
  id,
  slug: id,
  name,
  brand: 'Samsung',
  category,
  color: '',
  subtitle: '',
  description: '',
  attributes: { Retailer: store },
  basePrice: 0,
  accent: '',
});
it('finds other S25 Ultra retailer listings without requiring Amazon marketing copy or merging unknown variants', () => {
  const current = product(
    'amazon',
    'Samsung Galaxy S25 Ultra 5G AI Smartphone (Silverblue, 12GB RAM, 256GB Storage), 200MP Camera',
    'Amazon',
  );
  const other = product(
    'flipkart',
    'Samsung Galaxy S25 Ultra 5G (256 GB Storage, 12 GB RAM)',
    'Flipkart',
  );
  const rows = [
    other,
    product('wrong-model', 'Samsung Galaxy S24 Ultra', 'Flipkart'),
    product('case', 'Samsung S25 Ultra Phone Case', 'Meesho', 'accessories'),
  ];
  expect(retailerComparisonQuery(current)).toBe('Samsung galaxy s25 ultra');
  expect(otherRetailerListings(current, rows, [])).toEqual([other]);
});
it('keeps the product type for cases and makes book and weighted-vest retailer searches usable', () => {
  const phoneCase = product(
    'case',
    'Silicone Phone Case for Samsung S25 Ultra',
    'Amazon',
    'accessories',
  );
  expect(retailerComparisonQuery(phoneCase)).toBe('s25 ultra case');
  expect(
    otherRetailerListings(
      phoneCase,
      [
        product('phone', 'Samsung S25 Ultra', 'Flipkart'),
        product('cover', 'S25 Ultra case', 'Meesho', 'accessories'),
      ],
      [],
    ).map((p) => p.id),
  ).toEqual(['cover']);
  expect(
    retailerComparisonQuery(
      product(
        'book',
        '101 Tales The Great Panchatantra Collection - Witty Moral Stories',
        'Amazon',
        'books',
      ),
    ),
  ).toBe('101 Panchatantra');
  expect(
    retailerComparisonQuery(
      product('vest', 'Neoprene Weighted Vest For Fitness Running', 'Amazon', 'other'),
    ),
  ).toContain('weighted vest');
});

it('keeps non-Samsung S-series laptops specific and never matches a different brand like HP', () => {
  const asus = {
    ...product('asus', 'ASUS Vivobook S14 (2025) Intel Core Ultra 5 Laptop', 'Amazon', 'laptops'),
    brand: 'ASUS',
  };
  expect(retailerComparisonQuery(asus)).toBe('ASUS Vivobook S14');
  const lenovo = {
    ...product(
      'lenovo',
      'Lenovo 15 (2026) Intel Core i3 13th Gen 1315U - (8 GB/512 GB SSD)',
      'Amazon',
      'laptops',
    ),
    brand: 'Lenovo',
  };
  expect(retailerComparisonQuery(lenovo)).toBe('Lenovo 15 1315U');
  const hp = {
    ...product('hp', 'HP 15 (2026) Intel Core i3 13th Gen 1315U Laptop', 'Flipkart', 'laptops'),
    brand: 'HP',
  };
  const genericTitled = {
    ...product('acer', 'Thin & Light Laptop (Acer Aspire Lite AL15-41)', 'Amazon', 'laptops'),
    brand: 'Acer',
  };
  expect(retailerComparisonQuery(genericTitled)).toBe('Acer Thin & Light Laptop');
  expect(otherRetailerListings(lenovo, [hp], [])).toEqual([]);
});
