// "Is this a good price?" from our own recorded daily lows. No model, no guess: the verdict
// is plain arithmetic on real checks, and it says so when there are too few days to judge.
import { dailyHistory } from './daily-history';
import type { Offer } from './index';

export type PriceInsight = {
  days: number;
  low: number | null;
  high: number | null;
  average: number | null;
  current: number | null;
  /** How far the current price sits above the lowest recorded day, in percent. */
  aboveLowPercent: number | null;
  verdict: 'good' | 'fair' | 'high' | 'thin';
  reason: string;
};

export function priceInsight(
  observations: Offer[],
  basis: 'item' | 'delivered',
  current: number | null,
  days = 30,
  now = Date.now(),
): PriceInsight {
  const lows = dailyHistory(observations, basis, days, now)
    .map((d) => d.price)
    .filter((p): p is number => p !== null);
  const recorded = lows.length;
  const low = recorded ? Math.min(...lows) : null;
  const high = recorded ? Math.max(...lows) : null;
  const average = recorded ? Math.round(lows.reduce((a, b) => a + b, 0) / recorded) : null;
  const aboveLowPercent =
    current != null && low ? Math.round(((current - low) / low) * 1000) / 10 : null;
  if (current == null || recorded < 7)
    return {
      days: recorded,
      low,
      high,
      average,
      current,
      aboveLowPercent,
      verdict: 'thin',
      reason:
        current == null
          ? 'No current price to judge.'
          : `Only ${recorded} of ${days} days recorded so far; a verdict needs at least 7.`,
    };
  if (current <= low! * 1.02)
    return {
      days: recorded,
      low,
      high,
      average,
      current,
      aboveLowPercent,
      verdict: 'good',
      reason: `At or within 2% of the lowest price in ${recorded} recorded days.`,
    };
  if (current <= average!)
    return {
      days: recorded,
      low,
      high,
      average,
      current,
      aboveLowPercent,
      verdict: 'fair',
      reason: `Below the ${recorded}-day average, but ${aboveLowPercent}% above the lowest day.`,
    };
  return {
    days: recorded,
    low,
    high,
    average,
    current,
    aboveLowPercent,
    verdict: 'high',
    reason: `Above the ${recorded}-day average; the lowest day was ${aboveLowPercent}% cheaper.`,
  };
}
