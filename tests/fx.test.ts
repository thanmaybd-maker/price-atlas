import { describe, it, expect, beforeEach } from 'vitest';
import { fxReference, nativeMoney, convertMinor, resetFxForTests } from '../packages/providers/fx';
import { eligible, type Offer } from '../packages/domain/index';

const NOW = Date.parse('2026-10-30T06:00:00Z');
const ok = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

beforeEach(() => resetFxForTests());

describe('fxReference', () => {
  it('returns a dated ECB reference and caches it', async () => {
    let n = 0;
    const f = (async (url: string | URL | Request) => {
      n++;
      expect(String(url)).toBe('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
      return new Response(
        JSON.stringify({ base: 'USD', date: '2026-10-29', rates: { INR: 84.12 } }),
      );
    }) as typeof fetch;
    const r = await fxReference('USD', 'INR', f, NOW);
    expect(r).toMatchObject({ from: 'USD', to: 'INR', rate: 84.12, date: '2026-10-29' });
    await fxReference('USD', 'INR', f, NOW + 60000);
    expect(n).toBe(1);
  });
  it('rejects malformed, mismatched, stale and future answers', async () => {
    expect(
      await fxReference(
        'USD',
        'INR',
        ok({ base: 'EUR', date: '2026-10-29', rates: { INR: 90 } }),
        NOW,
      ),
    ).toBeNull();
    expect(
      await fxReference(
        'USD',
        'INR',
        ok({ base: 'USD', date: '2026-10-29', rates: { INR: -1 } }),
        NOW,
      ),
    ).toBeNull();
    expect(
      await fxReference(
        'USD',
        'INR',
        ok({ base: 'USD', date: 'yesterday', rates: { INR: 84 } }),
        NOW,
      ),
    ).toBeNull();
    expect(
      await fxReference(
        'USD',
        'INR',
        ok({ base: 'USD', date: '2026-09-01', rates: { INR: 84 } }),
        NOW,
      ),
    ).toBeNull();
    expect(
      await fxReference(
        'USD',
        'INR',
        ok({ base: 'USD', date: '2026-11-05', rates: { INR: 84 } }),
        NOW,
      ),
    ).toBeNull();
    expect(await fxReference('USD', 'INR', ok({}, 503), NOW)).toBeNull();
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    expect(await fxReference('USD', 'INR', down, NOW)).toBeNull();
  });
  it('refuses invalid codes and same-currency pairs without a request', async () => {
    let n = 0;
    const f = (async () => (n++, new Response('{}'))) as typeof fetch;
    expect(await fxReference('usd', 'INR', f, NOW)).toBeNull();
    expect(await fxReference('INR', 'INR', f, NOW)).toBeNull();
    expect(await fxReference('US', 'INR', f, NOW)).toBeNull();
    expect(n).toBe(0);
  });
});

describe('native amounts and conversion', () => {
  it('formats the native currency and converts indicatively', () => {
    expect(nativeMoney(2499, 'USD')).toBe('$24.99');
    expect(convertMinor(2499, { rate: 84.12 })).toBe(210216);
    expect(nativeMoney(100, 'xx')).toBe('Unavailable');
  });
  it('keeps international and non-INR offers out of domestic ranking', () => {
    const base: Offer = {
      id: 'o',
      productId: 'p',
      store: 'iHerb',
      itemPrice: 2499,
      shipping: null,
      charges: 0,
      discount: 0,
      currency: 'USD',
      stock: true,
      accepted: true,
      condition: 'new',
      observedAt: NOW,
      validUntil: NOW + 3600000,
      historyAllowed: true,
      alertsAllowed: true,
      displayAllowed: true,
      seller: 's',
      context: 'c',
    };
    expect(eligible(base, NOW)).toBe(false);
  });
});
