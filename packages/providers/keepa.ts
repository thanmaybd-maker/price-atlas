// Real amazon.in price history from Keepa (https://keepa.com/api-docs/product.html).
//
// Keepa has tracked Amazon India (domain 10) for years, so a product added to Price Atlas
// today can show its true past 30 / 90 days instead of an empty chart. Keepa logs a price
// only when it changes; the price in effect at the end of each India day is that day's
// value. Out-of-stock stretches (-1) stay gaps. Rows are history-only: they never become a
// current offer, never trigger alerts, and are labelled "Keepa price history".
import type { Offer } from '../domain/index';

const KEEPA_EPOCH_MINUTES = 21564000; // Keepa time 0 = 2011-01-01 UTC, in Unix minutes
const DAY = 86400000;
const IST = 19800000;

export const KEEPA_SOURCE = 'keepa';
export const keepaConfigured = () => Boolean(process.env.KEEPA_API_KEY);
const keepaMs = (t: number) => (t + KEEPA_EPOCH_MINUTES) * 60000;
const istDayStart = (ms: number) => Math.floor((ms + IST) / DAY) * DAY - IST;

export type KeepaPoint = { at: number; paise: number | null };

/** Keepa csv arrays are [time, price, time, price, ...]; -1 means not available. */
export function keepaSeries(csv: unknown): KeepaPoint[] {
  if (!Array.isArray(csv)) return [];
  const out: KeepaPoint[] = [];
  for (let i = 0; i + 1 < csv.length; i += 2) {
    const t = Number(csv[i]);
    const v = Number(csv[i + 1]);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    out.push({ at: keepaMs(t), paise: v > 0 ? Math.round(v) : null });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Day-end prices for the last `days` complete India days (today excluded: today's price
 * comes from our own live check). `scale` converts Keepa units to paise.
 */
export function dailyFromSeries(
  points: KeepaPoint[],
  days: number,
  now = Date.now(),
  scale = 1,
): { day: number; paise: number }[] {
  const today = istDayStart(now);
  const out: { day: number; paise: number }[] = [];
  let j = 0;
  let current: number | null = null;
  for (let d = today - days * DAY; d < today; d += DAY) {
    const end = d + DAY;
    // lowest in-stock price seen during the day, else the price carried into it
    let low: number | null = null;
    while (j < points.length && points[j].at < end) {
      const p = points[j];
      if (p.at >= d && p.paise != null) low = low == null ? p.paise : Math.min(low, p.paise);
      current = p.paise;
      j++;
    }
    const value = low ?? current;
    if (value != null) out.push({ day: d, paise: Math.round(value * scale) });
  }
  return out;
}

/**
 * Keepa stores amazon.in prices in its own integer unit. Pick the factor (1 or 100) that
 * makes Keepa's latest price agree with the price we saw on the live page; refuse when
 * neither agrees within 25%, so a mismatched ASIN or unit never writes history.
 */
export function unitScale(latestKeepa: number | null, livePaise: number | null) {
  if (!latestKeepa || !livePaise) return null;
  for (const scale of [1, 100]) {
    const ratio = (latestKeepa * scale) / livePaise;
    if (ratio > 0.75 && ratio < 1.25) return scale;
  }
  return null;
}

export async function fetchKeepa(asin: string, f: typeof fetch = fetch) {
  const key = process.env.KEEPA_API_KEY;
  if (!key) return { ok: false as const, reason: 'unconfigured' };
  const url = `https://api.keepa.com/product?key=${encodeURIComponent(key)}&domain=10&asin=${encodeURIComponent(asin)}`;
  const res = await f(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    await res.body?.cancel();
    return { ok: false as const, reason: `http_${res.status}` };
  }
  const body = (await res.json()) as {
    tokensLeft?: number;
    products?: { asin?: string; csv?: unknown[] }[];
  };
  const product = body.products?.[0];
  if (!product || product.asin?.toUpperCase() !== asin.toUpperCase() || !product.csv)
    return { ok: false as const, reason: 'not_found' };
  // csv[0] = sold by Amazon, csv[1] = lowest new offer from any seller.
  const amazon = keepaSeries(product.csv[0]);
  const lowestNew = keepaSeries(product.csv[1]);
  return { ok: true as const, amazon, lowestNew, tokensLeft: body.tokensLeft };
}

/** History-only Offer rows for one Amazon listing. */
export function keepaObservations(
  listing: { id: string; productId: string; url: string },
  daily: { day: number; paise: number }[],
): { id: string; observedAt: number; offer: Offer }[] {
  return daily.map(({ day, paise }) => {
    const observedAt = day + DAY - 60000; // 23:59 IST: the price in effect that day
    const offer: Offer = {
      id: `keepa:${listing.id}:${observedAt}`,
      productId: listing.productId,
      store: 'Amazon',
      itemPrice: paise,
      shipping: null,
      charges: 0,
      discount: 0,
      currency: 'INR',
      stock: true,
      accepted: true,
      condition: 'new',
      observedAt,
      validUntil: observedAt,
      historyAllowed: true,
      alertsAllowed: false,
      displayAllowed: false,
      seller: 'Amazon.in (Keepa price history)',
      context: 'amazon.in price history from Keepa; not a live Price Atlas check.',
      purchaseUrl: listing.url,
      extractionMethod: 'Keepa amazon.in price history',
      source: KEEPA_SOURCE,
    };
    return { id: offer.id, observedAt, offer };
  });
}
