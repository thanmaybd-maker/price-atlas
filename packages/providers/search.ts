import { load } from 'cheerio';
import { canonicalRetailUrl, ScrapeError, boundedHtml } from './scraper';
import type { Store } from '../domain/index';
export type SearchCandidate = { title: string; url: string; store: Store };
export function parseSearchHtml(html: string, store: Store): SearchCandidate[] {
  const $ = load(html);
  if (
    $('#captchacharacters,form[action*="validateCaptcha"],#retry_btn').length ||
    /robot check|captcha|access denied/i.test($('title').text())
  )
    throw new ScrapeError('blocked', 'Retailer search is temporarily unavailable.');
  const results: SearchCandidate[] = [];
  const seen = new Set<string>();
  const add = (href: string, title: string) => {
    try {
      const identity = canonicalRetailUrl(
        new URL(href, store === 'Amazon' ? 'https://www.amazon.in' : 'https://www.flipkart.com')
          .href,
      );
      const clean = title.replace(/\s+/g, ' ').trim();
      if (identity.store !== store || seen.has(identity.externalId) || clean.length < 4) return;
      seen.add(identity.externalId);
      results.push({ url: identity.url, title: clean.slice(0, 300), store });
    } catch {}
  };
  if (store === 'Amazon')
    $('[data-component-type="s-search-result"][data-asin]').each((_, e) => {
      const card = $(e),
        asin = card.attr('data-asin') || '';
      if (/^[A-Z0-9]{10}$/.test(asin))
        add(
          `/dp/${asin}`,
          card
            .find('h2')
            .toArray()
            .map((e) => $(e).text().trim())
            .sort((a, b) => b.length - a.length)[0] ||
            card.find('a[href*="/dp/"]').attr('aria-label') ||
            '',
        );
    });
  else
    $('a[href*="/p/"]').each((_, e) => {
      const anchor = $(e);
      add(
        anchor.attr('href')!,
        anchor.attr('title') || anchor.find('img').attr('alt') || anchor.text(),
      );
    });
  return results.slice(0, 8);
}
export async function duckDuckGoProducts(
  query: string,
  store: Store,
  fetcher: typeof fetch = fetch,
): Promise<SearchCandidate[]> {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set(
    'q',
    `site:${store === 'Amazon' ? 'amazon.in/dp' : 'flipkart.com'} ${query} India`,
  );
  const response = await fetcher(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-IN,en;q=0.9' },
    signal: AbortSignal.timeout(7000),
    redirect: 'error',
  });
  const $ = load(await boundedHtml(response));
  const results: SearchCandidate[] = [],
    seen = new Set<string>();
  $('a.result__a').each((_, e) => {
    try {
      const anchor = $(e),
        link = new URL(anchor.attr('href')!, 'https://html.duckduckgo.com');
      const identity = canonicalRetailUrl(link.searchParams.get('uddg') || link.href);
      if (identity.store !== store || seen.has(identity.externalId)) return;
      seen.add(identity.externalId);
      results.push({
        store,
        url: identity.url,
        title: anchor.text().replace(/\s+/g, ' ').trim().slice(0, 300),
      });
    } catch {}
  });
  return results.slice(0, 8);
}
