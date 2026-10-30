import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assistQuery,
  acceptRewrite,
  protectedTokens,
  resetGeminiForTests,
} from '../packages/providers/gemini';

const reply = (query: string, category = 'phones', status = 200) =>
  (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(_url), init });
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ query, category }) }] } }],
      }),
      { status },
    );
  }) as typeof fetch;
let calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  calls = [];
  resetGeminiForTests();
  process.env.GEMINI_API_KEY = 'test-key';
  delete process.env.GEMINI_DAILY_LIMIT;
});
afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe('protected tokens', () => {
  it('keeps every digit-bearing token', () => {
    expect(protectedTokens('iphne 16 128gb blak')).toEqual(['16', '128gb']);
    expect(protectedTokens('ISBN 978-1847941831 atomic habit')).toEqual(['978-1847941831']);
  });
  it('accepts spelling fixes that keep numbers and rejects any number change', () => {
    expect(acceptRewrite('iphne 16 128gb blak', 'iPhone 16 128GB Black')).toBe(
      'iPhone 16 128GB Black',
    );
    expect(acceptRewrite('iphne 16 128gb', 'iPhone 16 256GB')).toBeNull();
    expect(acceptRewrite('iphne 16', 'iPhone 16 Pro Max 512GB')).toBeNull();
    expect(acceptRewrite('sony xm5', 'Sony WH-1000XM5')).toBeNull();
    expect(acceptRewrite('pixel 9', 'pixel 9')).toBeNull();
    expect(acceptRewrite('pixle 9', 'https://evil.example/pixel 9')).toBeNull();
    expect(acceptRewrite('pixle 9', 'x'.repeat(200) + ' 9')).toBeNull();
    expect(acceptRewrite('pixle 9', 42)).toBeNull();
  });
});

describe('assistQuery', () => {
  it('is unavailable without a key and never calls the network', async () => {
    delete process.env.GEMINI_API_KEY;
    const r = await assistQuery('iphne 16', reply('iPhone 16'));
    expect(r).toMatchObject({ available: false, reason: 'unconfigured' });
    expect(calls).toHaveLength(0);
  });
  it('returns a validated refinement and category, sending the key only as a header', async () => {
    const r = await assistQuery('samsng galxy s24', reply('Samsung Galaxy S24'));
    expect(r).toMatchObject({
      provider: 'gemini',
      available: true,
      refined: 'Samsung Galaxy S24',
      category: 'phones',
    });
    expect(calls[0].url).not.toContain('test-key');
    expect((calls[0].init?.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
  });
  it('discards a rewrite that changes the variant', async () => {
    const r = await assistQuery('iphne 16 128gb', reply('iPhone 16 256GB'));
    expect(r.refined).toBeUndefined();
    expect(r.reason).toBe('rejected');
  });
  it('reports unchanged queries and ignores an unknown category', async () => {
    const r = await assistQuery('Pixel 9', reply('Pixel 9', 'spaceships'));
    expect(r).toMatchObject({ reason: 'unchanged' });
    expect(r.category).toBeUndefined();
  });
  it('caches answers and skips URLs and overlong text', async () => {
    const f = reply('Samsung Galaxy S24');
    await assistQuery('samsng galxy s24', f);
    const again = await assistQuery('SAMSNG galxy s24', f);
    expect(again.cached).toBe(true);
    expect(calls).toHaveLength(1);
    expect((await assistQuery('https://www.amazon.in/dp/B0', f)).reason).toBe('not_applicable');
    expect((await assistQuery('a'.repeat(300), f)).reason).toBe('not_applicable');
    expect(calls).toHaveLength(1);
  });
  it('falls back on HTTP errors, timeouts and malformed JSON without throwing', async () => {
    expect((await assistQuery('one', reply('x', 'phones', 500))).reason).toBe('error');
    const slow = (async () => {
      throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    }) as typeof fetch;
    expect((await assistQuery('two', slow)).reason).toBe('timeout');
    const junk = (async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
      )) as typeof fetch;
    expect((await assistQuery('three', junk)).reason).toBe('rejected');
  });
  it('retries once without a thinking budget when the model rejects it', async () => {
    let n = 0;
    const f = (async (_u: string | URL | Request, init?: RequestInit) => {
      n++;
      const body = JSON.parse(String(init?.body));
      if (body.generationConfig.thinkingConfig)
        return new Response('{"error":{"message":"thinking budget is not supported"}}', {
          status: 400,
        });
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ query: 'Nothing Ear', category: 'audio' }) }],
              },
            },
          ],
        }),
      );
    }) as typeof fetch;
    expect((await assistQuery('nothng ear', f)).refined).toBe('Nothing Ear');
    expect(n).toBe(2);
  });
  it('stops at the daily cap', async () => {
    process.env.GEMINI_DAILY_LIMIT = '1';
    await assistQuery('first query', reply('First query'));
    expect((await assistQuery('second query', reply('Second query'))).reason).toBe('limited');
  });
});
