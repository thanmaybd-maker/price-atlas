import { describe, it, expect } from 'vitest';
import { parseQueryIntent, applyIntent, knownPrice } from '../packages/domain/query-intent';
import { matchesQuery } from '../packages/domain/search';
import type { Offer, Product } from '../packages/domain/index';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const product = (id: string, name: string, category: Product['category'], retailer = 'Amazon') =>
  ({
    id,
    slug: id,
    name,
    brand: name.split(' ')[0],
    category,
    subtitle: '',
    description: '',
    attributes: { Retailer: retailer },
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

describe('parseQueryIntent', () => {
  it('reads Indian budget phrases', () => {
    expect(parseQueryIntent('laptop under 1 lakh')).toMatchObject({
      category: 'laptops',
      maxPaise: 10000000,
      text: '',
    });
    expect(parseQueryIntent('laptop under 1 lakhs')).toMatchObject({ maxPaise: 10000000 });
    expect(parseQueryIntent('laptop below 60k').maxPaise).toBe(6000000);
    expect(parseQueryIntent('laptop under ₹1,00,000').maxPaise).toBe(10000000);
    expect(parseQueryIntent('phone under 15000')).toMatchObject({
      category: 'phones',
      maxPaise: 1500000,
    });
    expect(parseQueryIntent('lipstick above 500').minPaise).toBe(50000);
    expect(parseQueryIntent('laptop between 50k and 80k')).toMatchObject({
      minPaise: 5000000,
      maxPaise: 8000000,
    });
  });
  it('fixes spellings and pulls the store out of the words', () => {
    expect(parseQueryIntent('foxtail dewy').text).toBe('foxtale dewy');
    expect(parseQueryIntent('foxtale on nayaka')).toMatchObject({
      store: 'Nykaa',
      text: 'foxtale',
    });
    expect(parseQueryIntent('Sony WH-1000XM5').text).toBe('sony wh-1000xm5');
  });
});

describe('applyIntent', () => {
  const neo = product('neo', 'Apple MacBook Neo 13 8GB 512GB', 'laptops');
  const pro = product('pro', 'Apple MacBook Pro M5 24GB 1TB', 'laptops');
  const mouse = product('mouse', 'Logitech M331 Mouse for PC/Mac/Laptop', 'accessories');
  const nothing = product('nothing', 'Dell XPS 13', 'laptops');
  const dewy = product('dewy', 'Foxtale Dewy Finish Sunscreen', 'personal-care', 'Nykaa');
  const products = [pro, neo, mouse, nothing, dewy];
  const offers = [
    offer('pro', 269900),
    // Neo: no current price, but a recorded one from yesterday
    offer('neo', 76990, { observedAt: NOW - 30 * 3600000, validUntil: NOW - 6 * 3600000 }),
    offer('mouse', 899),
    offer('dewy', 545, {
      store: 'Nykaa',
      observedAt: NOW - 3 * 86400000,
      validUntil: NOW - 2 * 86400000,
    }),
  ];
  const run = (q: string, o: { store?: string; sort?: string } = {}) =>
    applyIntent(products, offers, parseQueryIntent(q), matchesQuery, { ...o, now: NOW }).map(
      (r) => r.p.id,
    );

  it('laptop under 1 lakh finds the recorded 76,990 laptop, not the mouse or the 2.7 lakh one', () => {
    expect(run('laptop under 1 lakh')).toEqual(['neo']);
    expect(run('laptop')).toEqual(expect.arrayContaining(['pro', 'neo', 'nothing']));
    expect(run('laptop')).not.toContain('mouse');
  });
  it('a store chip shows only that store and prices by it', () => {
    expect(run('', { store: 'Nykaa' })).toEqual(['dewy']);
    expect(run('foxtail dewy')).toEqual(['dewy']);
    expect(run('foxtale on nykaa')).toEqual(['dewy']);
  });
  it('sorts numerically with unknown prices last', () => {
    expect(run('laptop', { sort: 'price-asc' })).toEqual(['neo', 'pro', 'nothing']);
    expect(run('laptop', { sort: 'price-desc' })).toEqual(['pro', 'neo', 'nothing']);
  });
  it('labels recorded prices as not fresh and ignores stale, foreign or old ones', () => {
    expect(knownPrice('neo', offers, undefined, NOW)).toMatchObject({
      paise: 7699000,
      fresh: false,
    });
    expect(knownPrice('pro', offers, undefined, NOW)).toMatchObject({ fresh: true });
    expect(
      knownPrice(
        'neo',
        [offer('neo', 1, { observedAt: NOW - 20 * 86400000, validUntil: 0 })],
        undefined,
        NOW,
      ),
    ).toBeNull();
    expect(knownPrice('neo', [offer('neo', 500, { currency: 'USD' })], undefined, NOW)).toBeNull();
  });
});

describe('nearMisses', () => {
  it('offers labelled alternatives when nothing in stock fits the budget', async () => {
    const { nearMisses } = await import('../packages/domain/query-intent');
    const m2 = {
      ...({} as Product),
      id: 'm2',
      slug: 'm2',
      name: 'MacBook Air M2',
      brand: 'Apple',
      category: 'laptops',
      subtitle: '',
      attributes: {},
    } as unknown as Product;
    const NOW2 = Date.parse('2026-10-30T12:00:00Z');
    const o = {
      id: 'x',
      productId: 'm2',
      store: 'Flipkart',
      itemPrice: 8590000,
      shipping: null,
      charges: 0,
      discount: 0,
      currency: 'INR',
      stock: false,
      accepted: true,
      condition: 'new',
      observedAt: NOW2 - 2 * 86400000,
      validUntil: NOW2 - 86400000,
      historyAllowed: true,
      alertsAllowed: false,
      displayAllowed: true,
      seller: 's',
      context: 'c',
    } as Offer;
    const intent = parseQueryIntent('laptop under 1 lakh');
    expect(applyIntent([m2], [o], intent, matchesQuery, { now: NOW2 })).toHaveLength(0);
    const near = nearMisses([m2], [o], intent, matchesQuery, { now: NOW2 });
    expect(near[0]).toMatchObject({ p: { id: 'm2' }, price: { paise: 8590000, inStock: false } });
  });
});
