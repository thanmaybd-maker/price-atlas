import { describe, it, expect, vi } from 'vitest';
import {
  parseINR,
  parseProductHtml,
  scrapeProduct,
  canonicalRetailUrl,
} from '../packages/providers/scraper';
const amazon = 'https://www.amazon.in/dp/B000000001';
const flipkart = 'https://www.flipkart.com/test-phone/p/itm123?pid=MOB000000001';
const amazonHtml = (
  price = '<div id="corePrice_desktop"><span class="a-price"><span class="a-offscreen">₹25,999.50</span></span></div>',
) =>
  `<html><title>Phone</title><body><input id="ASIN" value="B000000001"><span id="productTitle">Test phone 128 GB</span>${price}<div id="availability">In stock</div><input id="add-to-cart-button"><div id="deliveryBlockMessage">FREE delivery</div><img id="landingImage" data-a-dynamic-image='{"https://m.media-amazon.com/images/small.jpg":[200,200],"https://m.media-amazon.com/images/large.jpg":[1000,1000]}'><table id="productOverview_feature_div"><tr><td>Brand</td><td>Test</td></tr></table></body></html>`;
describe('retailer parsing without inventing price or availability', () => {
  it('resolves a truncated primary heading from one matching Product, excluding script stock text', () => {
    const title = 'SONY WH-1000XM5 Wireless Noise Cancellation with AI Noise Reduction Bluetooth';
    const page =
      '<h1>SONY WH-1000XM5 Wireless Noise Cancellation with AI Noise Reducti...more</h1><script>const related="out of stock";</script><script type="application/ld+json">' +
      JSON.stringify({
        '@type': 'Product',
        name: title,
        sku: 'ACCHGBCB34ATPVM7',
        offers: {
          '@type': 'Offer',
          price: 27990,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          itemCondition: 'https://schema.org/NewCondition',
        },
      }) +
      '</script>';
    expect(
      parseProductHtml(page, 'https://www.flipkart.com/sony-headphone/p/itm7f07dcc8df256'),
    ).toMatchObject({ title, itemPrice: 2799000, stock: true, externalId: 'ACCHGBCB34ATPVM7' });
  });
  it('supports the observed Flipkart structured layout, SKU identity and mandatory fee', () => {
    const page =
      '<h1>Google Pixel 9 (Wintergreen, 256 GB) (12 GB RAM)</h1><div>+₹299 Protect Promise Fee</div><script type="application/ld+json">' +
      JSON.stringify([
        {
          '@type': 'Product',
          name: 'Google Pixel 9 (Wintergreen, 256 GB)',
          sku: 'MOBH2HJG6KBBMPRF',
          image: ['https://rukmini1.flixcart.com/image/test.jpeg'],
          offers: {
            '@type': 'Offer',
            price: 79999,
            priceCurrency: 'INR',
            availability: 'https://schema.org/InStock',
            itemCondition: 'https://schema.org/NewCondition',
            shippingDetails: { shippingRate: { value: 0, currency: 'INR' } },
          },
        },
      ]) +
      '</script>';
    const p = parseProductHtml(
      page,
      'https://www.flipkart.com/google-pixel-9-wintergreen-256-gb/p/itmcead5185c21a8',
    );
    expect(p.externalId).toBe('MOBH2HJG6KBBMPRF');
    expect(p.itemPrice).toBe(7999900);
    expect(p.charges).toBe(29900);
    expect(p.stock).toBe(true);
    expect(p.shipping).toBe(0);
    expect(p.url).toContain('pid=MOBH2HJG6KBBMPRF');
  });
  it('rejects price conflicts and never reads an unrelated Product or AggregateOffer', () => {
    const data = {
      '@type': 'Product',
      name: 'Test phone',
      sku: 'MOB000000001',
      offers: { '@type': 'Offer', price: 1, priceCurrency: 'INR' },
    };
    const page =
      '<h1>Test phone</h1><div class="Nx9bqj">₹19,999</div><script type="application/ld+json">' +
      JSON.stringify(data) +
      '</script>';
    expect(() => parseProductHtml(page, flipkart)).toThrow('prices disagree');
    expect(() =>
      parseProductHtml(
        page
          .replace('Test phone","sku', 'Different product","sku')
          .replace('<div class="Nx9bqj">₹19,999</div>', ''),
        flipkart,
      ),
    ).toThrow();
  });
  it('does not turn null shipping metadata into free delivery', () => {
    const page =
      '<h1>Test phone</h1><script type="application/ld+json">' +
      JSON.stringify({
        '@type': 'Product',
        name: 'Test phone',
        sku: 'MOB000000001',
        offers: {
          '@type': 'Offer',
          price: 19999,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          shippingDetails: { shippingRate: { value: null, currency: 'INR' } },
        },
      }) +
      '</script>';
    expect(parseProductHtml(page, flipkart).shipping).toBeNull();
  });
  it.each([
    ['₹1,29,999', 12999900],
    ['INR 25,999.50', 2599950],
    ['Rs. 999.9', 99990],
    ['0', null],
    ['₹25,999 ₹29,999', null],
    ['₹2,5,999', null],
    ['₹999 per month', null],
  ])('parses %s into integer paise', (text, value) => expect(parseINR(text as string)).toBe(value));
  it('extracts Amazon primary price, dynamic largest image, title and source attributes', () => {
    const p = parseProductHtml(amazonHtml(), amazon);
    expect(p.itemPrice).toBe(2599950);
    expect(p.shipping).toBe(0);
    expect(p.stock).toBe(true);
    expect(p.imageUrl).toContain('large.jpg');
    expect(p.attributes.Brand).toBe('Test');
  });
  it.each([
    '<div class="priceToPay"><span class="a-offscreen">₹24,999</span></div>',
    '<span class="a-price"><span class="a-offscreen">₹24,999</span></span>',
  ])('uses independent fallback price selectors', (price) =>
    expect(parseProductHtml(amazonHtml(price), amazon).itemPrice).toBe(2499900),
  );
  it('does not use a recommendation price or a struck-out MRP', () => {
    const html = amazonHtml(
      '<div class="a-carousel"><span class="a-price"><span class="a-offscreen">₹1</span></span></div><span class="a-price a-text-price"><span class="a-offscreen">₹99,999</span></span><div class="priceToPay"><span class="a-offscreen">₹24,999</span></div>',
    );
    expect(parseProductHtml(html, amazon).itemPrice).toBe(2499900);
  });
  it.each(['Nx9bqj CxhGGd', '_30jeq3'])(
    'parses Flipkart current and old selector layouts',
    (cls) => {
      const p = parseProductHtml(
        `<h1><span class="VU-ZEz">Test phone</span></h1><div class="${cls}">₹19,999</div><button>ADD TO CART</button>`,
        flipkart,
      );
      expect(p.itemPrice).toBe(1999900);
      expect(p.stock).toBe(true);
      expect(p.shipping).toBeNull();
    },
  );
  it('never assumes stock if not supplied', () => {
    const p = parseProductHtml(
      '<span class="VU-ZEz">Test phone</span><div class="Nx9bqj">₹19,999</div>',
      flipkart,
    );
    expect(p.stock).toBeNull();
    expect(p.condition).toBe('unknown');
  });
  it('records unavailable products without a fake zero price', () => {
    const p = parseProductHtml(
      amazonHtml('')
        .replace('In stock', 'Currently unavailable')
        .replace('<input id="add-to-cart-button">', ''),
      amazon,
    );
    expect(p.itemPrice).toBeNull();
    expect(p.stock).toBe(false);
  });
  it('rejects verification pages and mismatched ASINs', () => {
    expect(() => parseProductHtml('<title>Robot Check</title>', amazon)).toThrow('verification');
    expect(() =>
      parseProductHtml(amazonHtml().replace('value="B000000001"', 'value="B000000002"'), amazon),
    ).toThrow('variant differs');
  });
  it('preserves Flipkart product route while stripping tracking parameters', () =>
    expect(canonicalRetailUrl(flipkart + '&affid=x').url).toBe(flipkart));
  it('rejects untrusted hosts before any network request', async () => {
    const fetcher = vi.fn();
    await expect(
      scrapeProduct(
        'https://127.0.0.1/dp/B000000001',
        { transport: 'direct' },
        fetcher as typeof fetch,
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('refuses a redirect to another product or a private address', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response('', { status: 302, headers: { location: 'https://127.0.0.1/' } }),
      );
    await expect(scrapeProduct(amazon, { transport: 'direct' }, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('sends proxy credentials to the fixed provider origin only', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(amazonHtml(), { headers: { 'content-type': 'text/html' } }));
    await scrapeProduct(
      amazon,
      { transport: 'scrapingbee', apiKey: 'secret', premiumProxy: true },
      fetcher,
    );
    const [url, init] = fetcher.mock.calls[0];
    expect(url.origin).toBe('https://app.scrapingbee.com');
    expect(url.searchParams.get('country_code')).toBe('in');
    expect(url.href).not.toContain('secret');
    expect(init.headers.Authorization).toBe('Bearer secret');
  });
  it('constructs Bright Data raw HTML requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(amazonHtml()));
    await scrapeProduct(amazon, { transport: 'brightdata', apiKey: 'key', zone: 'zone' }, fetcher);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      url: amazon,
      zone: 'zone',
      format: 'raw',
    });
  });
  it('classifies rate limiting and enforces response size bounds', async () => {
    await expect(
      scrapeProduct(
        amazon,
        { transport: 'direct' },
        vi.fn().mockResolvedValue(new Response('', { status: 429 })),
      ),
    ).rejects.toMatchObject({ code: 'rate_limited', retryable: true });
    await expect(
      scrapeProduct(
        amazon,
        { transport: 'direct' },
        vi.fn().mockResolvedValue(new Response('ok', { headers: { 'content-length': '9999999' } })),
      ),
    ).rejects.toMatchObject({ code: 'too_large' });
  });
});
