import type { CheerioAPI } from 'cheerio';
import { parseRetailUrl } from '../domain/index';
import { retailers } from '../domain/retailers';

// Data only: bounded JSON traversal, never evaluation of retailer scripts.
export function universalProduct($: CheerioAPI, url: string): Record<string, any> | null {
  const identity = parseRetailUrl(url);
  const same = (value: unknown) => {
    if (typeof value !== 'string') return false;
    try {
      const p = parseRetailUrl(new URL(value, url).href);
      return p.store === identity.store && p.externalId === identity.externalId;
    } catch {
      return false;
    }
  };
  const meta = (key: string) =>
    $(`meta[property="${key}"],meta[name="${key}"]`).first().attr('content')?.trim();
  const candidates: Record<string, any>[] = [];
  let visited = 0;
  const visit = (value: any, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 12 || ++visited > 10000) return;
    if (Array.isArray(value)) {
      for (const v of value.slice(0, 100)) visit(v, depth + 1);
      return;
    }
    const name = value.name || value.title || value.productName;
    const id = String(
      value.product_id || value.productId || value.childId || value.id || value.sku || '',
    );
    if (
      typeof name === 'string' &&
      name.length >= 4 &&
      name.length <= 1000 &&
      (id === identity.externalId || same(value.url || value.productUrl))
    ) {
      const amount = value.offerPrice ?? value.salePrice ?? value.price;
      if (typeof amount === 'string' || typeof amount === 'number')
        candidates.push({
          '@type': 'Product',
          name,
          sku: identity.externalId,
          url,
          brand: value.brand,
          image: value.image || value.imageUrl,
          size: value.packSize || value.size,
          offers: {
            '@type': 'Offer',
            url,
            price: amount,
            priceCurrency:
              value.currency ||
              value.priceCurrency ||
              (!retailers[identity.store].international ? 'INR' : undefined),
            availability:
              value.inStock === true
                ? 'InStock'
                : value.inStock === false
                  ? 'OutOfStock'
                  : undefined,
            itemCondition: value.itemCondition,
          },
        });
    }
    for (const [key, v] of Object.entries(value))
      if (!/recommend|related|similar|crossSell/i.test(key)) visit(v, depth + 1);
  };
  for (const node of $('script:not([src])').toArray()) {
    const script = $(node).text().trim();
    if (script.length > 4 * 1024 * 1024) continue;
    const state =
      $(node).attr('id') === '__NEXT_DATA__'
        ? script
        : /^(?:window\.)?__PRELOADED_STATE__\s*=/.test(script)
          ? script.replace(/^(?:window\.)?__PRELOADED_STATE__\s*=\s*/, '').replace(/;\s*$/, '')
          : null;
    if (state)
      try {
        visit(JSON.parse(state));
      } catch {}
  }
  const unique = [...new Map(candidates.map((p) => [JSON.stringify(p), p])).values()];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) return null;
  // Meta is valid only when the canonical page identifies this exact listing.
  const canonical = $('link[rel="canonical"]').attr('href');
  const name = meta('og:title') || $('h1').first().text().trim();
  if (
    !same(canonical) ||
    !name ||
    name.length < 4 ||
    name.length > 1000 ||
    /captcha|access denied|just a moment|robot check/i.test(name)
  )
    return null;
  const amount = meta('product:price:amount') || meta('og:price:amount');
  const currency = meta('product:price:currency') || meta('og:price:currency');
  return {
    '@type': 'Product',
    name,
    sku: identity.externalId,
    url,
    image: meta('og:image'),
    offers:
      amount && currency
        ? { '@type': 'Offer', url, price: amount, priceCurrency: currency }
        : undefined,
  };
}
