import { expect, it } from 'vitest';
import { parseAgentResearch, agentResearchKey } from '../packages/providers/agent-research';
import { boundedAgentProcess } from '../packages/providers/agent-process';

it('keeps supported retailer leads, removes prices and separates variant conflicts', () => {
  const result = parseAgentResearch('Samsung S25 Ultra 256GB', {
    products: [
      { title: 'Samsung S25 Ultra 256GB', url: 'https://www.amazon.in/dp/B0TEST1234', price: 1 },
      {
        title: 'Samsung S25 Ultra 512GB',
        url: 'https://www.flipkart.com/phone/p/itmabc?pid=MOBABCDEFGHIJKLM',
      },
      { title: 'Samsung S25 Ultra 256GB Case', url: 'https://www.amazon.in/dp/B0CASE1234' },
      { title: 'duplicate', url: 'https://www.amazon.in/dp/B0TEST1234?tag=tracking' },
      { title: 'Samsung S25 Ultra 256GB', url: 'https://evil.example/p/phone' },
    ],
  });
  expect(result.candidates).toHaveLength(1);
  expect(result.otherVariants).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain('"price"');
  expect(result.candidates[0]).toMatchObject({ store: 'Amazon', status: 'DISCOVERY_UNVERIFIED' });
});

it('isolates book bindings, pack sizes and cosmetic volumes', () => {
  for (const [query, title] of [
    ['CLRS 4th edition paperback', 'CLRS 4th edition hardcover'],
    ['Cable clips pack of 1', 'Cable clips pack of 5'],
    ['Minimalist serum 30ml', 'Minimalist serum 60ml'],
  ]) {
    const r = parseAgentResearch(query, {
      products: [{ title, url: 'https://www.amazon.in/dp/B0TEST1234' }],
    });
    expect(r.candidates).toHaveLength(0);
    expect(r.otherVariants).toHaveLength(1);
  }
});

it('rejects malformed output and unrelated titles; uses a separate normalized cache namespace', () => {
  expect(() => parseAgentResearch('rtx 5060', 'junk')).toThrow();
  expect(
    parseAgentResearch('rtx 5060', {
      products: [{ title: 'Cotton shirt', url: 'https://www.amazon.in/dp/B0TEST1234' }],
    }).candidates,
  ).toEqual([]);
  expect(agentResearchKey('RTX 5060')).toBe(agentResearchKey('rtx5060'));
  expect(agentResearchKey('RTX 5060')).not.toBe(agentResearchKey('RTX 5070'));
});

it('understands budget words as search intent rather than a product model', () => {
  const r = parseAgentResearch('Cetaphil facewash under 500', {
    products: [
      { title: 'Cetaphil Gentle Skin Facewash 125ml', url: 'https://www.amazon.in/dp/B0TEST1234' },
    ],
  });
  expect(r.candidates).toHaveLength(1);
});

it('closes redirected stdin so print-mode tools waiting for EOF can complete', async () => {
  const result = await boundedAgentProcess(
    process.execPath,
    [
      '-e',
      "process.stdin.resume(); process.stdin.on('end',()=>console.log('completed-after-eof'))",
    ],
    { timeout: 1500 },
  );
  expect(result.stdout.trim()).toBe('completed-after-eof');
});

it('bounds a stuck CLI instead of keeping a research job alive indefinitely', async () => {
  await expect(
    boundedAgentProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 100 }),
  ).rejects.toMatchObject({ killed: true });
});
