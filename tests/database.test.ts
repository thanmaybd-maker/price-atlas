import { beforeAll, describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as store from '../packages/database/index';
let alice: { token: string; user: { id: string; name: string; notifications: number } };
let bob: typeof alice;
beforeAll(() => {
  process.env.ATLAS_DB_PATH = path.join(
    mkdtempSync(path.join(tmpdir(), 'price-atlas-test-')),
    'test.sqlite',
  );
  process.env.APP_MODE = 'demo';
  store.db();
  alice = store.createSession('Test Alice');
  bob = store.createSession('Test Bob');
});
describe('persistent application workflows', () => {
  it('seeds eight exact variants with two source contexts each', () => {
    expect(store.catalog()).toHaveLength(8);
    expect(store.offers()).toHaveLength(16);
    expect(store.history('pixel-9', 90)).toHaveLength(62);
  });
  it('hashes session tokens and resolves only valid sessions', () => {
    expect(store.session(alice.token)?.id).toBe(alice.user.id);
    expect(store.session('invalid')).toBeUndefined();
    const row = store
      .db()
      .prepare('SELECT token_hash FROM sessions WHERE user_id=?')
      .get(alice.user.id);
    expect(row?.token_hash).not.toBe(alice.token);
  });
  it('saves uniquely, updates collections, and enforces ownership on delete', () => {
    store.saveWatch(alice.user.id, 'pixel-9');
    store.saveWatch(alice.user.id, 'pixel-9', 'Next upgrade');
    expect(store.personal(alice.user.id).watches).toHaveLength(1);
    store.removeWatch(bob.user.id, 'pixel-9');
    expect(store.personal(alice.user.id).watches).toHaveLength(1);
    expect(store.personal(bob.user.id).watches).toHaveLength(0);
  });
  it('creates and delivers one already-met event', () => {
    const rule = store.saveRule(alice.user.id, {
      productId: 'pixel-9',
      target: 10000000,
      operator: 'lte',
      basis: 'delivered',
      store: 'all',
      enabled: true,
    });
    store.dispatch();
    const personal = store.personal(alice.user.id);
    expect(personal.notifications).toHaveLength(1);
    expect(personal.notifications[0].state).toBe('delivered');
    expect(() => store.saveRule(bob.user.id, { ...rule, target: 1 })).toThrow('Rule not found');
    store.deleteRule(bob.user.id, rule.id);
    expect(store.personal(alice.user.id).rules).toHaveLength(1);
  });
  it('collection retries create no duplicate observation or logical event', () => {
    const before = store.admin().counts.observations;
    store.collect('test-run-1');
    store.collect('test-run-1');
    expect(store.admin().counts.observations).toBe(before + 16);
    expect(store.personal(alice.user.id).notifications).toHaveLength(1);
  });
  it('a late older response never replaces the latest current offer', () => {
    const original = store.offers('pixel-9').find((o) => o.store === 'Amazon')!;
    const older = {
      ...original,
      id: 'late-observation',
      itemPrice: 1,
      observedAt: original.observedAt - 10000,
      validUntil: original.validUntil - 10000,
    };
    store.ingestObservation(older, 'late-run');
    expect(store.offers('pixel-9').find((o) => o.store === 'Amazon')?.id).toBe(original.id);
    expect(store.ingestObservation({ ...older, id: 'duplicate-late' }, 'late-run')).toBe(0);
  });
  it('an expired trigger is suppressed before dispatch', () => {
    const isolated = store.createSession('Expiry test');
    store.saveRule(isolated.user.id, {
      productId: 'ipad-air',
      target: 10000000,
      operator: 'lte',
      basis: 'delivered',
      store: 'all',
      enabled: true,
    });
    const latest = store.offers('ipad-air');
    for (const o of latest) {
      store
        .db()
        .prepare('UPDATE observations SET data=? WHERE id=?')
        .run(JSON.stringify({ ...o, validUntil: Date.now() - 1 }), o.id);
    }
    store.dispatch();
    expect(store.personal(isolated.user.id).notifications[0].state).toBe('suppressed');
    store.deleteAccount(isolated.user.id);
  });
  it('a fresh price rebound suppresses a queued target message', () => {
    const isolated = store.createSession('Rebound test');
    const original = store.offers('nothing-3a');
    store.saveRule(isolated.user.id, {
      productId: 'nothing-3a',
      target: 3000000,
      operator: 'lte',
      basis: 'delivered',
      store: 'all',
      enabled: true,
    });
    for (const o of original) {
      store
        .db()
        .prepare('UPDATE observations SET data=? WHERE id=?')
        .run(JSON.stringify({ ...o, itemPrice: 4000000 }), o.id);
    }
    store.dispatch();
    expect(store.personal(isolated.user.id).notifications[0].state).toBe('suppressed');
    store.deleteAccount(isolated.user.id);
  });
  it('suppress queued notifications after user unsubscribes', () => {
    store.saveRule(bob.user.id, {
      productId: 'sony-xm5',
      target: 10000000,
      operator: 'lte',
      basis: 'delivered',
      store: 'all',
      enabled: true,
    });
    store.preferences(bob.user.id, false);
    store.dispatch();
    expect(store.personal(bob.user.id).notifications[0].state).toBe('suppressed');
  });
  it('pause/resume does not create a second logical episode', () => {
    const old = store.personal(alice.user.id).rules[0];
    store.saveRule(alice.user.id, { ...old, enabled: false });
    store.saveRule(alice.user.id, { ...old, enabled: true });
    store.dispatch();
    expect(store.personal(alice.user.id).notifications).toHaveLength(1);
  });
  it('provider pause excludes its next scheduled collection', () => {
    store.pauseProvider('Amazon', true, 'test-operator', 'Fixture outage test');
    const run = store.collect('test-run-paused');
    expect(run.observations).toBe(8);
    store.pauseProvider('Amazon', false, 'test-operator', 'Test restored');
  });
  it('logout invalidates the server session', () => {
    store.logout(bob.token);
    expect(store.session(bob.token)).toBeUndefined();
  });
  it('account deletion cascades owned business data', () => {
    store.deleteAccount(alice.user.id);
    expect(store.personal(alice.user.id)).toEqual({ watches: [], rules: [], notifications: [] });
    expect(store.session(alice.token)).toBeUndefined();
  });
});
