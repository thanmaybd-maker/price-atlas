import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { products } from './catalog';
import { validateObservation, demoPolicy, offerSchema } from '../providers/index';
import { evaluate, rank, total, type Offer, type Product, type Rule } from '../domain/index';

let connection: DatabaseSync;
function root() {
  let p = process.cwd();
  while (!existsSync(path.join(p, 'pnpm-workspace.yaml')) && path.dirname(p) !== p)
    p = path.dirname(p);
  return p;
}
export function db() {
  if (process.env.APP_MODE && process.env.APP_MODE !== 'demo')
    throw new Error('Live mode is not configured. Synthetic data is restricted to APP_MODE=demo.');
  if (connection) return connection;
  const file = process.env.ATLAS_DB_PATH || path.join(root(), 'data', 'atlas.sqlite');
  mkdirSync(path.dirname(file), { recursive: true });
  connection = new DatabaseSync(file);
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),store TEXT NOT NULL,run_key TEXT NOT NULL,data TEXT NOT NULL,observed_at INTEGER NOT NULL, UNIQUE(product_id,store,run_key));
 CREATE INDEX IF NOT EXISTS observations_latest ON observations(product_id,store,observed_at DESC);
 CREATE TABLE IF NOT EXISTS current_offers(product_id TEXT NOT NULL,store TEXT NOT NULL,observation_id TEXT NOT NULL REFERENCES observations(id),observed_at INTEGER NOT NULL,PRIMARY KEY(product_id,store));
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,notifications INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS watches(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,product_id TEXT NOT NULL REFERENCES products(id),collection TEXT NOT NULL DEFAULT 'My shortlist',created_at INTEGER NOT NULL,UNIQUE(user_id,product_id));
 CREATE TABLE IF NOT EXISTS rules(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,product_id TEXT NOT NULL REFERENCES products(id),data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,event_key TEXT UNIQUE NOT NULL,data TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,started_at INTEGER NOT NULL,completed_at INTEGER,status TEXT NOT NULL,observations INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS provider_state(store TEXT PRIMARY KEY,paused INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE SET NULL,product_id TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
 `);
  for (const store of ['Amazon', 'Flipkart'])
    connection.prepare('INSERT OR IGNORE INTO provider_state(store) VALUES(?)').run(store);
  if (!(connection.prepare('SELECT count(*) n FROM products').get() as { n: number }).n) seed();
  return connection;
}
function transaction<T>(fn: () => T): T {
  const c = db();
  c.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    c.exec('COMMIT');
    return result;
  } catch (e) {
    c.exec('ROLLBACK');
    throw e;
  }
}
function seed() {
  const c = connection;
  const now = Date.now();
  c.exec('BEGIN IMMEDIATE');
  try {
    for (const [i, p] of products.entries()) {
      c.prepare('INSERT INTO products VALUES(?,?,?)').run(p.id, p.slug, JSON.stringify(p));
      for (let d = 30; d >= 0; d--) {
        for (const [j, store] of (['Amazon', 'Flipkart'] as const).entries()) {
          const observedAt = now - d * 86400000;
          const modifier =
            d === 0
              ? 0
              : Math.round(((Math.sin(d * 0.6 + i) * 0.012 + d * 0.0018) * p.basePrice) / 100) *
                100;
          const offer: Offer = {
            id: `seed-${p.id}-${store}-${d}`,
            productId: p.id,
            store,
            itemPrice: p.basePrice + modifier + (j === 0 ? ((i % 3) + 1) * 50000 : 0),
            shipping: 0,
            charges: 0,
            discount: 0,
            currency: 'INR',
            stock: true,
            accepted: true,
            condition: 'new',
            observedAt,
            validUntil: observedAt + (d === 0 ? 7200000 : 86400000),
            historyAllowed: true,
            alertsAllowed: true,
            displayAllowed: true,
            seller: 'Synthetic demo seller',
            context: 'Source default location',
          };
          insertOffer(offer, `seed-${d}`);
        }
      }
    }
    c.exec('COMMIT');
  } catch (e) {
    c.exec('ROLLBACK');
    throw e;
  }
}
function insertOffer(o: Offer, run: string) {
  offerSchema.parse(o);
  const c = connection;
  const r = c
    .prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?,?)')
    .run(o.id, o.productId, o.store, run, JSON.stringify(o), o.observedAt);
  if (r.changes)
    c.prepare(
      'INSERT INTO current_offers VALUES(?,?,?,?) ON CONFLICT(product_id,store) DO UPDATE SET observation_id=excluded.observation_id,observed_at=excluded.observed_at WHERE excluded.observed_at>current_offers.observed_at',
    ).run(o.productId, o.store, o.id, o.observedAt);
  return Number(r.changes);
}
export function catalog(): Product[] {
  return db()
    .prepare('SELECT data FROM products ORDER BY rowid')
    .all()
    .map((r) => JSON.parse(r.data as string));
}
export function offers(productId?: string): Offer[] {
  return db()
    .prepare(
      `SELECT o.data FROM current_offers c JOIN observations o ON o.id=c.observation_id ${productId ? 'WHERE c.product_id=?' : ''}`,
    )
    .all(...(productId ? [productId] : []))
    .map((r) => JSON.parse(r.data as string));
}
export function history(productId: string, days = 30): Offer[] {
  return db()
    .prepare(
      'SELECT data FROM observations WHERE product_id=? AND observed_at>=? ORDER BY observed_at',
    )
    .all(productId, Date.now() - days * 86400000)
    .map((r) => JSON.parse(r.data as string))
    .filter((o) => o.historyAllowed);
}
export function findProduct(id: string) {
  return catalog().find((p) => p.id === id || p.slug === id);
}
export function createSession(name: string) {
  const token = randomUUID() + randomUUID();
  const id = randomUUID();
  transaction(() => {
    db().prepare('INSERT INTO users VALUES(?,?,1,?)').run(id, name, Date.now());
    db()
      .prepare('INSERT INTO sessions VALUES(?,?,?)')
      .run(hash(token), id, Date.now() + 30 * 86400000);
  });
  return { token, user: { id, name, notifications: 1 } };
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function session(token?: string) {
  if (!token) return null;
  return db()
    .prepare(
      'SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
    )
    .get(hash(token), Date.now()) as
    { id: string; name: string; notifications: number } | undefined;
}
export function logout(token: string) {
  db().prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));
}
export function personal(userId: string) {
  return {
    watches: db()
      .prepare('SELECT * FROM watches WHERE user_id=? ORDER BY created_at DESC')
      .all(userId),
    rules: db()
      .prepare('SELECT data FROM rules WHERE user_id=?')
      .all(userId)
      .map((r) => JSON.parse(r.data as string) as Rule),
    notifications: db()
      .prepare(
        'SELECT id,data,state,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC',
      )
      .all(userId)
      .map((r) => ({ ...r, ...JSON.parse(r.data as string) })),
  };
}
export function saveWatch(userId: string, productId: string, collection = 'My shortlist') {
  if (!findProduct(productId)) throw new Error('Product not found.');
  db()
    .prepare(
      'INSERT INTO watches VALUES(?,?,?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET collection=excluded.collection',
    )
    .run(randomUUID(), userId, productId, collection, Date.now());
}
export function removeWatch(userId: string, productId: string) {
  db().prepare('DELETE FROM watches WHERE user_id=? AND product_id=?').run(userId, productId);
}
export function saveRule(
  userId: string,
  input: {
    id?: string;
    productId: string;
    target: number;
    store: 'all' | 'Amazon' | 'Flipkart';
    basis: 'delivered' | 'item';
    operator: 'lte' | 'lt';
    enabled: boolean;
  },
) {
  return transaction(() => {
    if (!findProduct(input.productId)) throw new Error('Product not found.');
    let old: Rule | undefined;
    if (input.id) {
      const row = db()
        .prepare('SELECT data FROM rules WHERE id=? AND user_id=?')
        .get(input.id, userId);
      if (!row) throw new Error('Rule not found.');
      old = JSON.parse(row.data as string);
    }
    const material =
      !old ||
      (['productId', 'target', 'store', 'basis', 'operator'] as const).some(
        (k) => old![k] !== input[k],
      );
    const rule: Rule =
      old && !material
        ? { ...old, enabled: input.enabled }
        : {
            ...input,
            id: old?.id ?? randomUUID(),
            version: (old?.version ?? 0) + 1,
            episode: 0,
            activeEpisode: false,
            aboveCount: 0,
            lastTriggeredAt: null,
            lastEvidence: null,
          };
    db()
      .prepare('INSERT INTO rules VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
      .run(rule.id, userId, rule.productId, JSON.stringify(rule));
    saveWatch(userId, rule.productId);
    evaluateUser(userId);
    return rule;
  });
}
function evaluateUser(userId: string) {
  for (const rule of personal(userId).rules) {
    const result = evaluate(rule, offers(rule.productId));
    db()
      .prepare('UPDATE rules SET data=? WHERE id=? AND user_id=?')
      .run(JSON.stringify(result.state), rule.id, userId);
    if (result.trigger) {
      const o = result.trigger;
      const eventKey = `${rule.id}:${rule.version}:${result.state.episode}`;
      db()
        .prepare('INSERT OR IGNORE INTO notifications VALUES(?,?,?,?,?,?,?)')
        .run(
          randomUUID(),
          userId,
          rule.id,
          eventKey,
          JSON.stringify({
            productId: rule.productId,
            price: total(o, rule.basis),
            target: rule.target,
            store: o.store,
            observedAt: o.observedAt,
            ruleVersion: rule.version,
            title: 'Your target price is here',
            channel: 'in-app',
            demo: true,
          }),
          'pending',
          Date.now(),
        );
    }
  }
}
export function dispatch() {
  for (const n of db().prepare("SELECT * FROM notifications WHERE state='pending'").all()) {
    const ruleRow = db()
      .prepare('SELECT data FROM rules WHERE id=?')
      .get(n.rule_id as string);
    const user = db()
      .prepare('SELECT notifications FROM users WHERE id=?')
      .get(n.user_id as string);
    const rule = ruleRow ? (JSON.parse(ruleRow.data as string) as Rule) : null;
    const data = JSON.parse(n.data as string);
    const r = rule
      ? rank(
          offers(rule.productId).filter(
            (o) => o.alertsAllowed && (rule.store === 'all' || rule.store === o.store),
          ),
          Date.now(),
          rule.basis,
        )
      : null;
    const price = r?.lowest;
    const allowed =
      user?.notifications === 1 &&
      rule?.enabled &&
      rule.version === data.ruleVersion &&
      price != null &&
      (rule.operator === 'lte' ? price <= rule.target : price < rule.target);
    db()
      .prepare('UPDATE notifications SET state=? WHERE id=?')
      .run(allowed ? 'delivered' : 'suppressed', n.id as string);
  }
}
export function deleteRule(userId: string, id: string) {
  db().prepare('DELETE FROM rules WHERE id=? AND user_id=?').run(id, userId);
}
export function preferences(userId: string, enabled: boolean) {
  db()
    .prepare('UPDATE users SET notifications=? WHERE id=?')
    .run(enabled ? 1 : 0, userId);
}
export function deleteAccount(userId: string) {
  db().prepare('DELETE FROM users WHERE id=?').run(userId);
}
export function report(userId: string | null, productId: string, reason: string) {
  if (!findProduct(productId)) throw new Error('Product not found.');
  const id = randomUUID();
  db()
    .prepare('INSERT INTO reports VALUES(?,?,?,?,?)')
    .run(id, userId, productId, reason, Date.now());
  return id;
}
export function collect(runKey = `demo-${Math.floor(Date.now() / 60000)}`) {
  return transaction(() => {
    const prior = db().prepare('SELECT * FROM runs WHERE id=?').get(runKey);
    if (prior) return prior;
    const now = Date.now();
    db().prepare('INSERT INTO runs VALUES(?,?,NULL,?,0)').run(runKey, now, 'running');
    let count = 0;
    const paused = db()
      .prepare('SELECT store FROM provider_state WHERE paused=1')
      .all()
      .map((r) => r.store);
    for (const [i, p] of catalog().entries()) {
      for (const [j, store] of (['Amazon', 'Flipkart'] as const).entries()) {
        if (paused.includes(store)) continue;
        const cycle = Math.floor(now / 60000) % 12;
        const delta = Math.round((Math.sin(cycle * 0.5 + i) * p.basePrice * 0.007) / 100) * 100;
        const o: Offer = {
          id: randomUUID(),
          productId: p.id,
          store,
          itemPrice: p.basePrice + delta + (j === 0 ? ((i % 3) + 1) * 50000 : 0),
          shipping: 0,
          charges: 0,
          discount: 0,
          currency: 'INR',
          stock: true,
          accepted: true,
          condition: 'new',
          observedAt: now,
          validUntil: now + 7200000,
          historyAllowed: true,
          alertsAllowed: true,
          displayAllowed: true,
          seller: 'Synthetic demo seller',
          context: 'Source default location',
        };
        count += insertOffer(validateObservation(o, demoPolicy(store), now), runKey);
      }
    }
    for (const user of db().prepare('SELECT id FROM users').all()) evaluateUser(user.id as string);
    dispatch();
    db()
      .prepare('UPDATE runs SET completed_at=?,status=?,observations=? WHERE id=?')
      .run(Date.now(), 'complete', count, runKey);
    return { id: runKey, status: 'complete', observations: count };
  });
}
export function admin() {
  return {
    providers: db().prepare('SELECT * FROM provider_state').all(),
    runs: db().prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT 20').all(),
    counts: {
      products: catalog().length,
      observations: (db().prepare('SELECT count(*) n FROM observations').get() as { n: number }).n,
      rules: (db().prepare('SELECT count(*) n FROM rules').get() as { n: number }).n,
    },
    mode: 'demo',
  };
}
export function pauseProvider(store: string, paused: boolean, actor: string, reason: string) {
  transaction(() => {
    db()
      .prepare('UPDATE provider_state SET paused=? WHERE store=?')
      .run(paused ? 1 : 0, store);
    db()
      .prepare('INSERT INTO audit VALUES(?,?,?,?,?)')
      .run(randomUUID(), actor, `${paused ? 'pause' : 'resume'}:${store}`, reason, Date.now());
  });
}

export function ingestObservation(value: Offer, runKey: string) {
  return transaction(() =>
    insertOffer(validateObservation(value, demoPolicy(value.store)), runKey),
  );
}
