import { expect, it } from 'vitest';
import type { Offer } from '../packages/domain/index';
import { historyRecording } from '../packages/domain/history-recording';
const now = Date.parse('2026-11-01T12:00:00+05:30');
const point = (date: string, extra: Partial<Offer> = {}): Offer => ({
  id: date,
  productId: 'phone',
  store: 'Amazon',
  itemPrice: 10000,
  shipping: null,
  charges: 0,
  discount: 0,
  currency: 'INR',
  stock: true,
  accepted: true,
  condition: 'new',
  observedAt: Date.parse(date),
  validUntil: now - 1,
  historyAllowed: true,
  displayAllowed: true,
  alertsAllowed: false,
  seller: '',
  context: '',
  ...extra,
});

it('counts our distinct India days and a real streak without filling a gap or counting imported history', () => {
  const rows = [
    point('2026-10-06T10:00:00+05:30'),
    ...[28, 29, 30, 31].map((d) => point(`2026-10-${d}T10:00:00+05:30`)),
    point('2026-11-01T00:01:00+05:30'),
    point('2026-10-31T23:59:59+05:30'),
    point('2026-10-27T10:00:00+05:30', { source: 'wayback' }),
    point('2026-10-26T10:00:00+05:30', { source: 'keepa' }),
    point('2026-10-25T10:00:00+05:30', { source: 'external-feed' }),
  ];
  expect(historyRecording(rows, 'item', 30, now)).toMatchObject({
    recordedDays: 6,
    longestStreak: 5,
    streakStart: '2026-10-28',
    streakEnd: '2026-11-01',
  });
  expect(historyRecording(rows, 'delivered', 30, now)).toMatchObject({
    recordedDays: 0,
    longestStreak: 0,
    streakStart: null,
    streakEnd: null,
  });
});

it('does not count future, rejected, foreign or unavailable points toward a streak', () => {
  const rows = [
    point('2026-10-31T01:00:00+05:30'),
    point('2026-11-02T01:00:00+05:30'),
    point('2026-11-01T01:00:00+05:30', { accepted: false }),
    point('2026-11-01T01:00:00+05:30', { currency: 'USD' }),
    point('2026-11-01T01:00:00+05:30', { stock: false }),
  ];
  expect(historyRecording(rows, 'item', 30, now)).toMatchObject({
    recordedDays: 1,
    longestStreak: 1,
  });
});
