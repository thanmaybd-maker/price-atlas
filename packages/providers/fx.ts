// Dated exchange-rate references from Frankfurter (European Central Bank reference rates).
//
// A conversion is an indicative reference only. The native amount stays the price of
// record; converted rupees never enter domestic ranking, alerts or history, and they
// exclude shipping, import duty and card fees.
export type FxReference = {
  from: string;
  to: string;
  rate: number;
  /** The ECB publication date the rate belongs to (YYYY-MM-DD). */
  date: string;
  source: 'Frankfurter (ECB reference rate)';
  fetchedAt: number;
};

const ENDPOINT = 'https://api.frankfurter.dev/v1/latest';
const TTL = 6 * 3600000;
const STALE_DAYS = 10;
const cache = new Map<string, { at: number; value: FxReference }>();

export const currencyCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z]{3}$/.test(value);

/** A dated rate, or null when Frankfurter is unreachable, malformed or stale. Never throws. */
export async function fxReference(
  from: string,
  to = 'INR',
  f: typeof fetch = fetch,
  now = Date.now(),
): Promise<FxReference | null> {
  if (!currencyCode(from) || !currencyCode(to) || from === to) return null;
  const key = `${from}>${to}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL) return hit.value;
  try {
    const res = await f(`${ENDPOINT}?base=${from}&symbols=${to}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return hit?.value ?? null;
    const body = (await res.json()) as {
      base?: unknown;
      date?: unknown;
      rates?: Record<string, unknown>;
    };
    const rate = body?.rates?.[to];
    const date = body?.date;
    if (
      body?.base !== from ||
      typeof rate !== 'number' ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    )
      return hit?.value ?? null;
    const published = Date.parse(`${date}T00:00:00Z`);
    if (
      !Number.isFinite(published) ||
      published > now + 86400000 ||
      now - published > STALE_DAYS * 86400000
    )
      return hit?.value ?? null;
    const value: FxReference = {
      from,
      to,
      rate,
      date,
      source: 'Frankfurter (ECB reference rate)',
      fetchedAt: now,
    };
    cache.set(key, { at: now, value });
    return value;
  } catch {
    return hit?.value ?? null;
  }
}

/** Format an amount in minor units (cents, paise) in its own currency. */
export function nativeMoney(minor: number, currency: string) {
  if (!currencyCode(currency) || !Number.isFinite(minor)) return 'Unavailable';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);
}

/** Indicative converted amount in minor units of the target currency. */
export const convertMinor = (minor: number, ref: Pick<FxReference, 'rate'>) =>
  Math.round(minor * ref.rate);

export function resetFxForTests() {
  cache.clear();
}
