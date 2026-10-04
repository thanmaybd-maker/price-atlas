import { describe, it, expect } from 'vitest';
import {
  evaluate,
  exactMatch,
  rank,
  parseRetailUrl,
  total,
  type Offer,
  type Rule,
} from '../packages/domain/index';
import { demoPolicy, validateObservation } from '../packages/providers/index';
const now = 1780000000000;
const offer = (patch: Partial<Offer> = {}): Offer => ({
  id: 'obs-1',
  productId: 'phone',
  store: 'Amazon',
  itemPrice: 2500000,
  shipping: 0,
  charges: 0,
  discount: 0,
  currency: 'INR',
  stock: true,
  accepted: true,
  condition: 'new',
  observedAt: now - 1000,
  validUntil: now + 60000,
  historyAllowed: true,
  alertsAllowed: true,
  displayAllowed: true,
  seller: 'demo',
  context: 'default',
  ...patch,
});
const rule = (patch: Partial<Rule> = {}): Rule => ({
  id: 'rule',
  productId: 'phone',
  target: 2500000,
  operator: 'lte',
  basis: 'delivered',
  store: 'all',
  enabled: true,
  version: 1,
  episode: 0,
  activeEpisode: false,
  aboveCount: 0,
  lastTriggeredAt: null,
  ...patch,
});
describe('exact identity', () => {
  it.each(['Storage', 'RAM', 'Color', 'Condition', 'Pack'])('rejects conflicting %s', (key) => {
    expect(
      exactMatch({ Model: 'Pixel 9', [key]: 'a' }, { Model: 'Pixel 9', [key]: 'b' }, ['Model', key])
        .decision,
    ).toBe('rejected');
  });
  it('requires decisive missing attributes to be reviewed', () =>
    expect(
      exactMatch({ Model: 'Pixel 9' }, { Model: 'Pixel 9', Storage: '128 GB' }, [
        'Model',
        'Storage',
      ]).decision,
    ).toBe('review'));
  it('normalizes harmless spacing and case', () =>
    expect(exactMatch({ Model: ' PIXEL 9 ' }, { Model: 'pixel9' }, ['Model']).decision).toBe(
      'accepted',
    ));
});
describe('price correctness', () => {
  it('ranks delivered totals, not item price', () =>
    expect(
      rank(
        [
          offer({ id: 'a', itemPrice: 10000, shipping: 5000 }),
          offer({ id: 'b', itemPrice: 12000, shipping: 1000 }),
        ],
        now,
      ).winners[0].id,
    ).toBe('b'));
  it('does not invent zero shipping', () => {
    const o = offer({ shipping: null });
    expect(total(o)).toBeNull();
    expect(rank([o], now).lowest).toBeNull();
    expect(rank([o], now, 'item').lowest).toBe(2500000);
  });
  it('shows ties explicitly', () =>
    expect(rank([offer(), offer({ id: 'b', store: 'Flipkart' })], now).winners).toHaveLength(2));
  it.each([
    { stock: false },
    { accepted: false },
    { condition: 'used' },
    { currency: 'USD' },
    { displayAllowed: false },
    { validUntil: now },
    { observedAt: now + 1 },
  ])('excludes ineligible offer %o', (patch) =>
    expect(rank([offer(patch)], now).offers).toHaveLength(0),
  );
  it('handles partial source availability', () => {
    const r = rank([offer(), offer({ id: 'b', validUntil: now - 1 })], now);
    expect(r.offers).toHaveLength(1);
    expect(r.partial).toBe(true);
  });
  it('uses exact integer arithmetic for paise', () =>
    expect(total(offer({ itemPrice: 10001, shipping: 201, charges: 31, discount: 11 }))).toBe(
      10222,
    ));
});
describe('target episodes', () => {
  it('triggers at equality for <= but not <', () => {
    expect(evaluate(rule(), [offer()], now).trigger).not.toBeNull();
    expect(evaluate(rule({ operator: 'lt' }), [offer()], now).trigger).toBeNull();
  });
  it('does not repeat within an episode', () => {
    const first = evaluate(rule(), [offer()], now);
    expect(first.state.episode).toBe(1);
    expect(evaluate(first.state, [offer({ id: 'obs-2' })], now + 1).trigger).toBeNull();
  });
  it('stale gaps neither trigger nor re-arm', () => {
    const first = evaluate(rule(), [offer()], now);
    const gap = evaluate(first.state, [offer({ validUntil: now })], now + 1);
    expect(gap.state.activeEpisode).toBe(true);
    expect(evaluate(gap.state, [offer({ id: 'new' })], now + 2).trigger).toBeNull();
  });
  it('requires two distinct above-target observations and cooldown', () => {
    const active = rule({ activeEpisode: true, lastTriggeredAt: now - 86400000, episode: 1 });
    const high = offer({ id: 'high-1', itemPrice: 2600000 });
    const one = evaluate(active, [high], now).state;
    expect(one.activeEpisode).toBe(true);
    const repeated = evaluate(one, [high], now).state;
    expect(repeated.aboveCount).toBe(1);
    const two = evaluate(repeated, [offer({ id: 'high-2', itemPrice: 2600000 })], now).state;
    expect(two.activeEpisode).toBe(false);
    expect(evaluate(two, [offer({ id: 'low' })], now).state.episode).toBe(2);
  });
  it('does not re-arm before cooldown', () => {
    const r = rule({ activeEpisode: true, lastTriggeredAt: now - 60000, aboveCount: 1 });
    expect(evaluate(r, [offer({ itemPrice: 2600000 })], now).state.activeEpisode).toBe(true);
  });
  it('respects pause, source scope, permission, and product identity', () => {
    expect(evaluate(rule({ enabled: false }), [offer()], now).trigger).toBeNull();
    expect(evaluate(rule({ store: 'Flipkart' }), [offer()], now).trigger).toBeNull();
    expect(evaluate(rule(), [offer({ alertsAllowed: false })], now).trigger).toBeNull();
    expect(evaluate(rule(), [offer({ productId: 'other' })], now).trigger).toBeNull();
  });
});
describe('URL boundary', () => {
  it('extracts supported identifiers without fetching', () => {
    expect(parseRetailUrl('https://www.amazon.in/dp/B012345678?tag=test').externalId).toBe(
      'B012345678',
    );
    expect(parseRetailUrl('https://www.flipkart.com/test/p/test?pid=MOB123456789').store).toBe(
      'Flipkart',
    );
  });
  it.each([
    'http://amazon.in/dp/B012345678',
    'https://amazon.in.evil.com/dp/B012345678',
    'https://127.0.0.1/dp/B012345678',
    'https://169.254.169.254/latest/meta-data',
    'https://amazon.in@evil.com/dp/B012345678',
    'https://amazon.in:8443/dp/B012345678',
    'https://amzn.in/a/test',
    'file:///etc/passwd',
    'not a url',
  ])('rejects unsafe or unsupported URL %s', (url) => expect(() => parseRetailUrl(url)).toThrow());
});
describe('provider validation', () => {
  it.each([
    { itemPrice: -1 },
    { itemPrice: 0 },
    { itemPrice: 1.1 },
    { currency: 'USD' },
    { discount: 2600000 },
    { observedAt: now + 1 },
    { store: 'Flipkart' },
  ])('rejects malformed source observation %o', (patch) =>
    expect(() => validateObservation(offer(patch), demoPolicy('Amazon'), now)).toThrow(),
  );
  it('caps display expiry against underlying provider timestamp', () => {
    const policy = { ...demoPolicy('Amazon'), displayTtlSeconds: 10 };
    expect(
      validateObservation(offer({ validUntil: now + 999999999 }), policy, now).validUntil,
    ).toBe(now + 9000);
  });
  it('permission revocation removes history and alerts', () => {
    const result = validateObservation(
      offer(),
      { ...demoPolicy('Amazon'), history: false, alerts: false },
      now,
    );
    expect(result.historyAllowed).toBe(false);
    expect(result.alertsAllowed).toBe(false);
  });
});
