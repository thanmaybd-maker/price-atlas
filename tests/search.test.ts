import { it, expect, vi } from 'vitest';
import { parseSearchHtml, duckDuckGoProducts } from '../packages/providers/search';
import { scrapeSearchHtml } from '../packages/providers/scraper';
import { matchesQuery } from '../packages/domain/search';
import { lookupIdentity } from '../packages/jobs/discovery';
it('finds Amazon and Flipkart product cards without treating search prices as observations', () => {
  expect(
    parseSearchHtml(
      '<div data-component-type="s-search-result" data-asin="B000000001"><h2>Logitech</h2><h2>Logitech M331 mouse</h2><span>₹1</span></div>',
      'Amazon',
    ),
  ).toEqual([
    { store: 'Amazon', url: 'https://www.amazon.in/dp/B000000001', title: 'Logitech M331 mouse' },
  ]);
  expect(
    parseSearchHtml(
      '<a href="https://evil.example/p/itm123" title="Bad destination"></a><a href="/m331-mouse/p/itm123?pid=ACC000000001"><img alt="Logitech M331 mouse"></a>',
      'Flipkart',
    ),
  ).toEqual([
    {
      store: 'Flipkart',
      url: 'https://www.flipkart.com/m331-mouse/p/itm123?pid=ACC000000001',
      title: 'Logitech M331 mouse',
    },
  ]);
});
it('uses a fixed retailer search origin and encodes query input', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('<title>Results</title>'));
  await scrapeSearchHtml('mouse & keyboard', 'Amazon', { transport: 'direct' }, fetcher);
  expect(new URL(fetcher.mock.calls[0][0]).origin).toBe('https://www.amazon.in');
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('k')).toBe('mouse & keyboard');
});
it('preserves an Amazon brand heading when the product heading omits it', () => {
  const result = parseSearchHtml(
    '<div data-component-type="s-search-result" data-asin="B000000001"><h2>Pigeon</h2><h2>by Stovekraft Induction Cooktop 1800W</h2></div>',
    'Amazon',
  );
  expect(
    matchesQuery({ name: result[0].title, brand: '', subtitle: '' }, 'Pigeon induction cook top'),
  ).toBe(true);
});
it('validates web-search destinations before considering a free fallback', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        '<a class="result__a" href="https://evil.example/dp/B000000001">Fake</a><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.amazon.in%2Fdp%2FB000000001">Logitech mouse</a>',
      ),
    );
  expect(await duckDuckGoProducts('Logitech mouse', 'Amazon', fetcher)).toHaveLength(1);
});
it('matches words, punctuation and spaced storage without requiring a literal full-query substring', () => {
  expect(
    matchesQuery(
      { name: 'Bajaj DX-6 Dry Iron', brand: 'Bajaj', subtitle: '' },
      'Bajaj electric iron',
    ),
  ).toBe(true);
  expect(
    matchesQuery(
      { name: 'Apple iPhone 16 (128 GB) - Black', brand: 'Apple', subtitle: '' },
      'iphone 16 128gb',
    ),
  ).toBe(true);
  expect(
    matchesQuery(
      { name: 'Apple iPhone 16 (256 GB) - Black', brand: 'Apple', subtitle: '' },
      'iphone 16 128gb',
    ),
  ).toBe(false);
  expect(
    matchesQuery(
      { name: 'Casio FX-991CW Classwiz', brand: 'Casio', subtitle: '' },
      'Casio FX991CW',
    ),
  ).toBe(true);
  expect(
    matchesQuery(
      { name: 'Casio FX-991MS Scientific', brand: 'Casio', subtitle: '' },
      'Casio FX991CW',
    ),
  ).toBe(false);
  expect(() => lookupIdentity('https://127.0.0.1/private')).toThrow();
});
it('uses verified size attributes for search and keeps different volumes and numeric specifications separate', () => {
  const serum = {
    name: 'Minimalist 10% Niacinamide Face Serum',
    brand: 'Minimalist',
    subtitle: '',
    attributes: { Size: '30 ml' },
  };
  expect(matchesQuery(serum, 'Minimalist Niacinamide 30ml')).toBe(true);
  expect(matchesQuery(serum, 'Minimalist Niacinamide 60ml')).toBe(false);
  expect(
    matchesQuery(
      { ...serum, attributes: { Size: '30 millilitres' } },
      'Minimalist Niacinamide 30ml',
    ),
  ).toBe(true);
  expect(matchesQuery({ name: 'Phone 160 GB', brand: '', subtitle: '' }, '16')).toBe(false);
});
