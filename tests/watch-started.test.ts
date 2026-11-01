import { expect, it } from 'vitest';
import { watchText } from '../packages/notifications/watch-started';
it('describes the live price when a target is pinned but not met', () => {
  const base = { title: 't', productId: 'p', target: 2000000 };
  expect(watchText({ ...base, price: 2200000, inStock: true, store: 'Amazon' }).now).toBe(
    'Amazon: ₹22,000 now, ₹2,000 above your target.',
  );
  expect(watchText({ ...base, price: 1900000, inStock: false, store: 'Flipkart' }).now).toBe(
    'Flipkart: ₹19,000, out of stock right now.',
  );
  expect(watchText({ ...base, price: null, inStock: null, store: null }).now).toBe(
    'No price available right now.',
  );
});
