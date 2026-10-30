// Gemini + Google Search grounding finds where an arbitrary product is sold in India.
//
// Gemini only locates candidate product pages. Nothing it says becomes a Price Atlas price:
// every URL must be a supported retailer product URL, and the page is then fetched and
// verified by the normal retailer pipeline before it is saved, compared, charted or alerted.
// The model's quoted price is shown only as "Gemini web search, not yet checked".
import { canonicalRetailUrl } from './scraper';
import type { Store } from '../domain/index';

export type GeminiCandidate = {
  title: string;
  store: Store;
  url: string;
  /** What the web search reported, in rupees, unverified. */
  quotedRupees: number | null;
};
export type GeminiDiscovery = {
  provider: 'gemini';
  available: boolean;
  query: string;
  candidates: GeminiCandidate[];
  /** Web pages Google Search grounding actually used, for attribution. */
  sources: { title: string; uri: string }[];
  reason?: 'unconfigured' | 'not_applicable' | 'error' | 'timeout' | 'limited' | 'none_found';
  detail?: string;
  cached?: boolean;
};

const MODELS = () =>
  (process.env.GEMINI_SEARCH_MODEL || 'gemini-flash-latest,gemini-flash-lite-latest')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
const TIMEOUT_MS = 12000;
const CACHE_TTL = 6 * 3600000;
const DAILY_CAP = () => Math.max(1, Number(process.env.GEMINI_SEARCH_DAILY_LIMIT) || 150);
const cache = new Map<string, { at: number; value: GeminiDiscovery }>();
let day = '';
let used = 0;

const prompt = (query: string) =>
  [
    'Use Google Search to find where this product is sold online in India right now.',
    `Product: ${JSON.stringify(query)}`,
    'Prefer these stores: amazon.in, flipkart.com, nykaa.com, myntra.com, croma.com,',
    'reliancedigital.in, ajio.com, meesho.com. Give the direct product page URL',
    '(for Amazon a /dp/ASIN link), never a search page, never a shortened link.',
    'Answer with JSON only, no prose: {"products":[{"title":"...","url":"https://...","price_inr":12345}]}',
    'Up to 6 items. Use null for price_inr when the page price is not stated. Do not guess URLs.',
  ].join('\n');

/** Keep only well-formed supported retailer product URLs, deduplicated by listing. */
export function acceptCandidates(raw: unknown): GeminiCandidate[] {
  const list = Array.isArray((raw as { products?: unknown })?.products)
    ? ((raw as { products: unknown[] }).products as Record<string, unknown>[])
    : [];
  const seen = new Set<string>();
  const out: GeminiCandidate[] = [];
  for (const item of list.slice(0, 12)) {
    if (!item || typeof item.url !== 'string' || typeof item.title !== 'string') continue;
    let id;
    try {
      id = canonicalRetailUrl(item.url.trim());
    } catch {
      continue;
    }
    const key = `${id.store}:${id.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const price = Number(item.price_inr);
    out.push({
      title: item.title.replace(/\s+/g, ' ').trim().slice(0, 200),
      store: id.store,
      url: id.url,
      quotedRupees: Number.isFinite(price) && price > 0 && price < 1e8 ? Math.round(price) : null,
    });
    if (out.length >= 6) break;
  }
  return out;
}

function parseJson(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function call(query: string, model: string, f: typeof fetch) {
  const res = await f(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY as string,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt(query) }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0, maxOutputTokens: 1200 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  const text = await res.text();
  return { ok: res.ok, status: res.status, text: text.slice(0, 40000) };
}

export async function discoverWithGemini(
  raw: string,
  f: typeof fetch = fetch,
): Promise<GeminiDiscovery> {
  const query = raw.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 160);
  const base: GeminiDiscovery = {
    provider: 'gemini',
    available: Boolean(process.env.GEMINI_API_KEY),
    query,
    candidates: [],
    sources: [],
  };
  if (!base.available) return { ...base, reason: 'unconfigured' };
  if (query.length < 2 || /^https?:\/\//i.test(query)) return { ...base, reason: 'not_applicable' };
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return { ...hit.value, cached: true };
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    used = 0;
  }
  if (used >= DAILY_CAP()) return { ...base, reason: 'limited' };
  used++;
  let value: GeminiDiscovery = { ...base, reason: 'error' };
  try {
    const models = MODELS();
    let out = await call(query, models[0], f);
    if (!out.ok && [400, 404, 429, 500, 503].includes(out.status) && models[1])
      out = await call(query, models[1], f);
    if (!out.ok) {
      let message = '';
      try {
        message = String(JSON.parse(out.text)?.error?.message || '');
      } catch {
        message = out.text;
      }
      value = { ...base, reason: 'error', detail: `HTTP ${out.status}: ${message.slice(0, 160)}` };
    } else {
      const body = JSON.parse(out.text);
      const cand = body?.candidates?.[0];
      const text = (cand?.content?.parts || [])
        .map((p: { text?: string }) => p.text || '')
        .join('\n');
      const sources = (cand?.groundingMetadata?.groundingChunks || [])
        .map((c: { web?: { title?: string; uri?: string } }) => c.web)
        .filter((w: unknown): w is { title: string; uri: string } =>
          Boolean(w && typeof (w as { uri?: unknown }).uri === 'string'),
        )
        .slice(0, 8)
        .map((w: { title?: string; uri: string }) => ({
          title: String(w.title || 'source'),
          uri: w.uri,
        }));
      const candidates = acceptCandidates(parseJson(text));
      value = {
        ...base,
        candidates,
        sources,
        reason: candidates.length ? undefined : 'none_found',
      };
    }
  } catch (error) {
    const name = (error as Error)?.name;
    value = {
      ...base,
      reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'error',
    };
  }
  if (value.reason !== 'error' && value.reason !== 'timeout')
    cache.set(key, { at: Date.now(), value });
  return value;
}

export function resetGeminiDiscoverForTests() {
  cache.clear();
  day = '';
  used = 0;
}
