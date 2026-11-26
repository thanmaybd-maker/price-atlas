import { expect, it } from 'vitest';
import { catalogCard } from '../packages/domain/catalog-card';
import {
  alertSent,
  alertStores,
  dedupeOffers,
  mergeOffers,
  ruleNow,
  shownOffers,
} from '../packages/domain/offer-rules';
import { publicSpecs } from '../packages/domain/specs';
import { unitPrice } from '../packages/domain/unit-price';
import type { Offer, Product, Rule } from '../packages/domain/index';

const now = Date.parse('2026-11-26T12:00:00+05:30');
const offer = (o: Partial<Offer>): Offer =>
  ({
    id: Math.random().toString(36),
    productId: 'p',
    store: 'Amazon',
    itemPrice: 1000,
    shipping: null,
    charges: 0,
    discount: 0,
    currency: 'INR',
    condition: 'new',
    stock: true,
    accepted: true,
    historyAllowed: true,
    displayAllowed: true,
    alertsAllowed: true,
    observedAt: now - 60000,
    validUntil: now + 3600000,
    ...o,
  }) as Offer;
const rule = (r: Partial<Rule> = {}) =>
  ({ productId: 'p', store: 'all', basis: 'item', target: 1000, operator: 'lte', ...r }) as Rule;

it('never shows a refurbished, other-variant or hidden offer as the price', () => {
  const list = [
    offer({ itemPrice: 500, condition: 'refurbished' }),
    offer({ itemPrice: 600, accepted: false }),
    offer({ itemPrice: 700, displayAllowed: false }),
    offer({ itemPrice: 900 }),
  ];
  expect(shownOffers(list).map((o) => o.itemPrice)).toEqual([900]);
});

it('judges a target with the alert engine inputs, on the rule basis', () => {
  // Met on item price, but delivered price is unknown (no shipping): not met on delivered.
  const list = [offer({ itemPrice: 950 })];
  expect(ruleNow(rule(), list, now)).toMatchObject({ price: 950, met: true, store: 'Amazon' });
  const delivered = ruleNow(rule({ basis: 'delivered' }), list, now);
  expect(delivered.met).toBe(false);
  expect(delivered.price).toBeNull();
  expect(delivered.last?.price).toBe(950);
  // An offer that may not alert never makes a target "met".
  expect(ruleNow(rule(), [offer({ itemPrice: 900, alertsAllowed: false })], now).met).toBe(false);
});

it('offers only stores that can alert, and says "sent" only for a delivered alert', () => {
  expect(
    alertStores([offer({ store: 'Amazon' }), offer({ store: 'Croma', alertsAllowed: false })]),
  ).toEqual(['Amazon']);
  expect(Boolean(alertSent(rule(), [{ productId: 'p', price: 950, state: 'pending' }]))).toBe(
    false,
  );
  expect(Boolean(alertSent(rule(), [{ productId: 'p', price: 950, state: 'delivered' }]))).toBe(
    true,
  );
  expect(Boolean(alertSent(rule(), [{ productId: 'p', price: 1200, state: 'delivered' }]))).toBe(
    false,
  );
});

it('lists store specifications without internal bookkeeping', () => {
  expect(
    publicSpecs({
      RAM: '8 GB',
      'Verification status': 'VERIFIED',
      'Fetch method': 'Direct',
      'Product URL': 'https://x',
      Battery: '5000 mAh',
    }),
  ).toEqual([
    ['RAM', '8 GB'],
    ['Battery', '5000 mAh'],
  ]);
});

it('works out price per 100 ml or per 10 g, only for goods sold by quantity', () => {
  expect(unitPrice('Cetaphil Gentle Cleanser 250ml', {}, 50000, 'personal-care')).toEqual({
    paise: 20000,
    per: '100 ml',
  });
  expect(unitPrice('Lakme Matte Lipstick (3.6g)', {}, 36000, 'beauty')).toEqual({
    paise: 100000,
    per: '10 g',
  });
  expect(unitPrice('Lenovo Laptop 1.8kg', {}, 5000000, 'laptops')).toBeNull();
});

it('does not count an old alert as sent after the target is lowered or the rule changed', () => {
  const sent = [{ rule_id: 'r1', ruleVersion: 1, price: 950, state: 'delivered' }];
  expect(Boolean(alertSent({ ...rule(), id: 'r1', version: 1 }, sent))).toBe(true);
  expect(Boolean(alertSent({ ...rule({ target: 900 }), id: 'r1', version: 1 }, sent))).toBe(false);
  expect(Boolean(alertSent({ ...rule(), id: 'r1', version: 2 }, sent))).toBe(false);
});

it('keeps the basis of a fallback price so an item price is never shown as delivered', () => {
  const r = ruleNow(rule({ basis: 'delivered' }), [offer({ itemPrice: 950, shipping: null })], now);
  expect(r.last).toMatchObject({ price: 950, basis: 'item' });
  const known = ruleNow(
    rule({ basis: 'delivered' }),
    [offer({ itemPrice: 950, shipping: 40, alertsAllowed: false })],
    now,
  );
  expect(known.last).toMatchObject({ price: 990, basis: 'delivered' });
});

it('reads pack size from Net Quantity when the title has none', () => {
  expect(
    unitPrice('Herbal Face Wash', { 'Net Quantity': '150 ml' }, 30000, 'personal-care'),
  ).toEqual({
    paise: 20000,
    per: '100 ml',
  });
});

it('does not let a non-quantity Size block Net Quantity, Item Volume, Item Weight or Indian units', () => {
  expect(
    unitPrice(
      'Hydrating Gel',
      { Size: 'Regular', 'Item Volume': '200 ml' },
      40000,
      'personal-care',
    ),
  ).toEqual({ paise: 20000, per: '100 ml' });
  expect(unitPrice('Daily Cream 100gm', {}, 25000, 'personal-care')).toEqual({
    paise: 25000,
    per: '100 g',
  });
  expect(unitPrice('Shampoo 2 x 200ml', {}, 80000, 'personal-care')).toEqual({
    paise: 20000,
    per: '100 ml',
  });
  const card = catalogCard({
    id: 'gel',
    name: 'Hydrating Gel',
    category: 'personal-care',
    description: '',
    attributes: { 'Item Volume': '200 ml', 'Item Weight': '220 g', Notes: 'extra' },
  } as unknown as Product);
  expect(card.attributes['Item Volume']).toBe('200 ml');
  expect(card.attributes['Item Weight']).toBe('220 g');
  expect(unitPrice(card.name, card.attributes, 40000, card.category)).toEqual({
    paise: 20000,
    per: '100 ml',
  });
});

it('skips unit price on mixed combos and bundles instead of dividing by the first item size', () => {
  expect(
    unitPrice(
      'Skincare Routine Combo with Serum, 15ml + Foaming Cleanser, 50ml',
      { Bundle: 'yes' },
      40800,
      'personal-care',
    ),
  ).toBeNull();
  expect(
    unitPrice('Orange Face Scrub, 100g and Orange Face Wash, 100ml', {}, 25500, 'personal-care'),
  ).toBeNull();
});

it('deduplicates re-checked observations of the same listing while keeping distinct stores', () => {
  const older = offer({
    id: 'obs-1',
    store: 'Flipkart',
    itemPrice: 8299000,
    observedAt: now - 120000,
    purchaseUrl: 'https://www.flipkart.com/item/p/abc?pid=123',
  });
  const fresher = offer({
    id: 'obs-2',
    store: 'Flipkart',
    itemPrice: 8199000,
    observedAt: now - 10000,
    purchaseUrl: 'https://www.flipkart.com/item/p/abc?pid=123',
  });
  const amazon = offer({
    id: 'obs-3',
    store: 'Amazon',
    itemPrice: 8399000,
    observedAt: now - 30000,
    purchaseUrl: 'https://www.amazon.in/dp/B0TEST1234',
  });
  const merged = mergeOffers([older, amazon], [fresher]);
  expect(merged).toHaveLength(2);
  expect(merged.find((o) => o.store === 'Flipkart')?.id).toBe('obs-2');
  expect(merged.find((o) => o.store === 'Amazon')?.id).toBe('obs-3');
  expect(dedupeOffers([older, fresher])).toHaveLength(1);
});
