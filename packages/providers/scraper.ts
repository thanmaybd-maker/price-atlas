import { load, type CheerioAPI } from 'cheerio';
import { createHash } from 'node:crypto';
import { parseRetailUrl, type Store } from '../domain/index';

export class ScrapeError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
export type ScrapedProduct = {
  store: Store;
  externalId: string;
  url: string;
  title: string;
  imageUrl: string | null;
  itemPrice: number | null;
  shipping: number | null;
  charges: number;
  stock: boolean | null;
  condition: 'new' | 'used' | 'refurbished' | 'unknown';
  seller: string;
  attributes: Record<string, string>;
  observedAt: number;
  parserVersion: string;
};
export type ScraperConfig = {
  transport: 'direct' | 'scrapingbee' | 'brightdata';
  apiKey?: string;
  zone?: string;
  renderJs?: boolean;
  premiumProxy?: boolean;
  maxCredits?: number;
  timeoutMs?: number;
};
const MAX_BYTES = 4 * 1024 * 1024;
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
export function parseINR(value: string): number | null {
  const text = clean(value)
    .replace(/(?:₹|Rs\.?|INR)/gi, '')
    .trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text))
    return null;
  const [whole, fraction = ''] = text.replace(/,/g, '').split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise > 0 && paise <= 1_000_000_000_000 ? paise : null;
}
export function canonicalRetailUrl(value: string) {
  const identity = parseRetailUrl(value);
  const url = new URL(value);
  return {
    ...identity,
    url:
      identity.store === 'Amazon'
        ? `https://www.amazon.in/dp/${identity.externalId}`
        : `https://www.flipkart.com${url.pathname}${url.searchParams.has('pid') ? '?pid=' + identity.externalId : ''}`,
  };
}
function imageUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      /(?:^|\.)(?:media-amazon\.com|ssl-images-amazon\.com|amazon\.in|flixcart\.com|flipkart\.com)$/.test(
        url.hostname,
      )
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function firstText($: CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const value = clean($(selector).first().text());
    if (value) return value;
  }
  return '';
}
function price($: CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    for (const element of $(selector).toArray()) {
      if (
        $(element).closest(
          '[id*="carousel"], .a-carousel, [id*="sims"], [id*="recommend"], del, .a-text-price',
        ).length
      )
        continue;
      const parsed = parseINR($(element).attr('content') || $(element).text());
      if (parsed !== null) return parsed;
    }
  }
  return null;
}
export function parseProductHtml(
  html: string,
  inputUrl: string,
  observedAt = Date.now(),
): ScrapedProduct {
  const identity = canonicalRetailUrl(inputUrl);
  const $ = load(html);
  const pageTitle = $('title').text();
  if (
    $('#captchacharacters, form[action*="validateCaptcha"]').length ||
    /robot check|access denied|captcha|request blocked/i.test(pageTitle) ||
    /enter the characters you see below|sorry, we just need to make sure/i.test($('body').text())
  )
    throw new ScrapeError(
      'blocked',
      'The retailer returned a verification page. Configure a supported collection provider.',
    );
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) {
    try {
      const actual = parseRetailUrl(canonical);
      const sameFlipkartPath =
        identity.store === 'Flipkart' &&
        new URL(canonical).pathname === new URL(identity.url).pathname &&
        (actual.externalId.startsWith('ITM') || identity.externalId.startsWith('ITM'));
      if (
        actual.store !== identity.store ||
        (actual.externalId !== identity.externalId && !sameFlipkartPath)
      )
        throw new ScrapeError('identity_mismatch', 'The page represents a different product.');
    } catch (error) {
      if (error instanceof ScrapeError) throw error;
    }
  }
  const asin = $('input#ASIN, input[name="ASIN"]').first().attr('value');
  if (identity.store === 'Amazon' && asin && asin.toUpperCase() !== identity.externalId)
    throw new ScrapeError(
      'identity_mismatch',
      'The returned Amazon variant differs from the requested ASIN.',
    );
  let title =
    identity.store === 'Amazon'
      ? firstText($, ['#productTitle'])
      : firstText($, ['span[class*="VU-ZEz"]', 'span.B_NuCI', 'h1 span', 'h1']);
  if (!title || title.length < 3 || title.length > 1000)
    throw new ScrapeError(
      'parser_changed',
      'A reliable product title was not found. No observation was saved.',
    );
  // Only a Product object whose name matches the main heading may supply a
  // structured fallback. Never use AggregateOffer.lowPrice or related items.
  const structured: Record<string, any>[] = [];
  const truncatedHeading = identity.store === 'Flipkart' && /(?:\.{3}|…)\s*(?:more)?$/i.test(title);
  const headingPrefix = clean(title)
    .replace(/(?:\.{3}|…)\s*(?:more)?$/i, '')
    .toLowerCase();
  const visit = (value: any, depth = 0) => {
    if (depth > 8 || !value) return;
    if (Array.isArray(value)) for (const item of value) visit(item, depth + 1);
    else if (typeof value === 'object') {
      if (
        value['@type'] === 'Product' &&
        typeof value.name === 'string' &&
        (clean(title).toLowerCase().includes(clean(value.name).toLowerCase()) ||
          (truncatedHeading &&
            headingPrefix.length >= 30 &&
            clean(value.name).toLowerCase().startsWith(headingPrefix))) &&
        value.name.length > 5
      )
        structured.push(value);
      if (value['@graph']) visit(value['@graph'], depth + 1);
    }
  };
  $('script[type="application/ld+json"]').each((_, node) => {
    try {
      visit(JSON.parse($(node).text()));
    } catch {}
  });
  const productData = structured.length === 1 ? structured[0] : null;
  if (productData && truncatedHeading) title = clean(productData.name);
  if (
    productData?.sku &&
    !identity.externalId.startsWith('ITM') &&
    String(productData.sku).toUpperCase() !== identity.externalId
  )
    throw new ScrapeError(
      'identity_mismatch',
      'Structured product identity differs from the submitted listing.',
    );
  const offerData =
    productData?.offers &&
    !Array.isArray(productData.offers) &&
    productData.offers['@type'] === 'Offer'
      ? productData.offers
      : null;
  const structuredPrice =
    offerData?.priceCurrency === 'INR' ? parseINR(String(offerData.price)) : null;
  const selectedPrice =
    identity.store === 'Amazon'
      ? price($, [
          '#corePrice_desktop .a-price:not(.a-text-price) .a-offscreen',
          '#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen',
          '.priceToPay .a-offscreen',
          '.priceToPay',
          '#apex_desktop .a-price:not(.a-text-price) .a-offscreen',
          '.a-price:not(.a-text-price) .a-offscreen',
        ])
      : price($, ['h1 ~ div div[class*="Nx9bqj"]', 'div[class*="Nx9bqj"]', 'div._30jeq3']);
  if (selectedPrice !== null && structuredPrice !== null && selectedPrice !== structuredPrice)
    throw new ScrapeError(
      'price_conflict',
      'Rendered and structured prices disagree. No observation was saved.',
    );
  const itemPrice = selectedPrice ?? structuredPrice;
  const availability =
    identity.store === 'Amazon'
      ? firstText($, ['#availability', '#outOfStock'])
      : firstText($, ['[data-stock-status]', '[class*="availability"]']);
  const purchaseButtons =
    identity.store === 'Amazon'
      ? $('#add-to-cart-button, #buy-now-button').length > 0
      : $('button')
          .toArray()
          .some((e) => /add to cart|buy now/i.test($(e).text()) && !$(e).attr('disabled'));
  const negative =
    /currently unavailable|out of stock|sold out|not available|coming soon/i.test(availability) ||
    (identity.store === 'Flipkart' &&
      $('body *')
        .toArray()
        .some(
          (node) =>
            $(node).children().length === 0 &&
            !['script', 'style', 'noscript'].includes(node.tagName || '') &&
            /^(?:sold out|currently unavailable|out of stock)[.!]?$/i.test(clean($(node).text())),
        ));
  const stock =
    negative || /\/(?:OutOfStock|SoldOut|Discontinued)$/.test(offerData?.availability || '')
      ? false
      : /in stock|available for delivery/i.test(availability) ||
          purchaseButtons ||
          /\/InStock$/.test(offerData?.availability || '')
        ? true
        : null;
  if (itemPrice === null && stock !== false)
    throw new ScrapeError('price_missing', 'No unambiguous current INR price was found.');
  const delivery = firstText($, [
    '#deliveryBlockMessage',
    '#mir-layout-DELIVERY_BLOCK',
    '[data-delivery-charge]',
  ]);
  const rate = offerData?.shippingDetails?.shippingRate;
  const shipping =
    /free delivery|free shipping/i.test(delivery) ||
    (rate?.currency === 'INR' && [0, '0', '0.00'].includes(rate.value))
      ? 0
      : null;
  let charges = 0;
  if (identity.store === 'Flipkart')
    for (const node of $('*').toArray()) {
      if ($(node).children().length) continue;
      const fee = clean($(node).text()).match(
        /^\+\s*(₹[\d,.]+)\s+(?:Protect Promise Fee|Secured Packaging Fee|Platform Fee)$/i,
      );
      if (fee) {
        charges = parseINR(fee[1]) || 0;
        break;
      }
    }
  const seller = firstText($, [
    '#sellerProfileTriggerId',
    '#merchant-info',
    '#sellerName',
    '[data-seller-name]',
  ]).slice(0, 500);
  let image: string | null = null;
  if (identity.store === 'Amazon') {
    const node = $('#landingImage, #imgBlkFront').first();
    image = imageUrl(node.attr('data-old-hires'));
    if (!image) {
      try {
        const dynamic = JSON.parse(node.attr('data-a-dynamic-image') || '{}') as Record<
          string,
          number[]
        >;
        image =
          Object.entries(dynamic)
            .sort(
              (a, b) => (b[1]?.[0] || 0) * (b[1]?.[1] || 0) - (a[1]?.[0] || 0) * (a[1]?.[1] || 0),
            )
            .map(([url]) => imageUrl(url))
            .find(Boolean) || null;
      } catch {}
    }
    image ||= imageUrl(node.attr('src'));
  } else
    image = imageUrl(
      $('img[class*="DByuf4"], img._396cs4, img[class*="q6DClP"]').first().attr('src'),
    );
  image ||= imageUrl($('meta[property="og:image"]').attr('content'));
  image ||= imageUrl(Array.isArray(productData?.image) ? productData.image[0] : productData?.image);
  const attributes: Record<string, string> = {};
  $(
    identity.store === 'Amazon'
      ? 'table[id^="productDetails_techSpec_section_"] tr, #productDetails_detailBullets_sections1 tr, #productOverview_feature_div tr'
      : 'table tr',
  ).each((_, row) => {
    const cells = $(row).find('th,td');
    const key = clean(cells.first().text()).replace(/[:‎‏]/g, '').trim();
    const value = clean(cells.slice(1).text()).replace(/[‎‏]/g, '').trim();
    if (key && value && key.length < 100 && value.length < 500) attributes[key] = value;
  });
  if (identity.store === 'Amazon') {
    $('#detailBullets_feature_div li').each((_, item) => {
      const node = $(item),
        label = node.find('.a-text-bold').first();
      const key = clean(label.text()).replace(/[:‎‏]/g, '').trim();
      const value = clean(node.text().slice(label.text().length))
        .replace(/[‎‏]/g, '')
        .replace(/^\s*:\s*/, '')
        .trim();
      if (key && value && key.length < 100 && value.length < 500) attributes[key] = value;
    });
    const selectedColor = clean($('#variation_color_name .selection').first().text());
    if (selectedColor) attributes.Color = selectedColor;
  }
  if (identity.store === 'Flipkart')
    for (const node of $('div').toArray()) {
      if ($(node).children().length) continue;
      const label = clean($(node).text());
      if (
        ![
          'Brand',
          'Model Number',
          'Model ID',
          'Model Name',
          'Color',
          'RAM',
          'Internal Storage',
          'Connectivity',
          'Network Type',
          'Processor Type',
          'Display Size',
          'Resolution',
          'Refresh Rate',
          'Connectivity Technology',
          'Processor Name',
          'SSD Capacity',
          'Graphic Processor',
          'Screen Size',
          'Screen Resolution',
          'Wireless Type',
        ].includes(label)
      )
        continue;
      const value = clean($(node).siblings().text());
      if (value && value.length < 300) attributes[label] = value;
    }
  if (productData?.brand?.name && !attributes.Brand)
    attributes.Brand = String(productData.brand.name);
  const sonyModel = /\b(WH-[A-Z0-9-]+|WF-[A-Z0-9-]+)\b/i.exec(title)?.[1];
  if (/\bSony\b/i.test(title) && sonyModel) {
    attributes.Brand ||= 'Sony';
    attributes['Model Number'] ||= sonyModel.toUpperCase();
    if (/\bbluetooth\b/i.test(title)) attributes.Connectivity ||= 'Bluetooth';
    const colorKey = attributes.Color ? 'Color' : 'Colour';
    if (attributes[colorKey]?.toLowerCase().startsWith(sonyModel.toLowerCase() + ','))
      attributes[colorKey] = attributes[colorKey].slice(sonyModel.length + 1).trim();
  }
  const condition = /renewed|refurbished/i.test(title)
    ? 'refurbished'
    : /\bused\b/i.test(title)
      ? 'used'
      : purchaseButtons || /\/NewCondition$/.test(offerData?.itemCondition || '')
        ? 'new'
        : 'unknown';
  if (
    identity.store === 'Flipkart' &&
    identity.externalId.startsWith('ITM') &&
    /^[A-Z0-9]{8,30}$/i.test(productData?.sku || '')
  ) {
    identity.externalId = String(productData?.sku).toUpperCase();
    identity.url += `?pid=${identity.externalId}`;
  }
  return {
    ...identity,
    title: clean(title),
    imageUrl: image,
    itemPrice,
    shipping,
    charges,
    stock,
    condition,
    seller: seller || 'Not supplied',
    attributes,
    observedAt,
    parserVersion: 'retailer-html-v2',
  };
}
export function scraperConfig(): ScraperConfig {
  const transport =
    process.env.SCRAPER_PROVIDER ||
    (process.env.SCRAPINGBEE_API_KEY
      ? 'scrapingbee'
      : process.env.BRIGHTDATA_API_KEY
        ? 'brightdata'
        : 'direct');
  if (!['direct', 'scrapingbee', 'brightdata'].includes(transport))
    throw new ScrapeError('configuration', 'Unknown SCRAPER_PROVIDER.');
  return {
    transport: transport as ScraperConfig['transport'],
    apiKey:
      transport === 'scrapingbee'
        ? process.env.SCRAPINGBEE_API_KEY
        : process.env.BRIGHTDATA_API_KEY,
    zone: process.env.BRIGHTDATA_ZONE,
    renderJs: process.env.SCRAPER_RENDER_JS === 'true',
    premiumProxy: process.env.SCRAPER_PREMIUM_PROXY === 'true',
    maxCredits: Number(process.env.SCRAPER_MAX_CREDITS || 10),
    timeoutMs: 25000,
  };
}
async function boundedHtml(response: Response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new ScrapeError(
      response.status === 429 ? 'rate_limited' : response.status === 403 ? 'blocked' : 'http_error',
      `Collection returned HTTP ${response.status}.`,
      response.status === 429 || response.status >= 500,
    );
  }
  if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) {
    await response.body?.cancel();
    throw new ScrapeError('too_large', 'Retailer response exceeded the size limit.');
  }
  const type = response.headers.get('content-type') || '';
  if (type && !/html|text\/plain|octet-stream/i.test(type)) {
    await response.body?.cancel();
    throw new ScrapeError('content_type', 'Expected a retailer HTML page.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ScrapeError('empty', 'Retailer returned an empty response.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES)
        throw new ScrapeError('too_large', 'Retailer response exceeded the size limit.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}
export async function scrapeProduct(
  inputUrl: string,
  config = scraperConfig(),
  fetcher: typeof fetch = fetch,
): Promise<ScrapedProduct> {
  const identity = canonicalRetailUrl(inputUrl);
  const signal = AbortSignal.timeout(Math.min(config.timeoutMs || 25000, 55000));
  try {
    let response: Response;
    if (config.transport === 'scrapingbee') {
      if (!config.apiKey) throw new ScrapeError('configuration', 'SCRAPINGBEE_API_KEY is missing.');
      const endpoint = new URL('https://app.scrapingbee.com/api/v1');
      endpoint.searchParams.set('url', identity.url);
      endpoint.searchParams.set('render_js', String(!!config.renderJs));
      endpoint.searchParams.set('premium_proxy', String(!!config.premiumProxy));
      if (config.premiumProxy) endpoint.searchParams.set('country_code', 'in');
      endpoint.searchParams.set(
        'timeout',
        String(Math.max(1000, (config.timeoutMs || 25000) - 1000)),
      );
      response = await fetcher(endpoint, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal,
        redirect: 'error',
      });
    } else if (config.transport === 'brightdata') {
      if (!config.apiKey || !config.zone)
        throw new ScrapeError(
          'configuration',
          'Bright Data needs BRIGHTDATA_API_KEY and BRIGHTDATA_ZONE.',
        );
      response = await fetcher('https://api.brightdata.com/request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone: config.zone,
          url: identity.url,
          format: 'raw',
          country: 'in',
        }),
        signal,
        redirect: 'error',
      });
    } else {
      let url = identity.url;
      for (let redirects = 0; ; redirects++) {
        response = await fetcher(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-IN,en;q=0.9',
          },
          signal,
          redirect: 'manual',
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirects >= 2)
          throw new ScrapeError('redirect', 'Unsupported retailer redirect.');
        const next = new URL(location, url);
        const parsed = parseRetailUrl(next.href);
        if (parsed.store !== identity.store || parsed.externalId !== identity.externalId)
          throw new ScrapeError(
            'redirect',
            'Retailer redirect changed the product or destination.',
          );
        url = next.href;
      }
    }
    return parseProductHtml(await boundedHtml(response), identity.url);
  } catch (error) {
    if (error instanceof ScrapeError) throw error;
    throw new ScrapeError(
      'network',
      'Collection timed out or the retailer could not be reached.',
      true,
    );
  }
}
export const listingKey = (product: Pick<ScrapedProduct, 'store' | 'externalId'>) =>
  `${product.store.toLowerCase()}-${product.externalId.toLowerCase()}`;
export const observationKey = (listingId: string, run: string) =>
  createHash('sha256').update(`${listingId}:${run}`).digest('hex');
