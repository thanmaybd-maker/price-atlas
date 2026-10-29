import { total, type Offer } from './index';
import { retailers } from './retailers';

// Historical observations can be older than display freshness, but must still
// carry history permission and the same domestic/variant/condition safeguards.
export function dailyHistory(
  observations: Offer[],
  basis: 'item' | 'delivered',
  days = 30,
  now = Date.now(),
) {
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const start = Date.parse(`${key.format(now)}T00:00:00+05:30`) - (days - 1) * 86400000;
  const result: { price: number | null; observations: Offer[] }[] = Array.from(
    { length: days },
    () => ({ price: null, observations: [] }),
  );
  for (const observation of observations) {
    if (
      !observation.historyAllowed ||
      !observation.accepted ||
      observation.condition !== 'new' ||
      observation.currency !== 'INR' ||
      retailers[observation.store].international ||
      !observation.stock ||
      observation.observedAt > now
    )
      continue;
    const index = Math.floor((observation.observedAt - start) / 86400000);
    if (index < 0 || index >= days) continue;
    const price = total(observation, basis);
    if (price === null) continue;
    const day = result[index];
    if (day.price === null || price < day.price) {
      day.price = price;
      day.observations = [observation];
    } else if (price === day.price) day.observations.push(observation);
  }
  return result;
}

export function dailyLows(
  observations: Offer[],
  basis: 'item' | 'delivered',
  days = 30,
  now = Date.now(),
) {
  return dailyHistory(observations, basis, days, now).map((day) => day.price);
}
