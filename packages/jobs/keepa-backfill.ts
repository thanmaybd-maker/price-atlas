// Fills an Amazon listing's past days from Keepa's amazon.in price history.
// Writes atlas.observations only (history), never current offers, rules or alerts, and
// never over a day that already has our own live check.
import { postgres } from '../database/postgres';
import { livePolicy } from '../providers/live';
import {
  dailyFromSeries,
  fetchKeepa,
  keepaConfigured,
  keepaObservations,
  KEEPA_SOURCE,
  unitScale,
} from '../providers/keepa';

const IST = 19800000;
const istDay = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);

export async function backfillKeepa(
  listingId: string,
  options: { days?: number; force?: boolean; f?: typeof fetch } = {},
) {
  if (!keepaConfigured()) return { listingId, inserted: 0, reason: 'unconfigured' };
  const policy = livePolicy('Amazon');
  if (!policy.history) return { listingId, inserted: 0, reason: 'history_disabled' };
  const db = postgres();
  const listing = (
    await db.query(
      "SELECT id,product_id,store,external_id,url FROM atlas.listings WHERE id=$1 AND match_state='accepted'",
      [listingId],
    )
  ).rows[0];
  if (!listing || listing.store !== 'Amazon')
    return { listingId, inserted: 0, reason: 'not_amazon' };
  if (!options.force) {
    const done = await db.query(
      "SELECT max(observed_at) AS last FROM atlas.observations WHERE listing_id=$1 AND data->>'source'=$2",
      [listingId, KEEPA_SOURCE],
    );
    // Already filled up to yesterday: nothing new to ask Keepa for.
    if (Number(done.rows[0]?.last) > Date.now() - 2 * 86400000)
      return { listingId, inserted: 0, reason: 'fresh' };
  }
  const k = await fetchKeepa(listing.external_id, options.f);
  if (!k.ok) return { listingId, inserted: 0, reason: k.reason };
  // Our latest live price for this listing anchors Keepa's unit.
  const live = (
    await db.query(
      "SELECT (data->>'itemPrice')::bigint AS p FROM atlas.observations WHERE listing_id=$1 AND coalesce(data->>'source','') NOT IN ('keepa','wayback') AND (data->>'itemPrice') IS NOT NULL ORDER BY observed_at DESC LIMIT 1",
      [listingId],
    )
  ).rows[0]?.p;
  const series = k.lowestNew.some((p) => p.paise) ? k.lowestNew : k.amazon;
  const latest = [...series].reverse().find((p) => p.paise)?.paise ?? null;
  const scale = unitScale(latest, live ? Number(live) : null);
  if (!scale) return { listingId, inserted: 0, reason: 'unit_mismatch' };
  const retention = Math.min(options.days ?? 30, policy.historyRetentionDays);
  const daily = dailyFromSeries(series, retention, Date.now(), scale);
  const own = new Set(
    (
      await db.query(
        "SELECT observed_at FROM atlas.observations WHERE listing_id=$1 AND coalesce(data->>'source','') NOT IN ('keepa','wayback')",
        [listingId],
      )
    ).rows.map((r) => istDay(Number(r.observed_at))),
  );
  let inserted = 0;
  for (const row of keepaObservations(
    { id: listing.id, productId: listing.product_id, url: listing.url },
    daily.filter((d) => !own.has(istDay(d.day))),
  )) {
    const r = await db.query(
      `INSERT INTO atlas.observations(id, product_id, listing_id, run_key, data, observed_at, expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [
        row.id,
        listing.product_id,
        listing.id,
        row.id,
        row.offer,
        row.observedAt,
        row.observedAt + retention * 86400000,
      ],
    );
    inserted += r.rowCount || 0;
  }
  return { listingId, inserted, reason: undefined, tokensLeft: k.tokensLeft };
}

/** Backfill by product URL; a no-op for other stores or without a Keepa key. */
export async function backfillKeepaForUrl(url: string) {
  if (!keepaConfigured() || !/amazon\.in/i.test(url)) return null;
  const asin = url.match(/\/dp\/([A-Z0-9]{10})/i)?.[1];
  if (!asin) return null;
  const row = (
    await postgres().query(
      "SELECT id FROM atlas.listings WHERE store='Amazon' AND upper(external_id)=upper($1) AND match_state='accepted' LIMIT 1",
      [asin],
    )
  ).rows[0];
  return row ? backfillKeepa(row.id) : null;
}
