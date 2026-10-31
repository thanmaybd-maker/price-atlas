// Product discovery through Firecrawl's web search, limited to supported Indian stores.
// Used when Gemini cannot search the web (no grounding quota) or does not know a product,
// e.g. a phone launched after its training. Results are only candidate links: each one is
// opened and verified by the normal retailer pipeline before any price is saved.
import { acceptCandidates, type GeminiCandidate } from '../providers/gemini-discover';
import { reserveSource } from './index';
import { availableCredentials } from './provider-pool';

const DOMAINS = [
  'amazon.in',
  'flipkart.com',
  'croma.com',
  'reliancedigital.in',
  'nykaa.com',
  'myntra.com',
  'ajio.com',
];

const cache = new Map<string, { at: number; candidates: GeminiCandidate[] }>();
export async function firecrawlProductSearch(
  query: string,
  f: typeof fetch = fetch,
): Promise<{ candidates: GeminiCandidate[]; reason?: string }> {
  const ck = query.toLowerCase().trim();
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 6 * 3600000 && f === fetch)
    return { candidates: hit.candidates };
  const key = (await availableCredentials(process.env.FIRECRAWL_API_KEY, 'firecrawl'))[0];
  if (!key) return { candidates: [], reason: 'unconfigured' };
  // One shared-budget unit per search (Firecrawl bills about 1 credit per 5 results).
  await reserveSource('Amazon', { transport: 'firecrawl', apiKey: key, maxCredits: 10 });
  const q = `${query} (${DOMAINS.map((d) => `site:${d}`).join(' OR ')})`;
  const res = await f('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, limit: 5, country: 'in', location: 'India' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    await res.body?.cancel();
    return { candidates: [], reason: `http_${res.status}` };
  }
  const body = (await res.json()) as {
    data?: { web?: { url?: string; title?: string }[] } | { url?: string; title?: string }[];
  };
  const rows = Array.isArray(body.data) ? body.data : body.data?.web || [];
  const candidates = acceptCandidates({
    products: rows.map((r) => ({ title: r.title || query, url: r.url, price_inr: null })),
  });
  if (cache.size > 300) cache.clear();
  cache.set(ck, { at: Date.now(), candidates });
  return { candidates };
}

/** Product cards from a Flipkart search results page (live listing prices, unverified). */
export function parseFlipkartSearch(html: string, limit = 6): GeminiCandidate[] {
  const seen = new Set<string>();
  const rows: { title: string; url: string; price_inr: number | null }[] = [];
  const re =
    /href="((?:https:\/\/www\.flipkart\.com)?\/([^"?/]+)\/p\/itm[a-z0-9]+)\?pid=([A-Z0-9]{16})/g;
  for (const m of html.matchAll(re)) {
    if (seen.has(m[3])) continue;
    seen.add(m[3]);
    const chunk = html.slice(m.index, m.index + 6000);
    const alt = chunk.match(/alt="([^"]{12,200})"/)?.[1];
    const text = chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const price = text.match(/₹\s?([\d,]{3,})/)?.[1];
    const href = m[1].startsWith('http') ? m[1] : `https://www.flipkart.com${m[1]}`;
    rows.push({
      title: alt
        ? alt.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        : m[2].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      url: `${href}?pid=${m[3]}`,
      price_inr: price ? Number(price.replace(/,/g, '')) : null,
    });
    if (rows.length >= limit * 2) break;
  }
  return acceptCandidates({ products: rows }).slice(0, limit);
}

const fkCache = new Map<string, { at: number; candidates: GeminiCandidate[] }>();
/** One Firecrawl credit: read Flipkart's own search page for any query, including budgets. */
export async function flipkartSearch(
  query: string,
  f: typeof fetch = fetch,
): Promise<GeminiCandidate[]> {
  const ck = query.toLowerCase().trim();
  const hit = fkCache.get(ck);
  if (hit && Date.now() - hit.at < 6 * 3600000 && f === fetch) return hit.candidates;
  const key = (await availableCredentials(process.env.FIRECRAWL_API_KEY, 'firecrawl'))[0];
  if (!key) return [];
  await reserveSource('Flipkart', { transport: 'firecrawl', apiKey: key, maxCredits: 10 });
  const res = await f('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`,
      formats: ['rawHtml'],
      proxy: 'basic',
      location: { country: 'IN' },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    await res.body?.cancel();
    return [];
  }
  const body = (await res.json()) as { data?: { rawHtml?: string } };
  const candidates = parseFlipkartSearch(body.data?.rawHtml || '');
  if (fkCache.size > 300) fkCache.clear();
  fkCache.set(ck, { at: Date.now(), candidates });
  return candidates;
}
