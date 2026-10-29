import { afterEach, expect, it, vi } from 'vitest';
import { knownApiPath, knownPagePath } from '../packages/domain/routes';
import { historyEvidence } from '../packages/domain/evidence';
import { matchesQuery } from '../packages/domain/search';
import { localState, sessionState } from '../apps/web/lib/browser-storage';
import { visiblePoll } from '../apps/web/lib/visible-poll';
import type { Product, Offer } from '../packages/domain/index';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('rejects model prefixes without breaking spaced Plus models or hyphenated ISBNs', () => {
  const p = (name: string, attributes = {}) => ({ name, brand: '', subtitle: '', attributes });
  expect(matchesQuery(p('Casio FX991CWPLUS'), 'fx-991cw')).toBe(false);
  expect(matchesQuery(p('Sony WH-1000XM50'), 'WH1000XM5')).toBe(false);
  expect(matchesQuery(p('Casio FX-991ES Plus'), 'FX991ESPlus')).toBe(true);
  expect(matchesQuery(p('Algorithms', { ISBN: '9780262046305' }), '978-0-262-04630-5')).toBe(true);
  expect(matchesQuery(p('Algorithms', { ISBN: '978-0-262-04630-5' }), '9780262046305')).toBe(true);
  expect(matchesQuery(p('Algorithms', { ISBN: '9780262046305' }), '9780262046306')).toBe(false);
});

it('recognizes actual pages and API paths, rejecting accidental suffix aliases', () => {
  for (const path of [
    '/',
    '/search',
    '/p/casio-calculator',
    '/category/beauty',
    '/auth/callback',
    '/unsubscribe',
  ])
    expect(knownPagePath(path), path).toBe(true);
  for (const path of ['/not-a-page', '/category/missing', '/p/a/extra', '/p/%2Fbad', '/%malformed'])
    expect(knownPagePath(path), path).toBe(false);
  for (const path of ['health', 'offers', 'products/id', 'catalog/status', 'admin/retry'])
    expect(knownApiPath(path.split('/')), path).toBe(true);
  for (const path of [
    'health/extra',
    'session/surprise',
    'search/extra',
    'catalog/nonsense',
    'products/id/extra',
  ])
    expect(knownApiPath(path.split('/')), path).toBe(false);
});

it('keeps recorded CSV evidence honest about unknown shipping and excludes unsafe comparison groups', () => {
  const now = 1793200000000;
  const product = { id: 'serum', name: '=HYPERLINK("bad")' } as Product;
  const observation: Offer = {
    id: 'o1',
    productId: 'serum',
    store: 'Nykaa',
    itemPrice: 59900,
    shipping: null,
    charges: 0,
    discount: 0,
    currency: 'INR',
    stock: true,
    accepted: true,
    condition: 'new',
    observedAt: now - 1000,
    validUntil: now - 100,
    historyAllowed: true,
    alertsAllowed: false,
    displayAllowed: true,
    seller: 'Source',
    context: 'default',
    purchaseUrl: 'https://www.nykaa.com/serum/p/123',
  };
  const excluded = [
    { ...observation, productId: 'other' },
    { ...observation, historyAllowed: false },
    { ...observation, accepted: false },
    { ...observation, condition: 'used' as const },
    { ...observation, currency: 'USD' },
    { ...observation, store: 'iHerb' as const },
    { ...observation, observedAt: now + 1000 },
  ];
  const delivered = historyEvidence(product, [observation, ...excluded], 'delivered', now);
  expect(delivered.split('\r\n')).toHaveLength(3);
  expect(delivered).toContain('"\'=HYPERLINK(""bad"")"');
  expect(delivered).toContain('"599.00","Unknown","0.00","delivered","Unknown"');
  expect(delivered).toContain(new Date(now - 1000).toISOString());
  expect(historyEvidence(product, [observation], 'item', now)).toContain('"item","599.00"');
});

it('continues without browser storage when access is denied or quota is exhausted', () => {
  for (const kind of ['localStorage', 'sessionStorage'])
    vi.stubGlobal(kind, {
      getItem() {
        throw Error('denied');
      },
      setItem() {
        throw Error('quota');
      },
      removeItem() {
        throw Error('denied');
      },
    });
  for (const storage of [localState, sessionState]) {
    expect(storage.getItem('test')).toBeNull();
    expect(() => storage.setItem('test', 'value')).not.toThrow();
    expect(() => storage.removeItem('test')).not.toThrow();
  }
});

it('does not poll hidden tabs or overlap slow requests, and removes its listener on disposal', async () => {
  vi.useFakeTimers();
  const document = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
  vi.stubGlobal('document', document);
  let resolve: (() => void) | undefined;
  const work = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const stop = visiblePoll(work, 1000);
  await vi.advanceTimersByTimeAsync(3000);
  expect(work).not.toHaveBeenCalled();
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(3000);
  expect(work).toHaveBeenCalledTimes(1);
  resolve?.();
  await vi.advanceTimersByTimeAsync(1000);
  expect(work).toHaveBeenCalledTimes(2);
  stop();
  resolve?.();
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(3000);
  expect(work).toHaveBeenCalledTimes(2);
});
