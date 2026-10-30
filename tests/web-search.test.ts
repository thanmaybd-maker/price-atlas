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
