// TinyFish Fetch (https://docs.tinyfish.ai/fetch-api): a real-browser page fetch that is free
// up to 1,000 URLs a day. Used as the first fallback when a store refuses our own request,
// before paid Firecrawl credits. It returns rendered text plus page metadata (not raw HTML),
// so the price comes from, in order: the page's own "product:price:amount" meta tag, an
// explicit "Discounted price ₹X" line, or the first rupee amount after the product title that
// is not an add-on fee, offer or EMI figure. Anything ambiguous yields no price.
import { canonicalRetailUrl, parseINR, type ScrapedProduct } from './scraper';
import { variantAttributes } from '../domain/variant-guard';
import { load } from 'cheerio';

export const tinyFishConfigured = () => Boolean(process.env.TINYFISH_API_KEY);

type FetchResult = {
  url: string;
  final_url?: string;
  title?: string;
  text?: string;
  page_metadata?: {
    og?: { title?: string; image?: string[] | string };
    other?: Record<string, string>;
  };
};

const NOT_PRICE =
  /(?:with|bank|offer|emi|\/m\b|x\s*\d+m|protect|fee|exchange|cashback|save|off\b|coupon|lowest price for you|buy at)/i;

/** The selling price from TinyFish markdown + metadata, in paise, or null when unsure. */
export function priceFromFetch(r: FetchResult): number | null {
  const meta = r.page_metadata?.other || {};
  if ((meta['product:price:currency'] || 'INR').toUpperCase() === 'INR') {
    const m = parseINR(meta['product:price:amount'] || meta['og:price:amount'] || '');
    if (m) return m;
  }
  const text = r.text || '';
  const discounted = text.match(/Discounted price\s*₹\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (discounted) return parseINR(discounted[1]);
  // After the H1 title, the first line that is only a rupee amount is the selling price on
  // Flipkart-style layouts (MRP is printed without ₹, add-ons start with "+").
  const start = Math.max(0, text.search(/^#\s/m));
  for (const line of text.slice(start).split('\n').slice(0, 120)) {
    const t = line.trim();
    if (/^₹\s?[\d,]+(?:\.\d{1,2})?$/.test(t)) return parseINR(t);
    if (/^\+?₹/.test(t) && NOT_PRICE.test(t)) continue;
  }
  return null;
}

export function stockFromFetch(text: string): boolean | null {
  if (/\b(?:sold out|out of stock|currently unavailable|notify me|coming soon)\b/i.test(text))
    return false;
  if (/\b(?:add to (?:bag|cart|basket)|buy now)\b/i.test(text)) return true;
  return null;
}

export function productFromFetch(inputUrl: string, r: FetchResult): ScrapedProduct {
  const identity = canonicalRetailUrl(inputUrl);
  const text = r.text || '';
  const h1 = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = (h1 || r.page_metadata?.og?.title || r.title || '').replace(/\s+/g, ' ').trim();
  const image = [r.page_metadata?.og?.image].flat().find((v) => typeof v === 'string') || null;
  const itemPrice = priceFromFetch(r);
  return {
    ...identity,
    title: title.slice(0, 500),
    imageUrl: image,
    itemPrice,
    shipping: null,
    charges: 0,
    stock: itemPrice === null ? null : stockFromFetch(text),
    condition: 'new',
    seller: text.match(/Sold by\s*:?\s*([^\n]{2,80})/i)?.[1]?.trim() || '',
    attributes: variantAttributes(title, { 'Fetch method': 'TinyFish fetch' }),
    observedAt: Date.now(),
    parserVersion: 'tinyfish-fetch-v1',
    status: itemPrice ? 'VERIFIED' : 'PARTIAL_UNVERIFIED',
  };
}

export async function fetchWithTinyFish(
  url: string,
  timeoutMs = 25000,
  f: typeof fetch = fetch,
): Promise<ScrapedProduct> {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) throw new Error('tinyfish_unconfigured');
  const res = await f('https://api.fetch.tinyfish.ai', {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urls: [url],
      format: 'markdown',
      page_metadata: true,
      ttl: 0,
      per_url_timeout_ms: timeoutMs,
    }),
    signal: AbortSignal.timeout(timeoutMs + 5000),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`tinyfish_http_${res.status}`);
  }
  const body = (await res.json()) as { results?: FetchResult[]; errors?: { error?: string }[] };
  const r = body.results?.[0];
  if (!r?.text) throw new Error(`tinyfish_${body.errors?.[0]?.error || 'empty'}`);
  // A redirect to another listing (or a search page) must never be read as this product.
  if (r.final_url) {
    let landed;
    try {
      landed = canonicalRetailUrl(r.final_url);
    } catch {
      throw new Error('tinyfish_redirected');
    }
    const asked = canonicalRetailUrl(url);
    if (landed.store !== asked.store || landed.externalId !== asked.externalId)
      throw new Error('tinyfish_redirected');
  }
  return productFromFetch(url, r);
}

/**
 * Product links from a retailer's own search results page through TinyFish (free tier), in
 * page order. The title comes from the link's own URL slug, never from neighbouring page
 * text, so a title can't drift onto another listing. The product page is still verified.
 */
export function parseTinyFishSearch(
  store: string,
  _text: string,
  links: string[],
  limit = 24,
): { title: string; url: string; store: string }[] {
  const seen = new Set<string>();
  const out: { title: string; url: string; store: string }[] = [];
  for (const raw of links) {
    let id;
    try {
      id = canonicalRetailUrl(raw);
    } catch {
      continue;
    }
    if (id.store !== store || seen.has(id.externalId)) continue;
    let path;
    try {
      path = new URL(raw).pathname;
    } catch {
      continue;
    }
    const slug = path
      .split('/')
      .map((part) => decodeURIComponent(part).replace(/\.html?$/i, ''))
      .filter((part) => /[a-z]{2}/i.test(part) && /[-_]/.test(part) && !/[=]|^ref[_=]/i.test(part))
      .sort((x, y) => y.length - x.length)[0];
    const title = (slug || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (title.length < 4) continue;
    seen.add(id.externalId);
    out.push({ title: title.slice(0, 300), url: id.url, store });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Priced Amazon search-result cards from the rendered results page. Each card carries its own
 * ASIN, title, image and the price Amazon prints on that card, so no value is matched across
 * cards. Cards without a printed price are skipped (they get a product-page check instead).
 */
export function amazonSearchCards(html: string, observedAt = Date.now()): ScrapedProduct[] {
  const $ = load(html);
  const out: ScrapedProduct[] = [];
  const seen = new Set<string>();
  $('[data-component-type="s-search-result"][data-asin]').each((_, e) => {
    const card = $(e);
    const asin = card.attr('data-asin') || '';
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) return;
    const headings = [
      ...new Set(
        card
          .find('h2')
          .toArray()
          .map((h) => $(h).text().replace(/\s+/g, ' ').trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => b.length - a.length);
    const name = headings[0] || '';
    const brand = headings
      .slice(1)
      .find((h) => h.length < 80 && !name.toLowerCase().includes(h.toLowerCase()));
    const title = (brand ? `${brand} ${name}` : name).slice(0, 500);
    const priceText = card.find('.a-price:not(.a-text-price) .a-offscreen').first().text();
    const itemPrice = parseINR(priceText);
    if (title.length < 4 || !itemPrice) return;
    seen.add(asin);
    const image = card.find('img.s-image').attr('src') || null;
    const identity = canonicalRetailUrl(`https://www.amazon.in/dp/${asin}`);
    out.push({
      ...identity,
      title,
      imageUrl: image && /^https:\/\//.test(image) ? image : null,
      itemPrice,
      shipping: null,
      charges: 0,
      stock: true,
      condition: 'new',
      seller: '',
      attributes: variantAttributes(title, { 'Fetch method': 'Amazon search results (TinyFish)' }),
      observedAt,
      parserVersion: 'amazon-search-card-v1',
      status: 'VERIFIED',
    });
  });
  return out;
}

/** A retailer's rendered search results page as HTML through TinyFish, or null. */
export async function tinyFishSearchHtml(
  searchUrl: string,
  timeoutMs = 20000,
  includeSelectors?: string[],
  f: typeof fetch = fetch,
): Promise<string | null> {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) return null;
  const res = await f('https://api.fetch.tinyfish.ai', {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urls: [searchUrl],
      format: 'html',
      ttl: 1800,
      per_url_timeout_ms: timeoutMs,
      ...(includeSelectors ? { include_selectors: includeSelectors } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs + 5000),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const body = (await res.json()) as { results?: { text?: string }[] };
  return body.results?.[0]?.text || null;
}

export async function tinyFishSearch(
  searchUrl: string,
  store: string,
  timeoutMs = 20000,
  f: typeof fetch = fetch,
) {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) return [];
  const res = await f('https://api.fetch.tinyfish.ai', {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urls: [searchUrl],
      format: 'markdown',
      links: true,
      exclude_selectors: ['header', 'footer', 'nav'],
      ttl: 1800,
      per_url_timeout_ms: timeoutMs,
    }),
    signal: AbortSignal.timeout(timeoutMs + 5000),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return [];
  }
  const body = (await res.json()) as { results?: { text?: string; links?: string[] }[] };
  const r = body.results?.[0];
  return r ? parseTinyFishSearch(store, r.text || '', r.links || []) : [];
}
