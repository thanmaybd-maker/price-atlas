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
import { parseQueryIntent, applyIntent } from '../domain/query-intent';
import { canonicalRetailUrl, scrapeSearchHtml, ScrapeError } from '../providers/scraper';
import {
  parseSearchHtml,
  duckDuckGoProducts,
  bingProducts,
  type SearchCandidate,
} from '../providers/search';
import { livePolicy } from '../providers/live';
import { reserveSource, fetchProductWithBudget } from './index';
import {
  amazonSearchCards,
  tinyFishConfigured,
  tinyFishSearch,
  tinyFishSearchHtml,
} from '../providers/tinyfish';
import type { ScrapedProduct } from '../providers/scraper';
import { STORE_NAMES, eligible, type Store } from '../domain/index';
import { retailers, storesForCategory, retailerSearchUrl } from '../domain/retailers';
import { categoryFor } from '../matching/index';
import { MAX_PAID_CREDITS_PER_REQUEST } from './credit-budget';
import { cachedAgentResearch } from './agent-research-cache';

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
      .update(`retailers-v7:${url ? 'url' : store}:${url || normalizeQuery(q)}`)
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
  const requestedStore = store === 'all' ? parseQueryIntent(value).store : store;
  const products =
    row.state === 'complete'
      ? (await Promise.all((data.productIds || []).map((id) => findProduct(id)))).filter(Boolean)
      : [];
  const current =
    row.state === 'complete'
      ? (await offers()).filter(
          (o) =>
            (data.productIds || []).includes(o.productId) &&
            (!requestedStore || o.store === requestedStore),
        )
      : [];
  return { state: row.state, ...data, products, offers: current, cached: true };
}
export async function discoverProducts(
  value: string,
  scope: Store | 'all' = 'all',
  options: { searchMore?: boolean; beforeNetwork?: () => Promise<void> } = {},
) {
  const { q, url, key } = lookupIdentity(value, scope);
  const intent = parseQueryIntent(q);
  const effectiveScope = scope === 'all' ? intent.store || scope : scope;
  const searchPhrase = intent.text || intent.category?.replace(/-/g, ' ') || q;
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
  let plannedStores: Store[] = [];
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
  // Priced search-result cards (Amazon), imported without a second page read.
  const searchCards = new Map<string, ScrapedProduct>();
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
      const currentOffers = await offers();
      const existing = applyIntent(await catalog(), currentOffers, intent, matchesQuery, {
        store: effectiveScope,
      }).map((row) => row.p);
      const scoped = existing.filter(
        (p) =>
          effectiveScope === 'all' ||
          p.attributes.Retailer === effectiveScope ||
          currentOffers.some((o) => o.productId === p.id && o.store === effectiveScope),
      );
      const inferredCategory = categoryFor(searchPhrase, {});
      plannedStores =
        effectiveScope === 'all'
          ? storesForCategory(
              inferredCategory !== 'other'
                ? inferredCategory
                : intent.category || scoped[0]?.category || 'other',
            )
          : [effectiveScope];
      data.searchLinks = plannedStores.map((store) => ({
        store,
        url: retailerSearchUrl(store, searchPhrase),
      }));
      data.productIds.push(...scoped.slice(0, 40).map((p) => p.id));
      const researched = await cachedAgentResearch(q).catch(() => null);
      if (effectiveScope === 'all')
        plannedStores = [
          ...new Set([...plannedStores, ...(researched?.candidates.map((c) => c.store) || [])]),
        ];
      const recordedStores = new Set(
        currentOffers
          .filter((o) => data.productIds.includes(o.productId) && eligible(o))
          .map((o) => o.store),
      );
      const uncheckedStores = plannedStores.filter(
        (store) =>
          options.searchMore ||
          // A thin catalog result still checks the stores: one recorded product must not
          // stop a search from finding the other models and retailers.
          scoped.length < 12 ||
          !recordedStores.has(store) ||
          Boolean(researched?.candidates.some((c) => c.store === store)),
      );
      for (const store of plannedStores.filter((store) => !uncheckedStores.includes(store)))
        data.sources.push({ store, method: 'recorded-catalog', status: 'complete' });
      if (scoped.length)
        data.message =
          'Showing recorded catalog matches and retailer check outcomes. Open a retailer link to verify checkout details.';
      if (uncheckedStores.length) {
        await beforeNetwork();
        await Promise.all(
          uncheckedStores.map(async (store) => {
            let candidates: SearchCandidate[] = [],
              method = 'direct';
            const agentLeads = researched?.candidates.filter((c) => c.store === store) || [];
            let blocked = false;
            try {
              if (!livePolicy(store).search)
                throw new ScrapeError('disabled', 'Search is disabled for this retailer.');
              try {
                if (agentLeads.length) {
                  candidates = agentLeads;
                  method = 'antigravity-research-cache';
                }
                // The store's own search page through TinyFish (free tier, real browser):
                // many listings per store instead of one or two.
                if (candidates.length < 6 && tinyFishConfigured()) {
                  const searchUrl = retailerSearchUrl(store, searchPhrase);
                  const wait = Math.max(6000, Math.min(28000, deadline - Date.now() - 15000));
                  let listed: SearchCandidate[] = [];
                  if (store === 'Amazon') {
                    // Amazon cards carry their own ASIN and printed price.
                    const html = await tinyFishSearchHtml(searchUrl, wait, [
                      '[data-component-type="s-search-result"]',
                    ]).catch(() => null);
                    if (html) {
                      try {
                        listed = parseSearchHtml(html, store, 30);
                      } catch {}
                      for (const card of amazonSearchCards(html)) searchCards.set(card.url, card);
                    }
                  } else
                    listed = (await tinyFishSearch(searchUrl, store, wait).catch(
                      () => [],
                    )) as SearchCandidate[];
                  if (listed.length) {
                    const known = new Set(candidates.map((c) => c.url));
                    candidates = [...candidates, ...listed.filter((c) => !known.has(c.url))];
                    method = agentLeads.length ? method : 'tinyfish-search';
                  }
                }
                if (!candidates.length && !retailers[store].discoveryFirst) {
                  await reserveSource(store, { transport: 'direct' });
                  candidates = parseSearchHtml(await scrapeSearchHtml(searchPhrase, store), store);
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
                  candidates = await duckDuckGoProducts(searchPhrase, store);
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
                candidates = await bingProducts(searchPhrase, store);
              }
              const words = normalizeQuery(searchPhrase)
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
                    score >= 0.6 ||
                    matchesQuery({ name: c.title, brand: '', subtitle: '' }, searchPhrase),
                )
                .sort((a, b) => b.score - a.score)
                .map(({ c }) => c);
              data.candidates.push(...relevant.slice(0, 12));
              let imported = false;
              let failure: unknown;
              // Priced result cards become products straight away; other listings are verified
              // on their product pages in parallel, so one search spans many products and stores.
              const exactCards = relevant.filter((c) => searchCards.has(c.url));
              // The retailer's own neighbouring results (other models, other brands it ranked
              // for this query) fill out the list so a model search also shows alternatives.
              const similar = candidates.filter(
                (c) => searchCards.has(c.url) && !relevant.includes(c),
              );
              const carded = [...exactCards, ...similar].slice(0, 24);
              const loose = new Set(similar.map((c) => c.url));
              const toVerify = relevant
                .filter((c) => !searchCards.has(c.url))
                .slice(0, effectiveScope === 'all' ? Math.max(0, 5 - carded.length) + 1 : 10);
              const keep = async (id: string) => {
                const p = await findProduct(id);
                return p &&
                  applyIntent([p], await offers(), intent, matchesQuery, {
                    store: effectiveScope,
                  }).length
                  ? id
                  : null;
              };
              const settled = await Promise.allSettled([
                ...carded.map(async (c) => {
                  const id = (
                    await importScraped(searchCards.get(c.url)!, `lookup-${randomUUID()}`)
                  ).productId;
                  if (!loose.has(c.url)) return keep(id);
                  const p = await findProduct(id);
                  return p &&
                    applyIntent([p], await offers(), { ...intent, text: '' }, () => true, {
                      store: effectiveScope,
                    }).length
                    ? id
                    : null;
                }),
                ...toVerify.map(async (selected) => {
                  if (Date.now() > deadline - 8000) return null;
                  return keep(await importUrl(selected.url));
                }),
              ]);
              for (const r of settled) {
                if (r.status === 'fulfilled' && r.value) {
                  data.productIds.push(r.value);
                  imported = true;
                } else if (r.status === 'rejected') failure = r.reason;
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
    if (url) {
      const { store } = canonicalRetailUrl(url);
      data.sources.push({
        store,
        method: 'product-page',
        status: error instanceof ScrapeError ? error.code : 'unavailable',
      });
    }
  }
  data.productIds = [...new Set(data.productIds)];
  for (const store of plannedStores)
    if (!data.sources.some((source) => source.store === store))
      data.sources.push({ store, method: 'not-started', status: 'not_checked' });
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
