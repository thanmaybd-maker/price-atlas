import { it, expect } from 'vitest';
import { STORE_NAMES, parseRetailUrl, rank } from '../packages/domain/index';
import { canonicalRetailUrl, parseProductHtml, listingKey } from '../packages/providers/scraper';
import { parseSearchHtml } from '../packages/providers/search';
import { lookupIdentity } from '../packages/jobs/discovery';

const urls = {
  Meesho: 'https://www.meesho.com/cotton-shirt/p/de4nwt',
  Croma: 'https://www.croma.com/logitech-m331/p/200052',
  Nykaa: 'https://www.nykaa.com/lipstick/p/683166?skuId=15073777',
  iHerb: 'https://in.iherb.com/pr/cetaphil-cream/114694',
  'B&H': 'https://www.bhphotovideo.com/c/product/1706293-REG/sony.html',
};
const schema = (url: string, extra: Record<string, unknown> = {}) => ({
  '@type': 'Product',
  name: 'Test product exact variant',
  url,
  sku: parseRetailUrl(url).externalId,
  brand: { name: 'Test' },
  image: 'https://images.meesho.com/product.jpg',
  offers: {
    '@type': 'Offer',
    url,
    price: '123.45',
    priceCurrency: 'INR',
    availability: 'InStock',
    itemCondition: 'NewCondition',
  },
  ...extra,
});
const html = (p: Record<string, unknown>) =>
  `<script type="application/ld+json">${JSON.stringify(p)}</script>`;

it('canonicalizes every new retailer without retaining tracking or dropping the selected variant', () => {
  for (const [store, url] of Object.entries(urls)) {
    expect(
      canonicalRetailUrl(url + (url.includes('?') ? '&' : '?') + 'utm_source=test'),
    ).toMatchObject({ store, url });
    expect(STORE_NAMES).toContain(store);
  }
  expect(listingKey({ ...parseRetailUrl(urls['B&H']) })).toBe('bhphoto-1706293-reg');
  for (const url of [
    'https://meesho.com.evil.example/a/p/de4nwt',
    'https://user@www.croma.com/a/p/200052',
    'http://www.nykaa.com/a/p/12345',
    'https://www.meesho.com/search?q=shirt',
    'https://www.nykaa.com/lipstick/p/683166?skuId=invalid',
  ])
    expect(() => parseRetailUrl(url)).toThrow();
});
it('separates retailer-specific lookup caches but reuses canonical direct URLs', () => {
  expect(lookupIdentity('Logitech M331', 'Croma').key).not.toBe(
    lookupIdentity('Logitech M331', 'Amazon').key,
  );
  expect(lookupIdentity(urls.Croma, 'Croma').key).toBe(lookupIdentity(urls.Croma, 'all').key);
});
it('parses a uniquely identified primary Meesho offer and rejects conflicting identity', () => {
  const p = parseProductHtml(html(schema(urls.Meesho)), urls.Meesho);
  expect(p).toMatchObject({ itemPrice: 12345, shipping: null, stock: true, condition: 'new' });
  expect(() =>
    parseProductHtml(html(schema(urls.Meesho, { sku: 'other123' })), urls.Meesho),
  ).toThrow();
  expect(() =>
    parseProductHtml(html(schema(urls.Meesho)) + html(schema(urls.Meesho)), urls.Meesho),
  ).toThrow();
});
it('repairs only Croma’s extra final closing brace, retaining unknown stock and shipping', () => {
  const product = schema(urls.Croma, {
    offers: { '@type': 'Offer', url: urls.Croma, price: '1349.00', priceCurrency: 'INR' },
  });
  const page = `<script type="application/ld+json">${JSON.stringify(product)} }</script>`;
  expect(parseProductHtml(page, urls.Croma)).toMatchObject({
    itemPrice: 134900,
    stock: null,
    condition: 'unknown',
    shipping: null,
  });
});
it('rejects a Nykaa parent offer when a different shade was requested', () => {
  const parent = urls.Nykaa.split('?')[0];
  expect(() => parseProductHtml(html(schema(parent)), urls.Nykaa)).toThrow();
  const canonical = `<link rel="canonical" href="${parent}">`;
  expect(parseProductHtml(canonical + html(schema(urls.Nykaa)), urls.Nykaa).externalId).toBe(
    '15073777',
  );
});
it('resolves Nykaa’s selected shade from JSON state and requires its own price and SKU to agree', () => {
  const parent = urls.Nykaa.split('?')[0];
  const variant = {
    childId: '15073777',
    name: 'Test lipstick Rose',
    sku: 'NYK_ROSE',
    offerPrice: 230,
    packSize: '4.2g',
    variantName: 'Rose',
    inStock: true,
    buttonText: 'ADD TO BAG',
  };
  const state = {
    productPage: { product: { id: '683166', selectedVariantId: '15073777', variants: [variant] } },
  };
  const preloaded = `<script>window.__PRELOADED_STATE__ = ${JSON.stringify(state)}</script>`;
  const product = schema(parent, {
    name: variant.name,
    sku: variant.sku,
    offers: {
      '@type': 'Offer',
      url: parent,
      price: 230,
      priceCurrency: 'INR',
      availability: 'InStock',
    },
  });
  const parsed = parseProductHtml(preloaded + html(product), urls.Nykaa);
  expect(parsed).toMatchObject({
    externalId: '15073777',
    itemPrice: 23000,
    condition: 'new',
    attributes: { Shade: 'Rose', Size: '4.2g' },
  });
  expect(parseProductHtml(preloaded + html(product), parent).url).toBe(urls.Nykaa);
  (product.offers as Record<string, unknown>).price = 165;
  expect(() => parseProductHtml(preloaded + html(product), urls.Nykaa)).toThrow();
});
it('retains original foreign currency metadata without creating an INR price or free international shipping', () => {
  const p = parseProductHtml(
    html(
      schema(urls['B&H'], {
        offers: {
          '@type': 'Offer',
          url: urls['B&H'],
          price: '298.00',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          shippingDetails: { shippingRate: { currency: 'INR', value: 0 } },
        },
      }),
    ),
    urls['B&H'],
  );
  expect(p.itemPrice).toBeNull();
  expect(p.attributes['Source currency']).toBe('USD');
  expect(p.attributes['Source price']).toContain('298');
  expect(p.shipping).toBeNull();
  expect(p.attributes['Delivery note']).toContain('India');
  expect(rank([]).lowest).toBeNull();
});
it('never turns aggregate or related-item pricing into a primary observation', () => {
  const p = schema(urls.Croma, {
    offers: { '@type': 'AggregateOffer', lowPrice: 1, priceCurrency: 'INR' },
  });
  expect(() => parseProductHtml(html(p), urls.Croma)).toThrow();
  const other = schema('https://www.croma.com/other/p/999999');
  expect(() => parseProductHtml(html(other), urls.Croma)).toThrow();
});
it('discovers new retailer anchors and structured item lists using only validated product destinations', () => {
  const page = `<a href="${urls.Meesho}"><img alt="Cotton shirt"></a><a href="https://evil.example/a/p/de4nwt">Other shirt</a>`;
  expect(parseSearchHtml(page, 'Meesho')).toHaveLength(1);
  const list = {
    '@type': 'ItemList',
    itemListElement: [
      { '@type': 'ListItem', item: { url: urls.Croma, name: 'Logitech M331 mouse' } },
    ],
  };
  expect(parseSearchHtml(html(list), 'Croma')[0]).toMatchObject({
    url: urls.Croma,
    store: 'Croma',
  });
});
