// Fill every accepted Amazon listing's last 90 days from Keepa's amazon.in history.
// Needs KEEPA_API_KEY and DATABASE_URL. Usage: pnpm backfill:keepa [--force]
import 'dotenv/config';
import { postgres } from '../packages/database/postgres';
import { backfillKeepa } from '../packages/jobs/keepa-backfill';

const force = process.argv.includes('--force');
const rows = (
  await postgres().query(
    "SELECT id FROM atlas.listings WHERE store='Amazon' AND match_state='accepted' ORDER BY id",
  )
).rows;
let total = 0;
for (const { id } of rows) {
  const r = await backfillKeepa(id, { force });
  total += r.inserted;
  console.log(JSON.stringify(r));
  if (r.reason === 'unconfigured') break;
  if (r.reason === 'http_429') await new Promise((ok) => setTimeout(ok, 60000));
}
console.log(JSON.stringify({ listings: rows.length, inserted: total }));
await postgres().end();
