import { it, expect, vi } from 'vitest';
import { scrapeProduct, scraperCreditCost } from '../packages/providers/scraper';
const url = 'https://www.amazon.in/dp/B000000001';
const html =
  '<input id="ASIN" value="B000000001"><span id="productTitle">Test Phone 128 GB</span><div id="corePrice_desktop"><span class="a-price"><span class="a-offscreen">₹25,999.50</span></span></div><div id="availability">In stock</div><input id="add-to-cart-button">';

it('Firecrawl requests fresh raw HTML and uses the existing deterministic price parser', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      success: true,
      data: { rawHtml: html, metadata: { sourceURL: url, statusCode: 200 } },
    }),
  );
  const result = await scrapeProduct(
    url,
    { transport: 'firecrawl', apiKey: 'fixture-key' },
    fetcher,
  );
  expect(result.itemPrice).toBe(2599950);
  expect(result.attributes['Fetch method']).toBe('Firecrawl retailer HTML');
  expect(scraperCreditCost({ transport: 'firecrawl' })).toBe(1);
  const [destination, init] = fetcher.mock.calls[0];
  expect(destination).toBe('https://api.firecrawl.dev/v2/scrape');
  expect(JSON.parse(init.body)).toMatchObject({
    url,
    formats: ['rawHtml'],
    maxAge: 0,
    proxy: 'basic',
  });
  expect(JSON.parse(init.body).formats).not.toContain('json');
});

it('Firecrawl cannot substitute another retailer product or mask exhausted credits', async () => {
  const swapped = vi.fn().mockResolvedValue(
    Response.json({
      success: true,
      data: { rawHtml: html, metadata: { sourceURL: 'https://www.amazon.in/dp/B000000002' } },
    }),
  );
  await expect(
    scrapeProduct(url, { transport: 'firecrawl', apiKey: 'fixture-key' }, swapped),
  ).rejects.toMatchObject({ code: 'redirect' });
  const exhausted = vi
    .fn()
    .mockResolvedValue(new Response('private-provider-error', { status: 402 }));
  await expect(
    scrapeProduct(url, { transport: 'firecrawl', apiKey: 'fixture-key' }, exhausted),
  ).rejects.toMatchObject({ code: 'provider_credits' });
});

it('empty or blocked provider HTML never creates a price', async () => {
  const empty = vi.fn().mockResolvedValue(Response.json({ success: true, data: { rawHtml: '' } }));
  await expect(
    scrapeProduct(url, { transport: 'firecrawl', apiKey: 'fixture-key' }, empty),
  ).rejects.toMatchObject({ code: 'empty' });
  const blocked = vi.fn().mockResolvedValue(
    Response.json({
      success: true,
      data: { rawHtml: '<title>Access denied</title>', metadata: { statusCode: 403 } },
    }),
  );
  await expect(
    scrapeProduct(url, { transport: 'firecrawl', apiKey: 'fixture-key' }, blocked),
  ).rejects.toMatchObject({ code: 'blocked' });
});
