// Price history from Internet Archive captures of supported retailer product pages.
//
// Dry run (default): probes the archive, lists captures, fetches each candidate raw
// capture from web.archive.org only, proves its capture time, parses it with the shared
// retailer parser and matches the stored listing's variant. Writes a JSON report and the
// validated observations to data/wayback/. Nothing is written to the database.
//
// Apply: writes only the observations in the reviewed data/wayback/validated.json, as
// history-only points (no current offers, alerts, rankings or notifications). It makes
// no archive requests.
//
//   pnpm backfill:wayback [--product=<id>] [--sample=books,calculators,phones,cosmetics]
//                         [--per=3] [--limit=20] [--days=30] [--max-captures=31]
//                         [--max-requests=500] [--index-only]
//   pnpm backfill:wayback --apply
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { postgres } from '../packages/database/postgres';
import { livePolicy } from '../packages/providers/live';
import { retailers } from '../packages/domain/retailers';
import type { Store } from '../packages/domain/index';
import { categoryFor } from '../packages/matching/index';
import {
  buildObservation,
  cdxDate,
  cdxKeys,
  classifyPage,
  istDay,
  matchArchived,
  validateCapture,
  type ArchiveObservation,
  type Capture,
  type ListingEvidence,
  type Window,
} from '../packages/archive/wayback';
import { ArchiveClient, probeArchive, replayCapture, USER_AGENT } from '../packages/archive/fetch';
import { writeListingHistory } from '../packages/archive/write';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const num = (name: string, def: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number(arg(name)) || def));
const APPLY = process.argv.includes('--apply');
const INDEX_ONLY = process.argv.includes('--index-only');
const DAYS = num('days', 30, 1, 30);
const LIMIT = num('limit', 20, 1, 200);
const PER = num('per', 3, 1, 20);
const MAX_CAPTURES = num('max-captures', 31, 1, 62);
const MAX_REQUESTS = num('max-requests', 500, 10, 3000);
const PRODUCT = arg('product');
const SAMPLE = (arg('sample') || '').split(',').filter(Boolean);
const OUT = 'data/wayback';
const VALIDATED = `${OUT}/validated.json`;

type ListingRow = {
  id: string;
  product_id: string;
  store: Store;
  url: string;
  external_id: string;
  evidence: ListingEvidence;
};
type ListingReport = {
  listingId: string;
  productId: string;
  store: Store;
  externalId: string;
  title: string;
  category: string;
  cdxRequests: number;
  cdxErrors: string[];
  indexedCaptures: number;
  candidateCaptures: number;
  candidateDays: number;
  fetched: number;
  parseable: number;
  accepted: number;
  acceptedIstDays: string[];
  reasons: Record<string, number>;
  sources: { day: string; price: number; archiveUrl: string; originalUrl: string }[];
};

const tally = (bag: Record<string, number>, key: string) => (bag[key] = (bag[key] || 0) + 1);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

async function apply() {
  let saved: { mode: string; generatedAt: string; observations: ArchiveObservation[] };
  try {
    saved = JSON.parse(await readFile(VALIDATED, 'utf8'));
  } catch {
    console.error(`No reviewed validated report at ${VALIDATED}. Run the validated dry run first.`);
    process.exitCode = 1;
    return;
  }
  const age = Date.now() - Date.parse(saved.generatedAt);
  if (saved.mode !== 'validated' || !(age >= 0 && age < 48 * 3600000)) {
    console.error(
      'The validated report is missing, index-only or older than 48 hours. Run the dry run again.',
    );
    process.exitCode = 1;
    return;
  }
  const byListing = new Map<string, ArchiveObservation[]>();
  for (const o of saved.observations)
    byListing.set(o.listingId, [...(byListing.get(o.listingId) || []), o]);
  const results = [];
  for (const [listingId, list] of byListing) {
    const client = await postgres().connect();
    try {
      results.push(await writeListingHistory(client, listingId, list[0].productId, list));
    } finally {
      client.release();
    }
  }
  const inserted = results.reduce((n, r) => n + r.inserted, 0);
  const duplicates = results.reduce((n, r) => n + r.duplicates, 0);
  await mkdir(OUT, { recursive: true });
  await writeFile(
    `${OUT}/apply-${stamp()}.json`,
    JSON.stringify(
      {
        appliedAt: new Date().toISOString(),
        from: saved.generatedAt,
        inserted,
        duplicates,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    `Saved ${inserted} archive observation(s) as history only; ${duplicates} already present.`,
  );
  for (const r of results)
    if (r.error || Object.keys(r.skipped).length)
      console.log(`  ${r.listingId}: ${r.error || ''} ${JSON.stringify(r.skipped)}`);
}

async function selectListings(): Promise<ListingRow[]> {
  const rows = (
    await postgres().query(
      `SELECT l.id, l.product_id, l.store, l.url, l.external_id, l.evidence,
              EXISTS(SELECT 1 FROM atlas.rules r WHERE r.product_id=l.product_id) AS targeted,
              EXISTS(SELECT 1 FROM atlas.watches w WHERE w.product_id=l.product_id) AS watched
         FROM atlas.listings l
        WHERE l.match_state='accepted'
        ORDER BY targeted DESC, watched DESC, l.last_success DESC NULLS LAST
        LIMIT 5000`,
    )
  ).rows as ListingRow[];
  const usable = rows.filter(
    (l) => !retailers[l.store]?.international && livePolicy(l.store).history,
  );
  const picked: ListingRow[] = [];
  const add = (l: ListingRow) => !picked.some((p) => p.id === l.id) && picked.push(l);
  if (PRODUCT) usable.filter((l) => l.product_id === PRODUCT).forEach(add);
  const cat = (l: ListingRow) => categoryFor(l.evidence.title || '', l.evidence.attributes || {});
  const groups: Record<string, (l: ListingRow) => boolean> = {
    books: (l) => cat(l) === 'books',
    calculators: (l) => /\bcalculator\b/i.test(l.evidence.title || ''),
    phones: (l) => cat(l) === 'phones',
    cosmetics: (l) => cat(l) === 'beauty',
  };
  for (const name of SAMPLE) {
    const test = groups[name];
    if (!test)
      throw new Error(`Unknown sample group "${name}". Use ${Object.keys(groups).join(', ')}.`);
    usable.filter(test).slice(0, PER).forEach(add);
  }
  if (!PRODUCT && !SAMPLE.length) usable.slice(0, LIMIT).forEach(add);
  return picked.slice(0, LIMIT + (PRODUCT ? 1 : 0) + SAMPLE.length * PER);
}

async function dryRun() {
  await mkdir(OUT, { recursive: true });
  const client = new ArchiveClient({ maxRequests: MAX_REQUESTS });
  const generatedAt = new Date().toISOString();
  const now = Date.now();
  const probe = await probeArchive(client, now);
  const base = {
    tool: 'scripts/backfill-wayback.ts',
    mode: INDEX_ONLY ? 'index-only' : 'validated',
    meaning: INDEX_ONLY
      ? 'Counts archive index entries (candidate captures). No archived page was fetched or priced.'
      : 'Counts captures whose archived retailer HTML was fetched, proven, parsed and matched to the exact listing.',
    generatedAt,
    userAgent: USER_AGENT,
    probe,
  };
  if (!probe.reachable) {
    const report = { ...base, stopped: 'archive_unreachable', listings: [] };
    await writeFile(`${OUT}/latest-report.json`, JSON.stringify(report, null, 2));
    await writeFile(`${OUT}/report-${stamp()}.json`, JSON.stringify(report, null, 2));
    console.error(
      `Internet Archive not reachable from this computer (${probe.result}${probe.status ? ` ${probe.status}` : ''}).` +
        ' Nothing was counted. Try again later or from another network.',
    );
    process.exitCode = 2;
    return;
  }
  console.log(`Archive reachable (${probe.result}, ${probe.elapsedMs} ms). Mode: ${base.mode}.`);
  const listings = await selectListings();
  const reports: ListingReport[] = [];
  const accepted: ArchiveObservation[] = [];
  const reasons: Record<string, number> = {};
  for (const l of listings) {
    const policy = livePolicy(l.store);
    const ident = { store: l.store, externalId: l.external_id };
    const w: Window = {
      from: now - DAYS * 86400000,
      to: now,
      now,
      retentionDays: policy.historyRetentionDays,
    };
    const r: ListingReport = {
      listingId: l.id,
      productId: l.product_id,
      store: l.store,
      externalId: l.external_id,
      title: (l.evidence.title || '').slice(0, 120),
      category: categoryFor(l.evidence.title || '', l.evidence.attributes || {}),
      cdxRequests: 0,
      cdxErrors: [],
      indexedCaptures: 0,
      candidateCaptures: 0,
      candidateDays: 0,
      fetched: 0,
      parseable: 0,
      accepted: 0,
      acceptedIstDays: [],
      reasons: {},
      sources: [],
    };
    const why = (k: string) => (tally(r.reasons, k), tally(reasons, k));
    const candidates = new Map<string, Capture>();
    for (const key of cdxKeys(l.store, l.url, l.external_id)) {
      r.cdxRequests++;
      const { fetch: f, cdx } = await client.cdx({
        url: key,
        matchType: 'prefix',
        from: cdxDate(w.from),
        to: cdxDate(w.to),
        fl: 'timestamp,original,statuscode,mimetype',
        filter: 'statuscode:200',
        limit: '300',
      });
      if (f.kind !== 'ok') {
        r.cdxErrors.push(f.kind === 'http' ? `http_${f.status}` : f.kind);
        continue;
      }
      if (cdx?.kind === 'malformed') {
        r.cdxErrors.push(`malformed: ${cdx.detail}`);
        continue;
      }
      if (cdx?.kind !== 'rows') continue;
      for (const row of cdx.rows) {
        r.indexedCaptures++;
        const v = validateCapture(row, ident, w);
        if (!v.ok) {
          why(v.reason);
          continue;
        }
        if (!candidates.has(v.capture.timestamp)) candidates.set(v.capture.timestamp, v.capture);
      }
    }
    r.candidateCaptures = candidates.size;
    r.candidateDays = new Set([...candidates.values()].map((c) => istDay(c.observedAt))).size;
    if (!INDEX_ONLY) {
      // Newest first; at most one accepted observation per India date.
      const days = new Map<string, ArchiveObservation>();
      const ordered = [...candidates.values()].sort((a, b) => b.observedAt - a.observedAt);
      let tried = 0;
      for (const c of ordered) {
        if (days.has(istDay(c.observedAt))) continue;
        if (tried++ >= MAX_CAPTURES) {
          why('capture_cap_reached');
          break;
        }
        const replay = await replayCapture(client, c, ident, w);
        if (!replay.ok) {
          why(replay.reason);
          if (replay.reason === 'fetch_budget_exhausted') break;
          continue;
        }
        r.fetched++;
        const page = classifyPage(replay.html, replay.capture, ident);
        if (page.kind !== 'parsed') {
          why(page.kind);
          continue;
        }
        r.parseable++;
        const match = matchArchived(l.evidence, page.page);
        if (match.decision !== 'accepted') {
          why(`variant_${match.decision}`);
          continue;
        }
        const day = istDay(replay.capture.observedAt);
        if (days.has(day)) continue;
        const o = buildObservation(
          { id: l.id, productId: l.product_id, store: l.store },
          replay.capture,
          page.page,
          match.checked,
          policy.historyRetentionDays,
        );
        days.set(day, o);
        r.sources.push({
          day,
          price: o.offer.itemPrice,
          archiveUrl: o.offer.evidence.archiveUrl,
          originalUrl: o.offer.evidence.originalUrl,
        });
      }
      r.accepted = days.size;
      r.acceptedIstDays = [...days.keys()].sort();
      accepted.push(...days.values());
    }
    reports.push(r);
    console.log(
      `  ${l.store.padEnd(10)} ${l.external_id.padEnd(16)} ${r.category.padEnd(13)} ` +
        `indexed ${String(r.indexedCaptures).padStart(3)}  candidate days ${String(r.candidateDays).padStart(2)}` +
        (INDEX_ONLY
          ? ''
          : `  fetched ${r.fetched}  parsed ${r.parseable}  price days ${r.accepted}`) +
        (r.cdxErrors.length ? `  cdx errors: ${r.cdxErrors.join(',')}` : ''),
    );
    if (client.requests >= MAX_REQUESTS) {
      tally(reasons, 'request_budget_reached');
      break;
    }
  }
  const sum = (k: keyof ListingReport) => reports.reduce((n, r) => n + (r[k] as number), 0);
  const totals = {
    listings: reports.length,
    cdxRequests: sum('cdxRequests'),
    indexedCaptures: sum('indexedCaptures'),
    candidateCaptures: sum('candidateCaptures'),
    candidateDays: sum('candidateDays'),
    fetchedSnapshots: sum('fetched'),
    parseableSnapshots: sum('parseable'),
    acceptedObservations: accepted.length,
    listingsWith7PriceDays: reports.filter((r) => r.accepted >= 7).length,
    archiveRequests: client.requests,
    requestOutcomes: client.outcomes,
  };
  const report = {
    ...base,
    range: { days: DAYS, from: new Date(now - DAYS * 86400000).toISOString(), to: generatedAt },
    totals,
    reasons,
    listings: reports,
  };
  const file = `${OUT}/report-${stamp()}.json`;
  await writeFile(file, JSON.stringify(report, null, 2));
  await writeFile(`${OUT}/latest-report.json`, JSON.stringify(report, null, 2));
  if (!INDEX_ONLY)
    await writeFile(
      VALIDATED,
      JSON.stringify(
        { mode: 'validated', generatedAt, report: file, observations: accepted },
        null,
        2,
      ),
    );
  console.log(`\nReport: ${file}`);
  console.log(base.meaning);
  console.log(
    `Listings ${totals.listings} | archive requests ${totals.archiveRequests} | indexed captures ${totals.indexedCaptures} | candidate days ${totals.candidateDays}` +
      (INDEX_ONLY
        ? ''
        : ` | fetched ${totals.fetchedSnapshots} | parseable ${totals.parseableSnapshots} | accepted price days ${totals.acceptedObservations}`),
  );
  if (Object.keys(reasons).length) console.log('Skip reasons:', JSON.stringify(reasons));
}

try {
  if (APPLY) await apply();
  else await dryRun();
} finally {
  // The pool exists only if the run reached the database.
  if (process.env.DATABASE_URL)
    await postgres()
      .end()
      .catch(() => {});
}
