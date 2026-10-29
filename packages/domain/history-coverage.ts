import { total, type Offer } from './index';
import { retailers } from './retailers';
export function historyCoverage(
  observations: Offer[],
  basis: 'item' | 'delivered',
  days = 30,
  now = Date.now(),
) {
  const date = (at: number) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  const start = Date.parse(`${date(now)}T00:00:00+05:30`) - (days - 1) * 86400000;
  const samples = observations.filter(
    (o) =>
      o.historyAllowed &&
      o.accepted &&
      o.condition === 'new' &&
      o.stock &&
      o.currency === 'INR' &&
      !retailers[o.store].international &&
      o.observedAt >= start &&
      o.observedAt <= now &&
      total(o, basis) !== null,
  );
  const dates = [...new Set(samples.map((o) => date(o.observedAt)))].sort();
  return {
    days,
    recordedDays: dates.length,
    checks: samples.length,
    first: dates[0] || null,
    last: dates.at(-1) || null,
  };
}
