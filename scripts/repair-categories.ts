import 'dotenv/config';
import { postgres } from '../packages/database/postgres';
import { categoryFor } from '../packages/matching/index';
import { isIsbn13 } from '../packages/domain/isbn';
try {
  const rows = (
    await postgres().query(
      'SELECT p.id,p.data, array_agg(l.external_id) AS identities FROM atlas.products p JOIN atlas.listings l ON l.product_id=p.id GROUP BY p.id',
    )
  ).rows;
  let changed = 0;
  for (const row of rows) {
    const attributes = { ...row.data.attributes };
    const isbn = row.identities.find(isIsbn13);
    if (isbn) {
      attributes.ISBN ||= isbn;
      attributes.GTIN ||= isbn;
    }
    const category = categoryFor(row.data.name, attributes);
    if (
      category === row.data.category &&
      JSON.stringify(attributes) === JSON.stringify(row.data.attributes)
    )
      continue;
    await postgres().query('UPDATE atlas.products SET data=$2 WHERE id=$1', [
      row.id,
      { ...row.data, attributes, category },
    ]);
    changed++;
  }
  console.log(JSON.stringify({ reviewed: rows.length, recategorized: changed }));
} finally {
  await postgres().end();
}
