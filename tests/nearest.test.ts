import { describe, it, expect } from 'vitest';
import {
  buildNearestQuery,
  extractSpecQuantities,
  findNearestProducts,
  nearestConflict,
  nearestStoresFor,
} from '../packages/domain/nearest';
import { parseQueryIntent } from '../packages/domain/query-intent';
import { matchesQuery } from '../packages/domain/search';
import type { Offer, Product } from '../packages/domain/index';

const NOW = Date.parse('2026-11-26T12:00:00Z');

const product = (
  id: string,
  name: string,
  brand: string,
  category: Product['category'],
  attributes: Record<string, string> = { Retailer: 'Amazon' },
) =>
  ({
    id,
    slug: id,
    name,
    brand,
    category,
    subtitle: '',
    description: '',
    attributes,
  }) as unknown as Product;

const offer = (productId: string, rupees: number, over: Partial<Offer> = {}): Offer => ({
  id: `${productId}-${rupees}-${over.store || 'Amazon'}`,
  productId,
  store: 'Amazon',
  itemPrice: rupees * 100,
  shipping: null,
  charges: 0,
  discount: 0,
  currency: 'INR',
  stock: true,
  accepted: true,
  condition: 'new',
  observedAt: NOW - 3600000,
  validUntil: NOW + 3600000,
  historyAllowed: true,
  alertsAllowed: true,
  displayAllowed: true,
  seller: 's',
  context: 'c',
  ...over,
});

describe('spelling and typo tolerance', () => {
  it('recognizes common laptop and brand typos in query intent', () => {
    const intent = parseQueryIntent('latptop lenovo 10gb ram, 60gb hard disk ssd');
    expect(intent.category).toBe('laptops');
    expect(intent.categoryWords).toEqual(['laptop']);
    expect(intent.text).toContain('lenovo');
    expect(parseQueryIntent('lpatop lenevo 8gb').category).toBe('laptops');
    expect(parseQueryIntent('lpatop lenevo 8gb').text).toBe('lenovo 8gb');
  });

  it('handles adjacent transpositions in exact matchesQuery while keeping numbers strict', () => {
    const p = { name: 'Lenovo IdeaPad Laptop 8GB RAM', brand: 'Lenovo', subtitle: '' };
    expect(matchesQuery(p, 'lpatop lenovo 8gb')).toBe(true);
    expect(matchesQuery(p, 'latptop lenovo 10gb')).toBe(false);
  });
});

describe('extractSpecQuantities', () => {
  it('tags RAM and storage roles cleanly even in Flipkart slash-separated laptop titles', () => {
    const querySpecs = extractSpecQuantities('latptop lenovo 10gb ram, 60gb hard disk ssd');
    expect(querySpecs).toEqual([
      { value: 10, unit: 'gb', role: 'ram', raw: '10gb' },
      { value: 60, unit: 'gb', role: 'storage', raw: '60gb' },
    ]);

    const flipkartSpecs = extractSpecQuantities(
      'Lenovo IdeaPad Slim 3 Intel Core i3 12th Gen - (8 GB/512 GB SSD/Windows 11 Home)',
    );
    expect(flipkartSpecs).toEqual([
      { value: 8, unit: 'gb', role: 'ram', raw: '8gb' },
      { value: 512, unit: 'gb', role: 'storage', raw: '512gb' },
    ]);

    const tbSpecs = extractSpecQuantities('Lenovo Legion Pro 5 (32 GB RAM / 1 TB SSD)');
    expect(tbSpecs).toEqual([
      { value: 32, unit: 'gb', role: 'ram', raw: '32gb' },
      { value: 1024, unit: 'gb', role: 'storage', raw: '1tb' },
    ]);
  });
});

describe('buildNearestQuery', () => {
  it('relaxes typo + unmatched RAM/storage specs into a clean store search phrase', () => {
    const plan = buildNearestQuery('latptop lenovo 10gb ram, 60gb hard disk ssd');
    expect(plan.category).toBe('laptops');
    expect(plan.brand).toBe('lenovo');
    expect(plan.query).toBe('lenovo laptop ssd');
    expect(plan.relaxed).toBe(true);
  });

  it('preserves model numbers while dropping unmatched storage and color', () => {
    const phone = buildNearestQuery('iphone 16 512gb pink');
    expect(phone.category).toBe('phones');
    expect(phone.brand).toBe('apple');
    expect(phone.query).toBe('apple iphone 16');
    expect(phone.relaxed).toBe(true);

    const gpu = buildNearestQuery('rtx 5060 24gb');
    expect(gpu.query).toBe('rtx 5060');
    expect(gpu.relaxed).toBe(true);
  });

  it('broadens an unmatched model code when no specs or colors were present', () => {
    const headphones = buildNearestQuery('sony wh-1000xm6');
    expect(headphones.brand).toBe('sony');
    expect(headphones.category).toBe('audio');
    expect(headphones.query).toBe('sony headphones');
    expect(headphones.relaxed).toBe(true);
  });
});

describe('findNearestProducts and nearestConflict', () => {
  const v15 = product(
    'lenovo-v15',
    'Lenovo V15 Intel Core i3 (8 GB RAM / 256 GB SSD / Windows 11)',
    'Lenovo',
    'laptops',
  );
  const slim3 = product(
    'lenovo-slim3',
    'Lenovo IdeaPad Slim 3 - (8 GB/512 GB SSD/Windows 11 Home)',
    'Lenovo',
    'laptops',
    { Retailer: 'Flipkart' },
  );
  const thinkpad = product(
    'lenovo-e14',
    'Lenovo ThinkPad E14 (16 GB RAM / 512 GB SSD)',
    'Lenovo',
    'laptops',
  );
  const legion = product(
    'lenovo-legion',
    'Lenovo Legion Pro 5 (32 GB RAM / 1 TB SSD)',
    'Lenovo',
    'laptops',
  );
  const bag = product('lenovo-bag', 'Lenovo 15.6 inch Laptop Backpack', 'Lenovo', 'accessories');
  const hp = product('hp-15', 'HP Pavilion 15 (8 GB RAM / 512 GB SSD)', 'HP', 'laptops');
  const serum = product(
    'serum',
    'Minimalist 10% Niacinamide Face Serum 30ml',
    'Minimalist',
    'personal-care',
    { Retailer: 'Nykaa' },
  );
  const catalog = [legion, bag, hp, slim3, thinkpad, v15, serum];
  const catalogOffers = [
    offer('lenovo-v15', 32990),
    offer('lenovo-slim3', 36990, { store: 'Flipkart' }),
    offer('lenovo-e14', 64990),
    offer('lenovo-legion', 149990),
    offer('lenovo-bag', 999),
    offer('hp-15', 45990),
    offer('serum', 599, { store: 'Nykaa' }),
  ];

  it('finds closest same-brand laptops sorted by spec closeness and excludes bags and other categories', () => {
    const res = findNearestProducts(
      catalog,
      catalogOffers,
      'latptop lenovo 10gb ram, 60gb hard disk ssd',
      { now: NOW },
    );
    expect(res.brandFallback).toBe(false);
    expect(res.items.map((i) => i.p.id)).toEqual([
      'lenovo-v15',
      'lenovo-slim3',
      'lenovo-e14',
      'lenovo-legion',
    ]);
    expect(res.items[0].reason).toContain('8 GB RAM / 256 GB');
  });

  it('falls back to same-category laptops and sets brandFallback when requested brand is absent', () => {
    const res = findNearestProducts(
      [hp, bag, serum],
      catalogOffers,
      'latptop lenovo 10gb ram, 60gb hard disk ssd',
      { now: NOW },
    );
    expect(res.brandFallback).toBe(true);
    expect(res.items.map((i) => i.p.id)).toEqual(['hp-15']);
  });

  it('returns nothing for unrelated gibberish queries', () => {
    const res = findNearestProducts(catalog, catalogOffers, 'zzzzqqqq99999', { now: NOW });
    expect(res.items).toHaveLength(0);
  });

  it('rejects accessories, bundles and wrong categories in nearestConflict while allowing spec differences', () => {
    const plan = buildNearestQuery('latptop lenovo 10gb ram, 60gb hard disk ssd');
    expect(
      nearestConflict(
        'Lenovo IdeaPad Slim 3 Laptop 8GB RAM 512GB SSD',
        plan,
        'latptop lenovo 10gb ram, 60gb hard disk ssd',
      ),
    ).toBe(false);
    expect(
      nearestConflict(
        'Lenovo 15.6 inch Laptop Backpack',
        plan,
        'latptop lenovo 10gb ram, 60gb hard disk ssd',
      ),
    ).toBe(true);
    expect(
      nearestConflict(
        'Lenovo Tab M11 Tablet 8GB 128GB',
        plan,
        'latptop lenovo 10gb ram, 60gb hard disk ssd',
      ),
    ).toBe(true);
    expect(
      nearestConflict(
        'Lenovo Laptop Combo Bundle with Mouse and Bag',
        plan,
        'latptop lenovo 10gb ram, 60gb hard disk ssd',
      ),
    ).toBe(true);
  });

  it('picks category-appropriate domestic stores instead of cosmetics stores for laptops', () => {
    expect(nearestStoresFor('laptops')).toEqual([
      'Amazon',
      'Flipkart',
      'Croma',
      'Reliance Digital',
    ]);
    expect(nearestStoresFor('beauty')).toEqual(['Nykaa', 'Amazon', 'Flipkart', 'Myntra']);
  });
});
