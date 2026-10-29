// History-only writes of validated archive observations.
// Touches atlas.observations alone: never current_offers, listing schedules, rules,
// collection evaluations or notifications.
import { retailers } from '../domain/retailers';
import { istDay, ARCHIVE_SOURCE, type ArchiveObservation } from './wayback';

export type SqlClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};
export type WriteResult = {
  listingId: string;
  inserted: number;
  duplicates: number;
  skipped: Record<string, number>;
  error?: string;
};

/** Write one listing's observations in a single bounded transaction. */
export async function writeListingHistory(
  client: SqlClient,
  listingId: string,
  productId: string,
  observations: ArchiveObservation[],
): Promise<WriteResult> {
  const result: WriteResult = { listingId, inserted: 0, duplicates: 0, skipped: {} };
  const skip = (reason: string) => (result.skipped[reason] = (result.skipped[reason] || 0) + 1);
  if (observations.length > 400) throw new Error('too many observations for one listing');
  await client.query('BEGIN');
  try {
    const listing = (
      await client.query(
        'SELECT product_id, store, external_id, match_state FROM atlas.listings WHERE id=$1 FOR UPDATE',
        [listingId],
      )
    ).rows[0];
    if (!listing || listing.product_id !== productId || listing.match_state !== 'accepted') {
      await client.query('ROLLBACK');
      return {
        ...result,
        error: !listing
          ? 'listing_missing'
          : listing.product_id !== productId
            ? 'listing_moved'
            : 'listing_not_accepted',
      };
    }
    if (retailers[listing.store as keyof typeof retailers]?.international) {
      await client.query('ROLLBACK');
      return { ...result, error: 'cross_border_listing' };
    }
    // Days that already have our own (primary) observation keep only that evidence.
    const primaryDays = new Set(
      (
        await client.query(
          "SELECT observed_at FROM atlas.observations WHERE listing_id=$1 AND coalesce(data->>'source','')<>$2",
          [listingId, ARCHIVE_SOURCE],
        )
      ).rows.map((r) => istDay(Number(r.observed_at))),
    );
    for (const o of observations) {
      if (
        o.listingId !== listingId ||
        o.productId !== productId ||
        o.offer.store !== listing.store ||
        o.offer.currency !== 'INR' ||
        o.offer.alertsAllowed ||
        o.offer.displayAllowed ||
        o.offer.validUntil !== o.observedAt ||
        o.offer.source !== ARCHIVE_SOURCE
      ) {
        skip('not_history_only');
        continue;
      }
      if (primaryDays.has(istDay(o.observedAt))) {
        skip('primary_observation_exists');
        continue;
      }
      const r = await client.query(
        `INSERT INTO atlas.observations(id, product_id, listing_id, run_key, data, observed_at, expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [o.id, productId, listingId, o.runKey, o.offer, o.observedAt, o.expiresAt],
      );
      if (r.rowCount) result.inserted += r.rowCount;
      else result.duplicates++;
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
