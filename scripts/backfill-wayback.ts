// Backfill price history from the Internet Archive's Wayback Machine.
//
// Every point this writes is a real, dated copy of the retailer's own product page that the
// Internet Archive captured. The archive link is kept on the observation as its evidence, the
// capture time is the observation time, and these points are history only: they are never
// shown as a current price and never trigger alerts.
//
//   pnpm backfill:wayback              dry run: reports how many days the archive holds
//   pnpm backfill:wayback --apply      writes the archived observations
//   options: --days=30  --limit=60  --product=<product id>
import 'dotenv/config';
import { postgres } from '../packages/database/postgres';
import { parseProductHtml } from '../packages/providers/scraper';
import { livePolicy } from '../packages/providers/live';
import { retailers } from '../packages/domain/retailers';
import type { Offer, Store } from '../packages/domain/index';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const APPLY = process.argv.includes('--apply');
const DAYS = Math.min(90, Math.max(1, Number(arg('days')) || 30));
const LIMIT = Math.min(500, Math.max(1, Number(arg('limit')) || 60));
const ONLY = arg('product');
const UA = 'PriceAtlas-history-backfill/1.0 (student project; contact via repository)';
// The archive asks API users to be gentle: one request at a time, with a pause between them.
const PAUSE_MS = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
const captureTime = (ts: string) =>
  Date.UTC(
    +ts.slice(0, 4),
    +ts.slice(4, 6) - 1,
    +ts.slice(6, 8),
    +ts.slice(8, 10),
    +ts.slice(10, 12),
    +ts.slice(12, 14),
  );

async function get(url: string, tries = 3): Promise<Response | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(5000 * (i + 1));
        continue;
      }
      return res;
    } catch {
      await sleep(3000 * (i + 1));
    }
  }
  return null;
}

// URL prefixes the archive may have stored for this listing
function keys(store: Store, url: string, externalId: string) {
  const u = new URL(url);
  const bare = `${u.hostname.replace(/^www\./, '')}${u.pathname}`.replace(/\/$/, '');
  const out = new Set([bare]);
  if (store === 'Amazon') out.add(`amazon.in/dp/${externalId}`);
  return [...out];
}

type Capture = { ts: string; original: string };
async function captures(prefix: string, from: number, to: number): Promise<Capture[]> {
  const q = new URLSearchParams({
    url: prefix,
    matchType: 'prefix',
    from: ymd(from),
    to: ymd(to),
    output: 'json',
    fl: 'timestamp,original,statuscode,mimetype',
    filter: 'statuscode:200',
    collapse: 'timestamp:8', // at most one capture per day
    limit: '120',
  });
  const res = await get(`https://web.archive.org/cdx/search/cdx?${q}`);
  if (!res?.ok) return [];
  const rows = (await res.json().catch(() => [])) as string[][];
  return rows
    .slice(1)
    .filter((r) => !r[3] || r[3].includes('html'))
    .map((r) => ({ ts: r[0], original: r[1] }));
}

const listings = (
  await postgres().query(
    `SELECT l.id, l.product_id, l.store, l.url, l.external_id,
            EXISTS(SELECT 1 FROM atlas.rules r WHERE r.product_id=l.product_id) AS targeted,
            EXISTS(SELECT 1 FROM atlas.watches w WHERE w.product_id=l.product_id) AS watched
       FROM atlas.listings l
      WHERE l.match_state='accepted' ${ONLY ? 'AND l.product_id=$2' : ''}
      ORDER BY targeted DESC, watched DESC, l.last_success DESC NULLS LAST
      LIMIT $1`,
    ONLY ? [LIMIT, ONLY] : [LIMIT],
  )
).rows as {
  id: string;
  product_id: string;
  store: Store;
  url: string;
  external_id: string;
}[];

const to = Date.now();
const from = to - DAYS * 86400000;
let written = 0;
let found = 0;
const perProductDays = new Map<string, Set<string>>();
console.log(
  `${APPLY ? 'Backfilling' : 'Dry run over'} ${listings.length} listings, last ${DAYS} days, from the Internet Archive.`,
);

for (const l of listings) {
  const policy = livePolicy(l.store);
  if (!policy.history || retailers[l.store]?.international) continue;
  const seen = new Map<string, Capture>();
  for (const prefix of keys(l.store, l.url, l.external_id)) {
    for (const c of await captures(prefix, from, to)) {
      const day = c.ts.slice(0, 8);
      if (!seen.has(day)) seen.set(day, c);
    }
    await sleep(PAUSE_MS);
  }
  const days = [...seen.values()];
  found += days.length;
  console.log(`  ${l.store.padEnd(16)} ${l.external_id.padEnd(22)} ${days.length} archived day(s)`);
  if (!APPLY) {
    if (days.length) {
      const set = perProductDays.get(l.product_id) || new Set<string>();
      days.forEach((d) => set.add(d.ts.slice(0, 8)));
      perProductDays.set(l.product_id, set);
    }
    continue;
  }
  for (const c of days) {
    const archived = `https://web.archive.org/web/${c.ts}id_/${c.original}`;
    const evidence = `https://web.archive.org/web/${c.ts}/${c.original}`;
    const res = await get(archived);
    await sleep(PAUSE_MS);
    if (!res?.ok) continue;
    const html = await res.text();
    const observedAt = captureTime(c.ts);
    let scraped;
    try {
      scraped = parseProductHtml(html, c.original, observedAt);
    } catch {
      continue; // blocked or unreadable snapshot: skip it, never guess
    }
    // the snapshot must be this exact listing with a stated price
    if (scraped.externalId !== l.external_id || scraped.itemPrice === null) continue;
    const offer: Offer & { source: string; evidenceUrl: string } = {
      id: `wayback:${l.id}:${c.ts}`,
      productId: l.product_id,
      store: l.store,
      itemPrice: scraped.itemPrice,
      shipping: scraped.shipping,
      charges: scraped.charges,
      discount: 0,
      currency: 'INR',
      stock: scraped.stock === true,
      accepted: true,
      condition: scraped.condition,
      observedAt,
      validUntil: observedAt, // history only: never current
      historyAllowed: true,
      alertsAllowed: false,
      displayAllowed: false,
      seller: scraped.seller,
      context: 'Internet Archive snapshot',
      purchaseUrl: evidence,
      source: 'wayback',
      evidenceUrl: evidence,
    };
    const inserted = await postgres().query(
      'INSERT INTO atlas.observations VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
      [
        offer.id,
        l.product_id,
        l.id,
        `wayback-${c.ts}`,
        offer,
        observedAt,
        observedAt + policy.historyRetentionDays * 86400000,
      ],
    );
    written += inserted.rowCount || 0;
  }
}

if (!APPLY) {
  const counts = [...perProductDays.values()].map((s) => s.size).sort((a, b) => b - a);
  console.log(
    `\n${found} archived product-page day(s) across ${perProductDays.size} product(s).` +
      `\nProducts with 7+ days: ${counts.filter((n) => n >= 7).length}, 14+ days: ${counts.filter((n) => n >= 14).length}.` +
      `\nRun again with --apply to save them.`,
  );
} else console.log(`\nSaved ${written} archived observation(s).`);
await postgres().end();
