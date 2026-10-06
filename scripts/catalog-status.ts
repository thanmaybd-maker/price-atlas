import 'dotenv/config';
import { postgres } from '../packages/database/postgres';
try {
  const db = postgres();
  console.log(
    JSON.stringify({
      catalog: (
        await db.query(
          'SELECT p.id,p.data,array_agg(l.store) stores FROM atlas.products p LEFT JOIN atlas.listings l ON l.product_id=p.id GROUP BY p.id ORDER BY p.created_at DESC',
        )
      ).rows.map((r) => ({
        id: r.id,
        name: r.data.name,
        attributes: r.data.attributes,
        stores: r.stores,
      })),
      accountStats: (
        await db.query(
          'SELECT count(*) users,(SELECT count(*) FROM atlas.telegram_connections WHERE enabled) telegram,(SELECT count(*) FROM atlas.rules) rules FROM atlas.users',
        )
      ).rows,
      queue: (await db.query('SELECT state,count(*) FROM atlas.jobs GROUP BY state')).rows,
      budget: (await db.query('SELECT * FROM atlas.collection_budget ORDER BY day DESC LIMIT 1'))
        .rows,
    }),
  );
} finally {
  await postgres().end();
}
