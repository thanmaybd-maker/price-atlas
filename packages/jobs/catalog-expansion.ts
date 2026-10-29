import { randomUUID } from 'node:crypto';
import { load } from 'cheerio';
import { postgres, importScraped } from '../database/postgres';
import { reserveSource, SourceLimitError } from './index';
import { boundedHtml, canonicalRetailUrl, scrapeProduct, ScrapeError } from '../providers/scraper';
import { nykaaFetch } from '../providers/nykaa-http';

export const catalogSections = [
  { path: '/makeup/lips/lipstick/c/249', priority: 0 },
  { path: '/makeup/c/12', priority: 1 },
  { path: '/skin/c/8377', priority: 2 },
];
export function parseCatalogPage(html: string, page: number) {
  const $ = load(html);
  let listing: any;
  for (const node of $('script:not([src])').toArray()) {
    const script = $(node).text().trim();
    if (!/^window\.__PRELOADED_STATE__\s*=/.test(script)) continue;
    try {
      const state = JSON.parse(
        script.replace(/^window\.__PRELOADED_STATE__\s*=\s*/, '').replace(/;\s*$/, ''),
      );
      if (Number(state.categoryListing?.pageNumber) === page)
        listing = state.categoryListing.listingData;
    } catch {}
  }
  if (!listing || !Array.isArray(listing.products))
    throw new ScrapeError('parser_changed', 'No verified catalog page state was found.');
  const found = new Map<string, { id: string; url: string; name: string }>();
  for (const product of listing.products) {
    if (
      typeof product.slug !== 'string' ||
      typeof product.name !== 'string' ||
      product.name.length < 4
    )
      continue;
    try {
      const identity = canonicalRetailUrl(new URL(product.slug, 'https://www.nykaa.com').href);
      if (identity.store !== 'Nykaa') continue;
      const url = new URL(identity.url);
      url.search = '';
      const id = url.pathname.match(/\/p\/(\d+)/)?.[1];
      if (!id || (product.parentId && String(product.parentId) !== id)) continue;
      found.set(id, { id, url: url.href, name: product.name.slice(0, 1000) });
    } catch {}
  }
  return {
    products: [...found.values()],
    total: Number(listing.totalFound) || 0,
    rawCount: listing.products.length,
  };
}
export async function startCatalogExpansion(target = 2500) {
  if (!Number.isSafeInteger(target) || target < 1 || target > 10000)
    throw new Error('Invalid catalog target');
  await postgres().query(
    "INSERT INTO atlas.catalog_expansion(id,enabled,target,updated_at) VALUES('main',true,$1,$2) ON CONFLICT(id) DO UPDATE SET enabled=true,target=excluded.target,updated_at=excluded.updated_at",
    [target, Date.now()],
  );
  for (const section of catalogSections)
    await postgres().query(
      'INSERT INTO atlas.catalog_pages(path,priority) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [section.path, section.priority],
    );
}
export async function catalogExpansionStatus() {
  const config = (
    await postgres().query(
      "SELECT enabled,target,blocked_until,last_error FROM atlas.catalog_expansion WHERE id='main'",
    )
  ).rows[0];
  const counts = (
    await postgres().query(
      'SELECT state,count(*)::integer AS count FROM atlas.catalog_frontier GROUP BY state',
    )
  ).rows;
  const next = (
    await postgres().query(
      "SELECT min(at) AS at FROM (SELECT min(available_at) AS at FROM atlas.catalog_frontier WHERE state='pending' UNION ALL SELECT min(updated_at) AS at FROM atlas.catalog_pages WHERE NOT exhausted) pending",
    )
  ).rows[0];
  return {
    ...config,
    nextAttemptAt: Math.max(Number(config?.blocked_until || 0), Number(next?.at || 0)),
    counts: Object.fromEntries(counts.map((r) => [r.state, r.count])),
  };
}
export async function runCatalogExpansionStep(fetcher: typeof fetch = nykaaFetch) {
  const now = Date.now();
  const settings = (
    await postgres().query(
      "UPDATE atlas.catalog_expansion SET lease_until=$1 WHERE id='main' AND enabled AND lease_until<$2 AND blocked_until<$2 RETURNING target",
      [now + 120000, now],
    )
  ).rows[0];
  if (!settings) return { event: 'catalog_idle' };
  let candidate: string | undefined,
    pagePath: string | undefined,
    successful = false;
  try {
    const count = Number(
      (
        await postgres().query(
          "SELECT count(*) AS count FROM atlas.catalog_frontier WHERE state='verified'",
        )
      ).rows[0].count,
    );
    if (count >= settings.target) {
      await postgres().query(
        "UPDATE atlas.catalog_expansion SET enabled=false,last_error=NULL,updated_at=$1 WHERE id='main'",
        [now],
      );
      successful = true;
      return { event: 'catalog_target_reached', verified: count, target: settings.target };
    }
    await postgres().query(
      "UPDATE atlas.catalog_frontier SET state='pending' WHERE state='collecting' AND lease_until<$1",
      [now],
    );
    const pending = Number(
      (
        await postgres().query(
          "SELECT count(*) AS count FROM atlas.catalog_frontier WHERE state='pending' AND available_at<=$1",
          [now],
        )
      ).rows[0].count,
    );
    const page = (
      await postgres().query(
        'SELECT * FROM atlas.catalog_pages WHERE NOT exhausted AND updated_at<=$1 ORDER BY updated_at,priority LIMIT 1',
        [now],
      )
    ).rows[0];
    if (pending < 20 && page) {
      pagePath = page.path;
      await reserveSource('Nykaa', { transport: 'direct' });
      const url = new URL(page.path, 'https://www.nykaa.com');
      if (page.next_page > 1) url.searchParams.set('page_no', String(page.next_page));
      const html = await boundedHtml(
        await fetcher(url, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-IN,en;q=0.9' },
          signal: AbortSignal.timeout(12000),
          redirect: 'error',
        }),
      );
      const parsed = parseCatalogPage(html, page.next_page);
      for (const product of parsed.products)
        await postgres().query(
          'INSERT INTO atlas.catalog_frontier(id,url,name,priority,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',
          [product.id, product.url, product.name, page.priority, now],
        );
      const exhausted = parsed.rawCount === 0 || page.next_page * 20 >= parsed.total;
      await postgres().query(
        'UPDATE atlas.catalog_pages SET next_page=next_page+1,exhausted=$2,updated_at=$3 WHERE path=$1',
        [page.path, exhausted, now],
      );
      successful = true;
      return {
        event: 'catalog_discovered',
        section: page.path,
        page: page.next_page,
        candidates: parsed.products.length,
        verified: count,
      };
    }
    const row = (
      await postgres().query(
        "UPDATE atlas.catalog_frontier SET state='collecting',lease_until=$1,attempts=attempts+1 WHERE id=(SELECT id FROM atlas.catalog_frontier WHERE state='pending' AND available_at<=$2 ORDER BY priority,updated_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *",
        [now + 120000, now],
      )
    ).rows[0];
    if (!row) return { event: 'catalog_waiting', verified: count };
    candidate = row.id;
    const known = (
      await postgres().query(
        "SELECT product_id FROM atlas.listings WHERE store='Nykaa' AND split_part(url,'?',1)=$1 AND evidence<>'{}'::jsonb AND evidence->'attributes'->>'Verification status' IS DISTINCT FROM 'PARTIAL_UNVERIFIED' LIMIT 1",
        [row.url],
      )
    ).rows[0];
    let productId = known?.product_id;
    if (!productId) {
      await reserveSource('Nykaa', { transport: 'direct' });
      const product = await scrapeProduct(
        row.url,
        { transport: 'direct', timeoutMs: 12000 },
        fetcher,
      );
      if (product.attributes['Base product ID'] !== row.id)
        throw new ScrapeError('identity_mismatch', 'Catalog parent identity changed.');
      if (product.status === 'PARTIAL_UNVERIFIED')
        throw new ScrapeError(
          'price_missing',
          'Partial metadata does not count as a verified catalog product.',
        );
      const result = await importScraped(product, `expansion-${randomUUID()}`, {
        catalogIntervalMinutes: 10080,
      });
      productId = result.productId;
    }
    await postgres().query(
      "UPDATE atlas.catalog_frontier SET state='verified',product_id=$2,last_error=NULL,updated_at=$3 WHERE id=$1",
      [row.id, productId, Date.now()],
    );
    successful = true;
    return { event: 'catalog_verified', productId, verified: count + 1, target: settings.target };
  } catch (error) {
    const code = error instanceof ScrapeError ? error.code : 'catalog_error';
    const deferred = error instanceof SourceLimitError;
    const delay =
      code === 'daily_budget'
        ? 86400000 - (Date.now() % 86400000) + 60000
        : code === 'rate_limited'
          ? 65000
          : 86400000;
    if (candidate)
      await postgres().query(
        "UPDATE atlas.catalog_frontier SET state='pending',available_at=$2,last_error=$3,attempts=attempts-$4 WHERE id=$1",
        [candidate, Date.now() + delay, code, deferred ? 1 : 0],
      );
    if (pagePath && !deferred)
      await postgres().query('UPDATE atlas.catalog_pages SET updated_at=$2 WHERE path=$1', [
        pagePath,
        Date.now() + delay,
      ]);
    await postgres().query(
      "UPDATE atlas.catalog_expansion SET last_error=$1,blocked_until=$2,updated_at=$3 WHERE id='main'",
      [code, deferred ? Date.now() + delay : 0, Date.now()],
    );
    return { event: deferred ? 'catalog_budget_pause' : 'catalog_unavailable', code };
  } finally {
    await postgres().query(
      "UPDATE atlas.catalog_expansion SET lease_until=0,last_error=CASE WHEN $2 THEN NULL ELSE last_error END WHERE id='main' AND lease_until=$1",
      [now + 120000, successful],
    );
  }
}
