import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  acceptCandidates,
  discoverWithGemini,
  resetGeminiDiscoverForTests,
} from '../packages/providers/gemini-discover';

const reply = (text: string, chunks: unknown[] = []) =>
  (async () =>
    new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text }] }, groundingMetadata: { groundingChunks: chunks } },
        ],
      }),
    )) as typeof fetch;

beforeEach(() => {
  resetGeminiDiscoverForTests();
  process.env.GEMINI_API_KEY = 'k';
});
afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe('acceptCandidates', () => {
  it('keeps only supported retailer product URLs and never trusts other links', () => {
    const out = acceptCandidates({
      products: [
        {
          title: 'Lenovo IdeaPad Slim 3',
          url: 'https://www.amazon.in/Lenovo-IdeaPad/dp/B0CX1234AB/ref=sr_1',
          price_inr: 54990,
        },
        { title: 'dupe', url: 'https://www.amazon.in/dp/B0CX1234AB', price_inr: 1 },
        { title: 'search page', url: 'https://www.amazon.in/s?k=ideapad' },
        { title: 'random shop', url: 'https://shop.example.com/p/1', price_inr: 100 },
        {
          title: 'Flipkart one',
          url: 'https://www.flipkart.com/x/p/itmabc?pid=COMABCDEFGHIJKLM',
          price_inr: 'n/a',
        },
        { title: 'no url' },
      ],
    });
    expect(out.map((c) => c.store)).toEqual(['Amazon', 'Flipkart']);
    expect(out[0]).toMatchObject({
      url: 'https://www.amazon.in/dp/B0CX1234AB',
      quotedRupees: 54990,
    });
    expect(out[1].quotedRupees).toBeNull();
    expect(acceptCandidates('junk')).toEqual([]);
  });
});

describe('discoverWithGemini', () => {
  it('returns validated candidates plus grounding sources, cached', async () => {
    const f = reply(
      'Here you go: {"products":[{"title":"Casio fx-991CW","url":"https://www.amazon.in/dp/B0BZ8XB5QF","price_inr":1595}]}',
      [{ web: { title: 'amazon.in', uri: 'https://vertexaisearch.cloud.google.com/x' } }],
    );
    const r = await discoverWithGemini('casio fx 991cw', f);
    expect(r.candidates).toHaveLength(1);
    expect(r.sources[0].title).toBe('amazon.in');
    expect((await discoverWithGemini('Casio FX 991CW', f)).cached).toBe(true);
  });
  it('reports none_found, unconfigured, URL input and upstream errors distinctly', async () => {
    expect((await discoverWithGemini('mystery thing', reply('{"products":[]}'))).reason).toBe(
      'none_found',
    );
    expect((await discoverWithGemini('https://www.amazon.in/dp/B0', reply('{}'))).reason).toBe(
      'not_applicable',
    );
    const bad = (async () =>
      new Response('{"error":{"message":"quota"}}', { status: 429 })) as typeof fetch;
    expect(await discoverWithGemini('other thing', bad)).toMatchObject({
      reason: 'error',
      detail: 'HTTP 429: quota',
    });
    delete process.env.GEMINI_API_KEY;
    expect((await discoverWithGemini('x y', reply('{}'))).reason).toBe('unconfigured');
  });
});
