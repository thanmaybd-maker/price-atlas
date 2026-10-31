// Real amazon.in price history from Keepa (https://keepa.com/api-docs/product.html).
//
// Keepa has tracked Amazon India (domain 10) for years, so a product added to Price Atlas
// today can show its true past 30 / 90 days instead of an empty chart. Keepa logs a price
// only when it changes; only dates with actual recorded changes become observations.
// Unobserved and out-of-stock dates stay gaps. Rows are history-only: they never become a
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
 * Lowest dated change per complete India day, preserving its actual timestamp.
 * Today is excluded. No price is carried into an unobserved day.
 */
export function dailyFromSeries(
  points: KeepaPoint[],
  days: number,
  now = Date.now(),
  scale = 1,
): { day: number; paise: number; observedAt: number }[] {
  const today = istDayStart(now);
  const observed = new Map<number, { day: number; paise: number; observedAt: number }>();
  for (const p of points) {
    if (
      !Number.isSafeInteger(p.at) ||
      p.at < today - days * DAY ||
      p.at >= today ||
      p.paise === null ||
      !Number.isSafeInteger(p.paise) ||
      p.paise <= 0
    )
      continue;
    const day = istDayStart(p.at);
    const price = Math.round(p.paise * scale);
    if (!Number.isSafeInteger(price) || price <= 0) continue;
    const previous = observed.get(day);
    if (!previous || price < previous.paise)
      observed.set(day, { day, paise: price, observedAt: p.at });
  }
  return [...observed.values()].sort((a, b) => a.day - b.day);
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
  daily: { day: number; paise: number; observedAt: number }[],
): { id: string; observedAt: number; offer: Offer }[] {
  return daily.map(({ observedAt, paise }) => {
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
