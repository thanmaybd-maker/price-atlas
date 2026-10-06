import 'dotenv/config';
import { postgres, tx } from '../packages/database/postgres';
import { normalizedAttributes } from '../packages/matching/index';
import { livePolicy } from '../packages/providers/live';
try {
  const repaired = await tx(async (c) => {
    const rows = (
      await c.query(
        "SELECT p.id,p.data,l.store,l.evidence,l.last_success FROM atlas.products p JOIN LATERAL(SELECT * FROM atlas.listings WHERE product_id=p.id AND evidence<>'{}'::jsonb ORDER BY last_success DESC LIMIT 1) l ON true WHERE p.data->>'name'='Saved product · source data expired' FOR UPDATE OF p",
      )
    ).rows;
    let count = 0;
    for (const row of rows) {
      if (
        !row.evidence.title ||
        Number(row.last_success) <
          Date.now() - livePolicy(row.store).historyRetentionDays * 86400000
      )
        continue;
      const attrs = normalizedAttributes(row.evidence.attributes || {});
      await c.query('UPDATE atlas.products SET data=$2 WHERE id=$1', [
        row.id,
        {
          ...row.data,
          name: row.evidence.title,
          attributes: { ...attrs, Condition: row.evidence.condition || 'unknown' },
          brand: attrs.Brand || row.data.brand,
          color: attrs.Color || row.data.color,
          subtitle: attrs['Model Name'] || `${row.store} listing · last successful source details`,
          description:
            'Retained retailer metadata. Availability and current price require a fresh check.',
          ...(row.evidence.imageUrl ? { imageUrl: row.evidence.imageUrl } : {}),
        },
      ]);
      count++;
    }
    return count;
  });
  console.log(
    JSON.stringify({ repaired, pricesUnchanged: true, provenance: 'retained listing evidence' }),
  );
} finally {
  await postgres().end();
}
