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
  /** A "drop" that only undoes a recent increase: the usual inflate-then-discount pattern. */
  raisedBeforeDrop: { peak: number; usual: number; risePercent: number } | null;
};

/**
 * True when the highest daily low in the last 14 days sat at least 10% above the usual
 * (median) price, and today's price is only back near that usual level (within 3%).
 */
export function raisedBeforeDrop(
  daily: (number | null)[],
  current: number | null,
): PriceInsight['raisedBeforeDrop'] {
  const recorded = daily.filter((p): p is number => p !== null);
  if (current == null || recorded.length < 7) return null;
  const sorted = [...recorded].sort((a, b) => a - b);
  const usual = sorted[Math.floor(sorted.length / 2)];
  const recent = daily.slice(-15, -1).filter((p): p is number => p !== null);
  if (!recent.length) return null;
  const peak = Math.max(...recent);
  if (peak < usual * 1.1 || current >= peak || current < usual * 0.97) return null;
  return { peak, usual, risePercent: Math.round(((peak - usual) / usual) * 100) };
}

export function priceInsight(
  observations: Offer[],
  basis: 'item' | 'delivered',
  current: number | null,
  days = 30,
  now = Date.now(),
): PriceInsight {
  const daily = dailyHistory(observations, basis, days, now).map((d) => d.price);
  const lows = daily.filter((p): p is number => p !== null);
  const pattern = raisedBeforeDrop(daily, current);
  const recorded = lows.length;
  const low = recorded ? Math.min(...lows) : null;
  const high = recorded ? Math.max(...lows) : null;
  // Whole rupees: an average shown as ₹56,428.69 reads as false precision.
  const average = recorded
    ? Math.round(lows.reduce((a, b) => a + b, 0) / recorded / 100) * 100
    : null;
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
      raisedBeforeDrop: pattern,
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
      raisedBeforeDrop: pattern,
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
      raisedBeforeDrop: pattern,
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
    raisedBeforeDrop: pattern,
    verdict: 'high',
    reason: `Above the ${recorded}-day average; the lowest day was ${aboveLowPercent}% cheaper.`,
  };
}
