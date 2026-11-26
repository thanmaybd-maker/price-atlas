import { expect, it } from 'vitest';
import { priceInsight } from '../packages/domain/price-insight';
import type { Offer } from '../packages/domain/index';

const now = Date.parse('2026-11-26T12:00:00+05:30');
const day = 86400000;
const obs = (daysAgo: number, itemPrice: number): Offer =>
  ({
    id: `o${daysAgo}`,
    productId: 'p',
    store: 'Amazon',
    itemPrice,
    shipping: 0,
    charges: 0,
    discount: 0,
    currency: 'INR',
    condition: 'new',
    stock: true,
    accepted: true,
    historyAllowed: true,
    displayAllowed: true,
    alertsAllowed: true,
    observedAt: now - daysAgo * day,
    validUntil: now + day,
  }) as Offer;

it('refuses a verdict on fewer than 7 recorded days', () => {
  const r = priceInsight([obs(1, 1000), obs(2, 900)], 'item', 950, 30, now);
  expect(r.verdict).toBe('thin');
  expect(r.days).toBe(2);
  expect(r.low).toBe(900);
});

it('calls a price at the recorded low good, below average fair, above average high', () => {
  const history = [1200, 1100, 1000, 1150, 1250, 1300, 1050, 1000].map((p, i) => obs(i + 1, p));
  expect(priceInsight(history, 'item', 1010, 30, now).verdict).toBe('good');
  expect(priceInsight(history, 'item', 1100, 30, now).verdict).toBe('fair');
  const high = priceInsight(history, 'item', 1290, 30, now);
  expect(high.verdict).toBe('high');
  expect(high.high).toBe(1300);
  expect(high.average).toBe(1131);
  expect(high.aboveLowPercent).toBe(29);
});
