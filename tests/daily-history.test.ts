import { expect, it } from 'vitest';
import { dailyLows } from '../packages/domain/daily-history';
import type { Offer } from '../packages/domain/index';

const now = Date.parse('2026-10-29T01:00:00+05:30');
const offer: Offer = {
  id: 'one',
  productId: 'book',
  store: 'Amazon',
  itemPrice: 10000,
  shipping: null,
  charges: 0,
  discount: 0,
  currency: 'INR',
  accepted: true,
  condition: 'new',
  stock: true,
  observedAt: now - 1000,
  validUntil: now - 100,
  historyAllowed: true,
  displayAllowed: true,
  alertsAllowed: true,
  seller: '',
  context: 'default',
};

it('does not let cross-border INR, used, unaccepted, unavailable, future or unpermitted checks win a domestic tide', () => {
  const unsafe = [
    { ...offer, store: 'iHerb' as const },
    { ...offer, store: 'B&H' as const },
    { ...offer, condition: 'used' as const },
    { ...offer, currency: 'USD' },
    { ...offer, accepted: false },
    { ...offer, stock: false },
    { ...offer, historyAllowed: false },
    { ...offer, observedAt: now + 1 },
  ].map((o) => ({ ...o, itemPrice: 1 }));
  expect(dailyLows([offer, ...unsafe], 'item', 3, now)).toEqual([null, null, 10000]);
  expect(dailyLows([offer, ...unsafe], 'delivered', 3, now)).toEqual([null, null, null]);
});

it('preserves gaps, India day boundaries and real item/delivered minima without changing check times', () => {
  const yesterday = {
    ...offer,
    observedAt: Date.parse('2026-10-28T23:59:59+05:30'),
    itemPrice: 9000,
    shipping: 500,
  };
  expect(dailyLows([offer, yesterday], 'item', 3, now)).toEqual([null, 9000, 10000]);
  expect(dailyLows([offer, yesterday], 'delivered', 3, now)).toEqual([null, 9500, null]);
  expect(yesterday.observedAt).toBe(Date.parse('2026-10-28T23:59:59+05:30'));
});
