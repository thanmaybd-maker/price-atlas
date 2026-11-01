import { expect, it } from 'vitest';
import {
  parseAgentResearch,
  agentResearchKey,
  reviewAgentReport,
} from '../packages/providers/agent-research';
import {
  ResearchStream,
  runResearchSession,
  researchEnvironment,
} from '../packages/providers/agent-session';
import { parseResearchPayload, resolveResearchLinks } from '../packages/providers/agent-payload';
import { matchesQuery } from '../packages/domain/search';

it('recognizes an RTX GDDR board title without confusing a laptop with a standalone graphics card', () => {
  const gpu = {
    name: 'ZOTAC GAMING GeForce RTX 5060 Twin Edge 8GB GDDR7',
    brand: 'ZOTAC',
    subtitle: '',
  };
  expect(matchesQuery(gpu, 'RTX 5060 graphics card')).toBe(true);
  expect(
    matchesQuery(
      { ...gpu, name: 'Lenovo Gaming Laptop RTX 5060 8GB GDDR7' },
      'RTX 5060 graphics card',
    ),
  ).toBe(false);
  expect(matchesQuery(gpu, 'RTX 5070 graphics card')).toBe(false);
});
const scopedInit = {
  event: 'init',
  init: {
    agent: 'price-atlas-researcher',
    permission_mode: 'request-review',
    tools: ['search_web'],
  },
};

it('takes the final complete JSON object from CLI formatting retries', () => {
  expect(
    parseResearchPayload(
      '```json\n{"products":[]}\n```\n{"products":[{"title":"GPU","url":"https://www.amazon.in/dp/B0TEST1234"}]}',
    ),
  ).toEqual({ products: [{ title: 'GPU', url: 'https://www.amazon.in/dp/B0TEST1234' }] });
});

it('resolves Google grounding redirects without following private or unsupported destinations', async () => {
  const calls: string[] = [];
  const f = (async (url, init) => {
    calls.push(String(url));
    expect(init?.redirect).toBe('manual');
    return new Response(null, {
      status: 302,
      headers: {
        location:
          calls.length === 1 ? 'https://www.amazon.in/dp/B0TEST1234' : 'http://127.0.0.1/private',
      },
    });
  }) as typeof fetch;
  const r = await resolveResearchLinks(
    {
      products: [
        {
          title: 'RTX 5060 graphics card',
          url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/public1',
        },
        {
          title: 'Private target',
          url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/public2',
        },
        { title: 'Untrusted endpoint', url: 'https://evil.example/redirect' },
      ],
    },
    f,
  );
  expect(r.products).toEqual([
    { title: 'RTX 5060 graphics card', url: 'https://www.amazon.in/dp/B0TEST1234' },
  ]);
  expect(calls).toHaveLength(2);
});

it('rejects timeout envelopes even when the CLI labels them SUCCESS', () => {
  const stream = new ResearchStream();
  stream.accept(scopedInit);
  expect(() =>
    stream.accept({
      event: 'result',
      result: { status: 'SUCCESS', finished_reason: 'print_timeout', response: '' },
    }),
  ).toThrow('timeout');
});

it('requires a scoped tool set and caps distinct tool calls', () => {
  expect(() =>
    new ResearchStream().accept({ event: 'init', init: { tools: ['search_web', 'run_command'] } }),
  ).toThrow('tools_not_scoped');
  const stream = new ResearchStream(1);
  stream.accept(scopedInit);
  const step = {
    event: 'step_update',
    step_update: { step_type: 'tool', state: 'ACTIVE', step_index: 1, tool_name: 'search_web' },
  };
  stream.accept(step);
  stream.accept(step);
  expect(() =>
    stream.accept({ ...step, step_update: { ...step.step_update, step_index: 2 } }),
  ).toThrow('tool_limit');
});

it('extracts structured completion only after scoped initialization', () => {
  const stream = new ResearchStream();
  expect(() =>
    stream.accept({ event: 'result', result: { status: 'SUCCESS', response: '{}' } }),
  ).toThrow('tools_not_scoped');
  stream.accept(scopedInit);
  expect(
    stream.accept({ event: 'result', result: { status: 'SUCCESS', response: '{"products":[]}' } }),
  ).toEqual({ products: [] });
});

it('allows global inventory metadata but rejects actual non-research tool execution', () => {
  const stream = new ResearchStream();
  stream.accept({
    ...scopedInit,
    init: { ...scopedInit.init, tools: ['search_web', 'run_command'] },
  });
  expect(() =>
    stream.accept({
      event: 'step_update',
      step_update: { step_type: 'tool', state: 'ACTIVE', step_index: 1, tool_name: 'run_command' },
    }),
  ).toThrow('tools_not_scoped');
});

it('reports headless permission refusal instead of accepting an empty SUCCESS', () => {
  const stream = new ResearchStream();
  stream.accept(scopedInit);
  expect(() =>
    stream.accept({
      event: 'result',
      result: { status: 'SUCCESS', response: '', denied_actions: [{ action: 'read_url' }] },
    }),
  ).toThrow('permission_denied');
});

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

it('refuses stale, future and URL-query replay reports before they can trigger collection', () => {
  const r = parseAgentResearch('RTX 5060', { products: [] }, 1000);
  expect(() => reviewAgentReport(r, 25 * 3600000)).toThrow('expired_report');
  expect(() => reviewAgentReport(r, 999)).toThrow('expired_report');
  expect(() =>
    reviewAgentReport({ ...r, query: 'https://www.amazon.in/dp/B0TEST1234' }, 1000),
  ).toThrow('invalid_query');
});

it('passes OS paths but excludes application and provider secrets from the agent process', () => {
  const env = researchEnvironment({
    NODE_ENV: 'test',
    Path: 'system-path',
    USERPROFILE: 'profile',
    DATABASE_URL: 'private-db',
    GEMINI_API_KEY: 'private-gemini',
    TELEGRAM_BOT_TOKEN: 'private-bot',
    REDIS_URL: 'private-redis',
  });
  expect(env).toEqual({ NODE_ENV: 'test', Path: 'system-path', USERPROFILE: 'profile' });
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
  const result = await runResearchSession(
    process.execPath,
    [
      '-e',
      `process.stdin.resume(); process.stdin.on('end',()=>{console.log(${JSON.stringify(JSON.stringify(scopedInit))});console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'{"products":[]}'}}));setInterval(()=>{},1000);})`,
    ],
    { timeout: 1500, cwd: process.cwd(), env: process.env },
  );
  expect(result.output).toEqual({ products: [] });
});

it('bounds a stuck CLI instead of keeping a research job alive indefinitely', async () => {
  await expect(
    runResearchSession(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      timeout: 100,
      cwd: process.cwd(),
      env: process.env,
    }),
  ).rejects.toThrow('timeout');
});
