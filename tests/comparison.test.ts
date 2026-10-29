import { it, expect } from 'vitest';
import { parseRetailUrl, rank, type Offer } from '../packages/domain/index';
import {
  variantSignature,
  compareVariants,
  variantAttributes,
} from '../packages/domain/variant-guard';
import { storesForCategory, retailerSearchUrl } from '../packages/domain/retailers';
import { parseProductHtml, canonicalRetailUrl } from '../packages/providers/scraper';
import { boundedLimit, MAX_PAID_CREDITS_PER_MONTH } from '../packages/jobs/credit-budget';
import { weeklyHistory } from '../packages/domain/weekly-history';

it('rejects different packs, memory, bindings, editions, models and conditions before comparison', () => {
  for (const [a, b] of [
    ['Clips Pack of 1', 'Clips Pack of 3'],
    ['Phone 8GB 256GB', 'Phone 12GB 512GB'],
    ['Algorithms 4th Edition Paperback', 'Algorithms 4th Edition Hardcover'],
    ['Algorithms 3rd Edition Paperback', 'Algorithms 4th Edition Paperback'],
    ['Casio fx-991CW', 'Casio fx-991ES Plus'],
    ['Sony MDR-7506', 'Renewed Sony MDR-7506'],
    ['Serum 30ml', 'Serum 60ml'],
    ['Serum 30ml', 'Serum 30ml combo kit'],
    ['Phone', 'Open Box Phone'],
  ])
    expect(
      compareVariants(
        variantSignature(a, { Condition: 'new' }),
        variantSignature(b, { Condition: 'new' }),
      ).decision,
      `${a} / ${b}`,
    ).toBe('rejected');
  expect(
    compareVariants(variantSignature('Serum 30ml'), variantSignature('Serum 0.03 litre')).decision,
  ).toBe('accepted');
  expect(
    compareVariants(variantSignature('Clips Pack of 2'), variantSignature('Clips')).decision,
  ).toBe('review');
  expect(variantAttributes('CLRS 4th Edition Paperback', {})).toMatchObject({
    Binding: 'PAPERBACK',
    Edition: '4',
  });
});
it('never awards a domestic INR badge to an international INR offer, even with zero stated shipping', () => {
  const now = Date.now();
  const o: Offer = {
    id: 'intl',
    productId: 'test',
    store: 'iHerb',
    itemPrice: 100,
    shipping: 0,
    charges: 0,
    discount: 0,
    currency: 'INR',
    stock: true,
    accepted: true,
    condition: 'new',
    observedAt: now - 1000,
    validUntil: now + 1000,
    historyAllowed: true,
    alertsAllowed: true,
    displayAllowed: true,
    seller: '',
    context: 'India',
  };
  expect(rank([o], now, 'item').lowest).toBeNull();
  expect(rank([{ ...o, store: 'Amazon' }], now).lowest).toBe(100);
});
it('recognizes new retailers and safely encodes discovery destinations', () => {
  const urls = [
    'https://www.reliancedigital.in/acme/p/493177049',
    'https://www.myntra.com/shirts/acme/cotton-shirt/12345678/buy',
    'https://www.ajio.com/acme-shirt/p/466655544_blue',
  ];
  for (const url of urls) expect(canonicalRetailUrl(url + '?utm_source=test').url).toBe(url);
  expect(parseRetailUrl(urls[0]).store).toBe('Reliance Digital');
  expect(() => parseRetailUrl(urls[1].replace('myntra.com', 'myntra.com.evil.test'))).toThrow();
  expect(storesForCategory('beauty')).toEqual(
    expect.arrayContaining(['Nykaa', 'Myntra', 'AJIO', 'Meesho']),
  );
  expect(storesForCategory('books')).not.toContain('Nykaa');
  expect(new URL(retailerSearchUrl('AJIO', 'shirt & pants')).searchParams.get('text')).toBe(
    'shirt & pants',
  );
});
it('extracts a primary framework product without executing scripts and rejects competing variant prices', () => {
  const url = 'https://www.meesho.com/clip/p/abcd123';
  const product = {
    product_id: 'abcd123',
    name: 'Cable clips Pack of 2',
    price: 123,
    currency: 'INR',
    inStock: true,
  };
  const html = (p: unknown) =>
    `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { product: p } } })}</script>`;
  expect(parseProductHtml(html(product), url)).toMatchObject({
    itemPrice: 12300,
    shipping: null,
    attributes: { Pack: '2' },
  });
  expect(() => parseProductHtml(html([product, { ...product, price: 999 }]), url)).toThrow();
  expect(() =>
    parseProductHtml(
      '<script>window.__PRELOADED_STATE__ = (() => { throw Error("execute"); })()</script>',
      url,
    ),
  ).toThrow();
});
it('keeps canonical title-only metadata partial with no numeric price, stock or condition invented', () => {
  const url = 'https://www.ajio.com/acme-shirt/p/466655544_blue';
  const page = `<link rel="canonical" href="${url}"><meta property="og:title" content="Acme Cotton Shirt">`;
  expect(parseProductHtml(page, url)).toMatchObject({
    title: 'Acme Cotton Shirt',
    status: 'PARTIAL_UNVERIFIED',
    itemPrice: null,
    stock: null,
    condition: 'unknown',
  });
  expect(() => parseProductHtml(page.replace('466655544_blue', '466655555_red'), url)).toThrow();
  expect(() => parseProductHtml(page.replace('Acme Cotton Shirt', 'Access denied'), url)).toThrow();
});
it('keeps international INR prices in source metadata and never invents a landed total', () => {
  const url = 'https://in.iherb.com/pr/now-foods-omega-3/12345';
  const product = {
    '@type': 'Product',
    name: 'NOW Foods Omega-3 200 Softgels',
    url,
    offers: { '@type': 'Offer', url, price: '999', priceCurrency: 'INR', availability: 'InStock' },
  };
  const p = parseProductHtml(
    `<script type="application/ld+json">${JSON.stringify(product)}</script>`,
    url,
  );
  expect(p.itemPrice).toBeNull();
  expect(p.shipping).toBeNull();
  expect(p.attributes['Source currency']).toBe('INR');
  expect(p.attributes['Source price']).toContain('999');
});
it('hard caps configured collection budgets while allowing stricter deployments', () => {
  expect(boundedLimit('10000', MAX_PAID_CREDITS_PER_MONTH)).toBe(300);
  expect(boundedLimit('0', 300)).toBe(0);
  expect(() => boundedLimit('-1', 300)).toThrow();
});
it('uses India day boundaries, real daily highs and gaps without inventing yesterday comparisons', () => {
  const now = Date.parse('2026-10-29T04:30:00Z');
  const base: Offer = {
    id: 'a',
    productId: 'test',
    store: 'Amazon',
    itemPrice: 100,
    shipping: 0,
    charges: 0,
    discount: 0,
    currency: 'INR',
    stock: true,
    accepted: true,
    condition: 'new',
    observedAt: Date.parse('2026-10-28T19:00:00Z'),
    validUntil: now + 1,
    historyAllowed: true,
    alertsAllowed: true,
    displayAllowed: true,
    seller: '',
    context: 'India',
  };
  const days = weeklyHistory(
    [
      base,
      { ...base, id: 'b', itemPrice: 300, observedAt: base.observedAt + 1000 },
      { ...base, id: 'c', itemPrice: 90, observedAt: base.observedAt - 2 * 86400000 },
    ],
    'item',
    now,
  );
  expect(days[6].date.toISOString()).toBe('2026-10-28T18:30:00.000Z');
  expect(days[6].low?.price).toBe(100);
  expect(days[6].high?.price).toBe(300);
  expect(days[6].change).toBeNull();
  expect(days[5].low).toBeNull();
});
