import { it, expect } from 'vitest';
import { discoveryConflict } from '../packages/domain/discovery-guard';
import { retailerOutcomes } from '../packages/domain/retailer-outcomes';
import { catalogCard } from '../packages/domain/catalog-card';
import { compareVariants, variantSignature } from '../packages/domain/variant-guard';
import type { Product, Offer } from '../packages/domain/index';
import { compareAttributes } from '../packages/matching/index';

it('books match on valid ISBN across ISBN/GTIN fields and preserve binding and edition', () => {
  const book = {
    ISBN: '978-0-262-04630-5',
    Edition: '4',
    Language: 'English',
    Binding: 'Paperback',
    Condition: 'new',
  };
  const other = {
    GTIN: '9780262046305',
    Edition: '4',
    Language: 'English',
    Binding: 'Paperback',
    Condition: 'new',
  };
  expect(compareAttributes('books', book, other).decision).toBe('accepted');
  expect(compareAttributes('books', book, { ...other, Binding: 'Hardcover' }).decision).toBe(
    'rejected',
  );
  expect(compareAttributes('books', book, { ...other, GTIN: '9780262033848' }).decision).toBe(
    'rejected',
  );
  expect(compareAttributes('books', { ...book, ISBN: 'invalid' }, other).decision).toBe('review');
});

it('known cosmetics and device identities match only with the same decisive attributes', () => {
  const lipstick = {
    Brand: 'Test',
    GTIN: 'shade-sku',
    Shade: 'Ruby',
    Size: '3g',
    Condition: 'new',
  };
  expect(compareAttributes('beauty', lipstick, { ...lipstick }).decision).toBe('accepted');
  expect(compareAttributes('beauty', lipstick, { ...lipstick, Shade: 'Rose' }).decision).toBe(
    'rejected',
  );
  const phone = {
    Brand: 'Test',
    'Model Number': 'Model10',
    RAM: '8GB',
    Storage: '128GB',
    Color: 'Blue',
    Connectivity: '5G',
    Condition: 'new',
  };
  expect(compareAttributes('phones', phone, { ...phone }).decision).toBe('accepted');
  expect(compareAttributes('phones', phone, { ...phone, Storage: '256GB' }).decision).toBe(
    'rejected',
  );
});

it.each([
  ['Kobo Clara 2E protective case', 'Kobo Libra Colour', true],
  ['Case for Kobo Libra Colour', 'Kobo Libra Colour', true],
  ['Kobo Libra Colour e-reader', 'Kobo Libra Colour', false],
  ['Case for Kobo Libra Colour', 'Kobo Libra Colour case', false],
  ['Sony WH-1000XM50 headphones', 'Sony WH-1000XM5', true],
  ['Casio fx-991ES Plus calculator', 'Casio fx-991CW', true],
  ['Minimalist Niacinamide 60ml', 'Minimalist Niacinamide 30ml', true],
])('discovery identity guard: %s / %s', (title, query, expected) => {
  expect(discoveryConflict(title, query)).toBe(expected);
});

it.each([
  ['Organizer pack of 1', {}, 'Organizer pack of 5', {}],
  ['Algorithms 4th edition paperback', {}, 'Algorithms 4th edition hardcover', {}],
  ['Phone 128GB', {}, 'Phone 256GB', {}],
  ['Lipstick', { Shade: 'Ruby', Size: '3g' }, 'Lipstick', { Shade: 'Rose', Size: '3g' }],
])('must-not-match variants remain separate: %s / %s', (a, aa, b, ba) => {
  expect(
    compareVariants(
      variantSignature(a as string, aa as Record<string, string>),
      variantSignature(b as string, ba as Record<string, string>),
    ).decision,
  ).toBe('rejected');
});

it('list payload keeps exact identity and leaves full specifications on the detail route', () => {
  const product = {
    id: 'book',
    name: 'Algorithms paperback',
    description: 'x'.repeat(5000),
    attributes: {
      ISBN: '9780262046305',
      Binding: 'Paperback',
      Edition: '4',
      Retailer: 'Amazon',
      'Product URL': 'https://www.amazon.in/dp/B000000001',
      'Long retailer specification': 'x'.repeat(5000),
    },
  } as Product;
  const card = catalogCard(product);
  expect(card.attributes.ISBN).toBe(product.attributes.ISBN);
  expect(card.attributes.Binding).toBe('Paperback');
  expect(JSON.stringify(card).length).toBeLessThan(JSON.stringify(product).length / 4);
  expect(product.description).toHaveLength(5000);
});

it('each retailer has an outcome and unattempted stores do not become no-match claims', () => {
  const now = 1793270000000;
  const offer = {
    store: 'Amazon',
    accepted: true,
    condition: 'new',
    currency: 'INR',
    stock: true,
    displayAllowed: true,
    observedAt: now - 1000,
    validUntil: now + 1000,
  } as Offer;
  const outcomes = retailerOutcomes(
    [offer],
    [
      { store: 'Nykaa', method: 'direct', status: 'blocked' },
      { store: 'Croma', method: 'direct', status: 'no_results' },
    ],
    false,
    now,
  );
  expect(outcomes).toHaveLength(10);
  expect(outcomes.find((r) => r.store === 'Amazon')?.status).toBe('Verified recorded offer');
  expect(outcomes.find((r) => r.store === 'Nykaa')?.status).toBe('Blocked by retailer');
  expect(outcomes.find((r) => r.store === 'Croma')?.status).toBe('No matching product found');
  expect(outcomes.find((r) => r.store === 'Meesho')?.status).toBe('Not checked');
  expect(retailerOutcomes([{ ...offer, validUntil: now - 1 }], [], false, now)[0].status).toContain(
    'not eligible',
  );
});
