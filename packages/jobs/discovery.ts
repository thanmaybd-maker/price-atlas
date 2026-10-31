import { backfillKeepaForUrl } from './keepa-backfill';
import { createHash, randomUUID } from 'node:crypto';
import {
  postgres,
  tx,
  catalog,
  findProduct,
  offers,
  importScraped,
  reusableListing,
} from '../database/postgres';
import { matchesQuery, normalizeQuery } from '../domain/search';
import { discoveryConflict } from '../domain/discovery-guard';
import { canonicalRetailUrl, scrapeSearchHtml, ScrapeError } from '../providers/scraper';
import {
  parseSearchHtml,
  duckDuckGoProducts,
  bingProducts,
  type SearchCandidate,
} from '../providers/search';
import { livePolicy } from '../providers/live';
import { reserveSource, fetchProductWithBudget } from './index';
import { STORE_NAMES, type Store } from '../domain/index';
import { retailers, storesForCategory, retailerSearchUrl } from '../domain/retailers';
import { categoryFor } from '../matching/index';
import { MAX_PAID_CREDITS_PER_REQUEST } from './credit-budget';

export type LookupData = {
  productIds: string[];
  candidates: SearchCandidate[];
  sources: { store: Store; method: string; status: string }[];
  message?: string;
  searchLinks?: { store: Store; url: string }[];
};
export function lookupIdentity(value: string, store: Store | 'all' = 'all') {
  const q = value.trim();
  if (q.length < 2 || q.length > 2000 || (!/^https?:\/\//i.test(q) && q.length > 160))
    throw new ScrapeError(
      'invalid_query',
      'Enter a product name (2–160 characters) or a supported product URL.',
    );
  let url: string | null = null;
  if (/^https?:\/\//i.test(q)) {
    try {
      url = canonicalRetailUrl(q).url;
    } catch {
      throw new ScrapeError(
        'invalid_query',
        `Use a direct HTTPS product URL from: ${STORE_NAMES.join(', ')}.`,
      );
    }
  }
  if (!url && normalizeQuery(q).length < 2)
    throw new ScrapeError('invalid_query', 'Enter a product name or model.');
  return {
    q,
    url,
    key: createHash('sha256')
      .update(`retailers-v5:${url ? 'url' : store}:${url || normalizeQuery(q)}`)
      .digest('hex'),
  };
}
export async function lookupStatus(value: string, store: Store | 'all' = 'all') {
  const { key } = lookupIdentity(value, store);
  const row = (
    await postgres().query(
      'SELECT state,data FROM atlas.search_cache WHERE query_key=$1 AND expires_at>$2',
      [key, Date.now()],
    )
  ).rows[0];
  if (!row) return null;
  const data = row.data as LookupData;
  const products =
    row.state === 'complete'
      ? (await Promise.all((data.productIds || []).map((id) => findProduct(id)))).filter(Boolean)
      : [];
  const current =
    row.state === 'complete'
      ? (await offers()).filter((o) => (data.productIds || []).includes(o.productId))
      : [];
  return { state: row.state, ...data, products, offers: current, cached: true };
}
export async function discoverProducts(
  value: string,
  scope: Store | 'all' = 'all',
  options: { searchMore?: boolean; beforeNetwork?: () => Promise<void> } = {},
) {
  const { q, url, key } = lookupIdentity(value, scope);
  const claimed = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`search:${key}`]);
    const prior = (
      await c.query('SELECT state FROM atlas.search_cache WHERE query_key=$1 AND expires_at>$2', [
        key,
        Date.now(),
      ])
    ).rows[0];
    if (prior && (!options.searchMore || prior.state === 'pending')) return false;
    await c.query(
      "INSERT INTO atlas.search_cache VALUES($1,'pending','{}'::jsonb,$2) ON CONFLICT(query_key) DO UPDATE SET state='pending',data='{}'::jsonb,expires_at=excluded.expires_at",
      [key, Date.now() + 90000],
    );
    return true;
  });
  if (!claimed) return lookupStatus(q, scope);
  const data: LookupData = { productIds: [], candidates: [], sources: [] };
  let networkAllowed = false;
  const beforeNetwork = async () => {
    if (networkAllowed) return;
    await options.beforeNetwork?.();
    networkAllowed = true;
  };
  let credits = 0;
  const maximumCredits = url
    ? Math.max(
        0,
        Math.min(MAX_PAID_CREDITS_PER_REQUEST, Number(process.env.LOOKUP_MAX_CREDITS || 10)),
      )
    : 0;
  const allowPaid = (cost: number) => {
    // Names and broad searches are always free. A direct supported URL is an
    // explicit request to verify that one listing, within the shared budgets.
    if (!url && cost > 0) return false;
    if (credits + cost > maximumCredits || !Number.isFinite(maximumCredits)) return false;
    credits += cost;
    return true;
  };
  const deadline = Date.now() + 45000;
  const importUrl = async (destination: string) => {
    const cached = await reusableListing(destination);
    if (cached && !options.searchMore) return cached.productId;
    await beforeNetwork();
    if (Date.now() > deadline - 5000)
      throw new ScrapeError(
        'lookup_timeout',
        'Lookup time limit reached. Try a direct product link.',
      );
    const scraped = await fetchProductWithBudget(
      destination,
      // A single pasted/selected product page gets time for a proxied fetch (Amazon via
      // Firecrawl often needs 15-25 s); broad searches keep the short limit.
      Math.min(destination === url ? 30000 : 10000, deadline - Date.now() - 1000),
      allowPaid,
    );
    const imported = await importScraped(scraped, `lookup-${randomUUID()}`);
    // New Amazon products get their real past prices at once (no-op without a Keepa key).
    await backfillKeepaForUrl(destination).catch(() => null);
    return imported.productId;
  };
  try {
    if (url) {
      const identity = canonicalRetailUrl(url);
      data.candidates.push({
        store: identity.store,
        url,
        title: 'Submitted product link · live price unverified',
      });
      data.productIds.push(await importUrl(url));
      data.sources.push({ store: identity.store, method: 'product-page', status: 'complete' });
    } else {
      const stores = scope === 'all' ? storesForCategory(categoryFor(q, {})) : [scope];
      data.searchLinks = stores.map((store) => ({ store, url: retailerSearchUrl(store, q) }));
      const existing = (await catalog()).filter((p) => matchesQuery(p, q));
      const currentOffers = scope === 'all' ? [] : await offers();
      const scoped = existing.filter(
        (p) =>
          scope === 'all' ||
          p.attributes.Retailer === scope ||
          currentOffers.some((o) => o.productId === p.id && o.store === scope),
      );
      data.productIds.push(...scoped.slice(0, 12).map((p) => p.id));
      if (scoped.length && !options.searchMore)
        data.message =
          'Showing recorded catalog matches. Open a direct retailer product URL to verify its latest details.';
      else {
        await beforeNetwork();
        await Promise.all(
          stores.map(async (store) => {
            let candidates: SearchCandidate[] = [],
              method = 'direct';
            let blocked = false;
            try {
              if (!livePolicy(store).search)
                throw new ScrapeError('disabled', 'Search is disabled for this retailer.');
              try {
                if (!retailers[store].discoveryFirst) {
                  await reserveSource(store, { transport: 'direct' });
                  candidates = parseSearchHtml(await scrapeSearchHtml(q, store), store);
                }
              } catch (e) {
                blocked = e instanceof ScrapeError && e.code === 'blocked';
                if (
                  e instanceof ScrapeError &&
                  ['daily_budget', 'monthly_budget', 'paused', 'rate_limited'].includes(e.code)
                )
                  throw e;
              }
              if (!candidates.length) {
                method = 'web-search';
                try {
                  await reserveSource(store, { transport: 'direct' });
                  candidates = await duckDuckGoProducts(q, store);
                } catch (e) {
                  blocked ||= e instanceof ScrapeError && e.code === 'blocked';
                  if (
                    e instanceof ScrapeError &&
                    ['daily_budget', 'monthly_budget', 'paused', 'rate_limited'].includes(e.code)
                  )
                    throw e;
                }
              }
              if (!candidates.length && Date.now() < deadline - 16000) {
                method = 'web-search-rss';
                await reserveSource(store, { transport: 'direct' });
                candidates = await bingProducts(q, store);
              }
              const words = normalizeQuery(q)
                .split(' ')
                .filter((w) => w.length > 2 && !['the', 'and', 'for', 'buy', 'price'].includes(w));
              const relevant = candidates
                .filter((c) => !discoveryConflict(c.title, q))
                .map((c) => ({
                  c,
                  score:
                    words.filter((w) => normalizeQuery(c.title).includes(w)).length /
                    Math.max(1, words.length),
                }))
                .filter(
                  ({ c, score }) =>
                    score >= 0.6 || matchesQuery({ name: c.title, brand: '', subtitle: '' }, q),
                )
                .sort((a, b) => b.score - a.score)
                .map(({ c }) => c);
              data.candidates.push(...relevant.slice(0, 6));
              let imported = false;
              let failure: unknown;
              for (const selected of relevant.slice(0, 2)) {
                try {
                  const id = await importUrl(selected.url);
                  const p = await findProduct(id);
                  if (p && matchesQuery(p, q)) {
                    data.productIds.push(id);
                    imported = true;
                    break;
                  }
                } catch (error) {
                  failure = error;
                  if (
                    error instanceof ScrapeError &&
                    [
                      'daily_budget',
                      'monthly_budget',
                      'rate_limited',
                      'lookup_timeout',
                      'lookup_budget',
                    ].includes(error.code)
                  )
                    break;
                }
              }
              data.sources.push({
                store,
                method,
                status: imported
                  ? 'complete'
                  : failure instanceof ScrapeError
                    ? failure.code
                    : blocked && !relevant.length
                      ? 'blocked'
                      : relevant.length
                        ? 'candidates_only'
                        : 'no_results',
              });
            } catch (error) {
              data.sources.push({
                store,
                method,
                status: error instanceof ScrapeError ? error.code : 'unavailable',
              });
            }
          }),
        );
      }
    }
  } catch (error) {
    data.message =
      error instanceof ScrapeError
        ? error.message
        : 'Product details could not be verified. Try the direct retailer product URL.';
  }
  data.productIds = [...new Set(data.productIds)];
  if (url && !data.sources.length) {
    const { store } = canonicalRetailUrl(url);
    data.sources.push({
      store,
      method: 'product-page',
      status: data.productIds.length ? 'complete' : 'unavailable',
    });
  }
  if (!data.productIds.length && !data.message)
    data.message = data.sources.some((s) => s.status === 'rate_limited')
      ? 'The stores are busy. Please try again in a minute, or paste a direct product URL.'
      : data.sources.some((s) => ['daily_budget', 'monthly_budget'].includes(s.status))
        ? 'The shared collection allowance has been reached. Recorded results and store search links remain available; collection resumes after the budget resets.'
        : 'No verified product details were available. Try a more specific model name or paste a supported retailer product URL.';
  await postgres().query(
    "UPDATE atlas.search_cache SET state='complete',data=$2,expires_at=$3 WHERE query_key=$1",
    [key, data, Date.now() + (data.productIds.length ? 6 * 3600000 : 120000)],
  );
  return { ...(await lookupStatus(q, scope)), cached: false };
}
