import { it, expect } from 'vitest';
import { parseAgentResearch, retailerRoundRobin } from '../packages/providers/agent-research';
import { resolveResearchLinks } from '../packages/providers/agent-payload';
import { parseQueryIntent } from '../packages/domain/query-intent';

it('keeps beauty subtypes instead of broadening every lipstick search to all beauty products', () => {
  expect(parseQueryIntent('Maybelline lipstick under 500').text).toBe('maybelline lipstick');
  expect(
    parseAgentResearch('lipstick', {
      products: [
        { title: 'Maybelline Matte Lipstick', url: 'https://www.amazon.in/dp/B0BROAD001' },
      ],
    }).candidates,
  ).toHaveLength(1);
});

const products = Array.from({ length: 32 }, (_, i) => ({
  title: `Samsung S25 Ultra ${i % 2 ? '512GB' : '256GB'} model listing ${i}`,
  url:
    i % 2
      ? `https://www.amazon.in/dp/B0BROAD${String(i).padStart(3, '0')}`
      : `https://www.flipkart.com/phone/p/itmabc?pid=MOBBROAD${String(i).padStart(4, '0')}`,
}));

it('shows different retailers first without discarding any listings', () => {
  const rows = [
    { store: 'Amazon', id: 1 },
    { store: 'Amazon', id: 2 },
    { store: 'Flipkart', id: 3 },
    { store: 'Nykaa', id: 4 },
  ];
  expect(retailerRoundRobin(rows).map((r) => r.id)).toEqual([1, 3, 4, 2]);
});

it('retains more than twenty supported links from one response', async () => {
  const resolved = await resolveResearchLinks({ products });
  expect(resolved.products).toHaveLength(32);
  expect(parseAgentResearch('Samsung S25 Ultra', resolved).candidates).toHaveLength(32);
});

it('uses descriptive store slugs instead of a misleading generated product/variant title', async () => {
  const resolved = await resolveResearchLinks({
    products: [
      {
        title: 'Samsung S25 Ultra 256GB Black',
        url: 'https://www.croma.com/elica-gas-stove-black/p/313340',
      },
      {
        title: 'Samsung S25 Ultra 256GB Black',
        url: 'https://www.flipkart.com/samsung-s25-ultra-512-gb-silver/p/itm1234567890ab',
      },
    ],
  });
  const report = parseAgentResearch('Samsung S25 Ultra 256GB', resolved);
  expect(report.candidates).toHaveLength(0);
  expect(report.otherVariants).toHaveLength(1);
  expect(report.otherVariants[0].title).toContain('512 gb silver');
});

it('keeps related storage variants separate while rejecting other phone models', () => {
  const report = parseAgentResearch('Samsung S25 Ultra 256GB', {
    products: [
      ...products,
      { title: 'Samsung S24 Ultra 512GB', url: 'https://www.amazon.in/dp/B0WRONG001' },
    ],
  });
  expect(report.candidates).toHaveLength(16);
  expect(report.otherVariants).toHaveLength(16);
  expect(report.otherVariants.every((c) => c.title.includes('S25 Ultra'))).toBe(true);
});
