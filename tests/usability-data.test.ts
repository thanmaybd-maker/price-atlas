import { afterEach, expect, it, vi } from 'vitest';
import { createReadCache } from '../apps/web/lib/public-cache';
import { historyCoverage } from '../packages/domain/history-coverage';
import type { Offer } from '../packages/domain/index';

afterEach(() => vi.useRealTimers());
it('coalesces simultaneous public reads and preserves the original observation timestamp across cache hits', async () => {
  vi.useFakeTimers();
  const cache = createReadCache(1000, 2);
  const source = vi.fn(async () => ({ observedAt: 123 }));
  const [a, b] = await Promise.all([cache.read('public', source), cache.read('public', source)]);
  expect(source).toHaveBeenCalledTimes(1);
  expect(a).toBe(b);
  expect(b.observedAt).toBe(123);
  vi.advanceTimersByTime(1001);
  await cache.read('public', source);
  expect(source).toHaveBeenCalledTimes(2);
});
it('does not keep a failed read as an empty success or permanently poisoned cache entry', async () => {
  const cache = createReadCache();
  await expect(
    cache.read('history', async () => {
      throw Error('database unavailable');
    }),
  ).rejects.toThrow('database unavailable');
  await expect(cache.read('history', async () => ['real observation'])).resolves.toEqual([
    'real observation',
  ]);
});
it('bounds public cache growth and re-reads evicted keys', async () => {
  const cache = createReadCache(10000, 2);
  let checks = 0;
  const source = async () => ++checks;
  await cache.read('a', source);
  await cache.read('b', source);
  await cache.read('c', source);
  await cache.read('a', source);
  expect(checks).toBe(4);
});
it('describes sparse item history without inventing daily checks or delivered totals', () => {
  const now = Date.parse('2026-10-29T10:00:00+05:30');
  const o: Offer = {
    id: 'one',
    productId: 'serum',
    store: 'Nykaa',
    itemPrice: 59900,
    shipping: null,
    charges: 0,
    discount: 0,
    currency: 'INR',
    accepted: true,
    condition: 'new',
    stock: true,
    observedAt: now,
    validUntil: now + 100,
    historyAllowed: true,
    displayAllowed: true,
    alertsAllowed: true,
    seller: '',
    context: '',
  };
  const previous = { ...o, observedAt: now - 86400000 };
  const unsafe = [
    { ...o, store: 'iHerb' as const },
    { ...o, condition: 'used' as const },
    { ...o, observedAt: now + 1 },
    { ...o, historyAllowed: false },
  ];
  expect(historyCoverage([o, o, previous, ...unsafe], 'item', 30, now)).toEqual({
    days: 30,
    recordedDays: 2,
    checks: 3,
    first: '2026-10-28',
    last: '2026-10-29',
  });
  expect(historyCoverage([o, previous], 'delivered', 30, now).recordedDays).toBe(0);
});
