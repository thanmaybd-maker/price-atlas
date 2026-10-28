import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  canonicalRetailUrl,
  listingKey,
  ScrapeError,
  scraperCreditCost,
} from '../packages/providers/scraper';
import { catalogSeeds } from '../packages/providers/catalog-seeds';
import { fetchProductWithBudget, SourceLimitError } from '../packages/jobs/index';
import { importScraped, postgres } from '../packages/database/postgres';

// Durable local frontier; no price data is generated from discovery links.
const stateFile = new URL('../data/catalog-frontier.json', import.meta.url);
const option = (name: string, fallback: number) => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? fallback : Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}`);
  return value;
};
const limit = option('--limit', 40),
  creditLimit = option('--credits', 100);
const discover = process.argv.includes('--discover');
const dryRun = process.argv.includes('--dry-run');
let imported = 0,
  attempted = 0,
  reservedCredits = 0,
  skipped = 0;
const frontier: string[] = [...catalogSeeds];
const seen = new Set<string>();
try {
  if (process.env.APP_MODE !== 'live') throw new Error('Catalog import requires APP_MODE=live.');
  try {
    frontier.push(...JSON.parse(await readFile(stateFile, 'utf8')));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const suppliedIndex = process.argv.indexOf('--file');
  if (suppliedIndex >= 0) {
    const supplied = JSON.parse(await readFile(process.argv[suppliedIndex + 1], 'utf8'));
    if (process.argv.includes('--file-only')) frontier.length = 0;
    frontier.unshift(...supplied);
  }
  const known = (await postgres().query('SELECT id,url,last_success FROM atlas.listings')).rows;
  if (!process.argv.includes('--file-only')) frontier.unshift(...known.map((r) => r.url));
  const fresh = new Set(
    known.filter((r) => Number(r.last_success) > Date.now() - 86400000).map((r) => r.id),
  );
  const freshPaths = new Set(
    known
      .filter((r) => Number(r.last_success) > Date.now() - 86400000)
      .map((r) => new URL(r.url).pathname),
  );
  const last = new Map<string, number>();
  for (let index = 0; index < frontier.length && attempted < limit; index++) {
    const identity = canonicalRetailUrl(frontier[index]);
    const key = listingKey(identity);
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      fresh.has(key) ||
      (identity.store === 'Flipkart' &&
        identity.externalId.startsWith('ITM') &&
        freshPaths.has(new URL(identity.url).pathname))
    ) {
      skipped++;
      continue;
    }
    const cost = scraperCreditCost();
    if (reservedCredits + cost > creditLimit) break;
    if (dryRun) {
      console.log(JSON.stringify({ event: 'planned', url: identity.url, cost }));
      attempted++;
      continue;
    }
    await sleep(Math.max(0, 31000 - (Date.now() - (last.get(identity.store) || 0))));
    try {
      last.set(identity.store, Date.now());
      attempted++;
      reservedCredits += cost;
      const scraped = await fetchProductWithBudget(identity.url);
      if (discover) frontier.push(...(scraped.relatedUrls || []));
      const result = await importScraped(scraped, `catalog-${randomUUID()}`);
      imported++;
      fresh.add(listingKey(scraped));
      freshPaths.add(new URL(scraped.url).pathname);
      console.log(
        JSON.stringify({
          event: 'catalog_import',
          store: scraped.store,
          title: scraped.title,
          productId: result.productId,
          price: scraped.itemPrice,
          stock: scraped.stock,
          condition: scraped.condition,
          observations: result.observations,
          attempted,
          reservedCredits,
        }),
      );
    } catch (error) {
      const code = error instanceof ScrapeError ? error.code : 'import_failed';
      console.log(
        JSON.stringify({ event: 'catalog_error', store: identity.store, url: identity.url, code }),
      );
      if (code === 'rate_limited' && error instanceof SourceLimitError) {
        seen.delete(key);
        index--;
        await sleep(60000);
      }
      if (
        [
          'daily_budget',
          'monthly_budget',
          'configuration',
          'provider_credits',
          'provider_auth',
        ].includes(code)
      )
        break;
    }
    if (discover) {
      await mkdir(new URL('../data/', import.meta.url), { recursive: true });
      await writeFile(stateFile, JSON.stringify([...new Set(frontier)].slice(0, 2000), null, 2));
    }
  }
  console.log(
    JSON.stringify({
      event: 'catalog_complete',
      imported,
      attempted,
      skipped,
      reservedCredits,
      remainingCandidates: frontier.length - seen.size,
      dryRun,
      counts: (
        await postgres().query(
          "SELECT (SELECT count(*) FROM atlas.products p WHERE EXISTS(SELECT 1 FROM atlas.listings l WHERE l.product_id=p.id AND l.match_state<>'rejected')) products,(SELECT count(*) FROM atlas.listings WHERE match_state<>'rejected') listings,(SELECT count(*) FROM atlas.observations) observations",
        )
      ).rows[0],
    }),
  );
} finally {
  await postgres().end();
}
