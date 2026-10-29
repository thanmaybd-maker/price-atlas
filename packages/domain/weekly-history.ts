import { total, type Offer } from './index';
import { retailers } from './retailers';
export function weeklyHistory(
  observations: Offer[],
  basis: 'delivered' | 'item',
  now = Date.now(),
) {
  const dayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const midnight = Date.parse(`${dayKey}T00:00:00+05:30`);
  let previous: number | null = null;
  return Array.from({ length: 7 }, (_, index) => {
    const start = midnight - (6 - index) * 86400000;
    const samples = observations
      .filter(
        (o) =>
          o.historyAllowed &&
          o.accepted &&
          o.condition === 'new' &&
          o.currency === 'INR' &&
          !retailers[o.store].international &&
          o.stock &&
          o.observedAt >= start &&
          o.observedAt < start + 86400000 &&
          o.observedAt <= now,
      )
      .flatMap((o) => {
        const price = total(o, basis);
        return price === null
          ? []
          : [{ store: o.store === 'Amazon' ? 'Amazon.in' : o.store, price }];
      })
      .sort((a, b) => a.price - b.price);
    const best = new Map<string, number>();
    for (const s of samples) if (!best.has(s.store)) best.set(s.store, s.price);
    const stores = [...best].map(([store, price]) => ({ store, price }));
    const low = samples[0] || null,
      high = samples.at(-1) || null;
    const change = low && previous !== null ? low.price - previous : null;
    previous = low?.price ?? null;
    return { date: new Date(start), stores, low, high, change };
  });
}
