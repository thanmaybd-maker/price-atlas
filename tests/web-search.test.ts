import { it, expect, vi } from 'vitest';
vi.mock('../packages/jobs/index', () => ({ reserveSource: vi.fn(async () => {}) }));
vi.mock('../packages/jobs/provider-pool', () => ({
  availableCredentials: vi.fn(async (k?: string) => (k ? [k] : [])),
}));
import { firecrawlProductSearch } from '../packages/jobs/web-search';

it('turns store-limited web search results into verified-later product candidates', async () => {
  process.env.FIRECRAWL_API_KEY = 'fc-test';
  let sent: { query: string; limit: number } | null = null;
  const f = (async (_u: string | URL | Request, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({
      success: true,
      data: {
        web: [
          {
            url: 'https://www.amazon.in/Xiaomi-17-Ultra/dp/B0FAKE1234',
            title: 'Xiaomi 17 Ultra 16GB 512GB',
          },
          { url: 'https://www.amazon.in/s?k=xiaomi', title: 'search page' },
          {
            url: 'https://www.flipkart.com/xiaomi-17-ultra/p/itmx?pid=MOBH8ZZZZZZZZZZZ',
            title: 'Xiaomi 17 Ultra',
          },
        ],
      },
    });
  }) as typeof fetch;
  const r = await firecrawlProductSearch('xiaomi 17 ultra', f);
  expect(sent!.query).toContain('site:amazon.in');
  expect(r.candidates.map((c) => c.store)).toEqual(['Amazon', 'Flipkart']);
  expect(r.candidates[0]).toMatchObject({
    url: 'https://www.amazon.in/dp/B0FAKE1234',
    quotedRupees: null,
  });
  delete process.env.FIRECRAWL_API_KEY;
  expect((await firecrawlProductSearch('x', f)).reason).toBe('unconfigured');
});

import { parseFlipkartSearch } from '../packages/jobs/web-search';
it('reads product cards and listed prices from a Flipkart search page', () => {
  const html = `<a href="https://www.flipkart.com/hp-15-laptop/p/itmc37f7386f2ddb?pid=COMHRMHWBHPHPZV6&amp;lid=X"><img alt="HP 15 AMD Athlon 8 GB/512 GB SSD Laptop" src="x"/><div>₹45,490</div></a>
  <a href="/acer-aspire-3/p/itma6a6812aa712e?pid=COMH4B6CGTPNVJW9&amp;x=1"><div>Acer</div><div>₹40,990</div></a>
  <a href="https://www.flipkart.com/hp-15-laptop/p/itmc37f7386f2ddb?pid=COMHRMHWBHPHPZV6">dupe</a>`;
  const out = parseFlipkartSearch(html);
  expect(out).toHaveLength(2);
  expect(out[0]).toMatchObject({
    store: 'Flipkart',
    title: 'HP 15 AMD Athlon 8 GB/512 GB SSD Laptop',
    quotedRupees: 45490,
  });
  expect(out[1].quotedRupees).toBe(40990);
});
