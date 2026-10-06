import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { evaluate, rank, total, type Offer, type Product, type Rule } from '../domain/index';
import { listingKey, observationKey, type ScrapedProduct } from '../providers/scraper';
import { categoryFor, compareAttributes, normalizedAttributes } from '../matching/index';
import { livePolicy } from '../providers/live';
let pool: Pool;
export function useTestDatabase(value: Pool) {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('Test database injection is restricted to tests.');
  pool = value;
}
export function postgres() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for live mode.');
  return (pool ||= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_SIZE || 3),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 20000,
  }));
}
export async function tx<T>(fn: (c: PoolClient) => Promise<T>, userId?: string): Promise<T> {
  const c = await postgres().connect();
  try {
    await c.query('BEGIN');
    if (userId) {
      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Invalid account identity.');
      await c.query('SET LOCAL ROLE atlas_request');
      await c.query("SELECT set_config('atlas.user_id',$1,true)", [userId]);
    }
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    c.release();
  }
}
export type Account = {
  id: string;
  name: string;
  email?: string;
  notifications: number;
  email_enabled?: boolean;
};
export async function syncAccount(user: {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  user_metadata?: Record<string, unknown>;
}) {
  if (!user.email || !user.email_confirmed_at)
    throw new Error('Verify your email before saving targets.');
  return tx(async (c) => {
    if ((await c.query('SELECT 1 FROM atlas.tombstones WHERE user_id=$1', [user.id])).rows.length)
      throw new Error('This account was deleted. Contact support to create a new account.');
    const name = String(user.user_metadata?.full_name || user.email!.split('@')[0]).slice(0, 60);
    return (
      await c.query(
        'INSERT INTO atlas.users(id,name,email,verified,created_at) VALUES($1,$2,$3,true,$4) ON CONFLICT(id) DO UPDATE SET email=excluded.email,verified=true RETURNING id,name,email,notifications,email_enabled',
        [user.id, name, user.email, Date.now()],
      )
    ).rows[0] as Account;
  });
}
export async function catalog(): Promise<Product[]> {
  return (
    await postgres().query(
      'SELECT data FROM atlas.products p WHERE EXISTS(SELECT 1 FROM atlas.listings l WHERE l.product_id=p.id) ORDER BY created_at DESC,id',
    )
  ).rows.map((r) => r.data);
}
export async function offers(productId?: string): Promise<Offer[]> {
  return (
    await postgres().query(
      `SELECT o.data FROM atlas.current_offers c JOIN atlas.observations o ON o.id=c.observation_id JOIN atlas.listings l ON l.id=c.listing_id JOIN atlas.provider_state s ON s.store=l.store WHERE l.match_state='accepted' AND s.paused=0 ${productId ? 'AND o.product_id=$1' : ''}`,
      productId ? [productId] : [],
    )
  ).rows.map((r) => {
    const offer = r.data as Offer;
    const policy = livePolicy(offer.store);
    return {
      ...offer,
      displayAllowed: offer.displayAllowed && policy.currentPrices,
      alertsAllowed: offer.alertsAllowed && policy.alerts,
      historyAllowed: offer.historyAllowed && policy.history,
      validUntil: Math.min(offer.validUntil, offer.observedAt + policy.displayTtlSeconds * 1000),
    };
  });
}
export async function findProduct(id: string) {
  return (await postgres().query('SELECT data FROM atlas.products WHERE id=$1 OR slug=$1', [id]))
    .rows[0]?.data as Product | undefined;
}
export async function history(id: string, days = 30): Promise<Offer[]> {
  return (
    await postgres().query(
      "SELECT data FROM atlas.observations WHERE product_id=$1 AND observed_at>=$2 AND expires_at>$3 AND (data->>'historyAllowed')::boolean ORDER BY observed_at",
      [id, Date.now() - days * 86400000, Date.now()],
    )
  ).rows
    .map((r) => r.data)
    .filter((o: Offer) => {
      const p = livePolicy(o.store);
      return p.history && o.observedAt > Date.now() - p.historyRetentionDays * 86400000;
    });
}
export async function personal(userId: string) {
  return tx(
    async (c) => ({
      watches: (await c.query('SELECT * FROM atlas.watches ORDER BY created_at DESC')).rows,
      rules: (await c.query('SELECT data FROM atlas.rules')).rows.map((r) => r.data as Rule),
      notifications: (
        await c.query(
          'SELECT id,data,state,email_state,created_at FROM atlas.notifications ORDER BY created_at DESC LIMIT 100',
        )
      ).rows.map((r) => ({ ...r, ...r.data, created_at: Number(r.created_at) })),
    }),
    userId,
  );
}
export async function saveWatch(userId: string, productId: string, collection = 'My shortlist') {
  return tx(async (c) => {
    await c.query(
      'INSERT INTO atlas.watches VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,product_id) DO UPDATE SET collection=excluded.collection',
      [randomUUID(), userId, productId, collection, Date.now()],
    );
  }, userId);
}
export async function removeWatch(userId: string, id: string) {
  return tx(async (c) => {
    await c.query('DELETE FROM atlas.watches WHERE product_id=$1', [id]);
  }, userId);
}
export type RuleInput = Pick<
  Rule,
  'productId' | 'target' | 'store' | 'basis' | 'operator' | 'enabled'
> & { id?: string };
export async function saveRule(userId: string, input: RuleInput) {
  const rule = await tx(async (c) => {
    const old = input.id
      ? ((await c.query('SELECT data FROM atlas.rules WHERE id=$1 FOR UPDATE', [input.id])).rows[0]
          ?.data as Rule | undefined)
      : undefined;
    if (input.id && !old) throw new Error('Rule not found.');
    const material =
      !old ||
      (['productId', 'target', 'store', 'basis', 'operator'] as const).some(
        (k) => old[k] !== input[k],
      );
    const rule: Rule =
      old && !material
        ? { ...old, enabled: input.enabled }
        : {
            ...input,
            id: old?.id || randomUUID(),
            version: (old?.version || 0) + 1,
            episode: 0,
            activeEpisode: false,
            aboveCount: 0,
            lastTriggeredAt: null,
            lastEvidence: null,
          };
    await c.query(
      'INSERT INTO atlas.rules VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET product_id=excluded.product_id,data=excluded.data',
      [rule.id, userId, rule.productId, rule],
    );
    await c.query(
      "INSERT INTO atlas.watches VALUES($1,$2,$3,'My shortlist',$4) ON CONFLICT(user_id,product_id) DO NOTHING",
      [randomUUID(), userId, rule.productId, Date.now()],
    );
    return rule;
  }, userId);
  await evaluateProduct(rule.productId);
  return rule;
}
export async function deleteRule(userId: string, id: string) {
  return tx(async (c) => {
    await c.query('DELETE FROM atlas.rules WHERE id=$1', [id]);
  }, userId);
}
export async function preferences(userId: string, enabled: boolean, emailEnabled?: boolean) {
  return tx(async (c) => {
    await c.query(
      'UPDATE atlas.users SET notifications=$1,email_enabled=COALESCE($2,email_enabled) WHERE id=$3',
      [enabled ? 1 : 0, emailEnabled ?? null, userId],
    );
  }, userId);
}
export async function deleteAccount(userId: string) {
  return tx(async (c) => {
    await c.query('INSERT INTO atlas.tombstones VALUES($1,$2) ON CONFLICT DO NOTHING', [
      userId,
      Date.now(),
    ]);
    await c.query('DELETE FROM atlas.users WHERE id=$1', [userId]);
  });
}
export async function report(userId: string | null, productId: string, reason: string) {
  const id = randomUUID();
  await tx(async (c) => {
    await c.query('INSERT INTO atlas.reports VALUES($1,$2,$3,$4,$5)', [
      id,
      userId,
      productId,
      reason,
      Date.now(),
    ]);
  }, userId || undefined);
  return id;
}
export async function importScraped(scraped: ScrapedProduct, runKey: string) {
  const id = listingKey(scraped);
  const policy = livePolicy(scraped.store);
  const result = await tx(async (c) => {
    // Serialize same-listing imports so simultaneous browser submissions dedupe.
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [id]);
    const prior = (await c.query('SELECT * FROM atlas.listings WHERE id=$1', [id])).rows[0];
    const category = categoryFor(scraped.title, scraped.attributes);
    const attributes = {
      ...normalizedAttributes(scraped.attributes),
      Condition: scraped.condition,
    };
    let productId: string = prior?.product_id || id;
    if (
      !prior &&
      policy.matching &&
      livePolicy(scraped.store === 'Amazon' ? 'Flipkart' : 'Amazon').matching &&
      scraped.condition === 'new'
    ) {
      // Serialize candidate selection so concurrent store imports cannot split one variant.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`match:${category}`]);
      const candidates = (
        await c.query(
          "SELECT p.id,p.data FROM atlas.products p WHERE p.data->>'category'=$1 AND EXISTS(SELECT 1 FROM atlas.listings l WHERE l.product_id=p.id AND l.store<>$2 AND l.match_state='accepted')",
          [category, scraped.store],
        )
      ).rows;
      const matches = candidates.filter(
        (p) =>
          p.data.attributes?.Condition === 'new' &&
          compareAttributes(category, p.data.attributes, attributes).decision === 'accepted',
      );
      if (matches.length === 1) productId = matches[0].id;
    }
    const product: Product = {
      id: productId,
      slug: id,
      name: scraped.title,
      brand: scraped.attributes.Brand || scraped.attributes['Brand Name'] || 'Unknown brand',
      category,
      color: scraped.attributes.Colour || scraped.attributes.Color || 'Not supplied',
      subtitle:
        scraped.attributes['Model Name'] ||
        `${scraped.store} listing · variant details from source`,
      description:
        'Imported retailer listing. Offers are comparable only after exact variant matching.',
      attributes,
      basePrice: scraped.itemPrice || 0,
      accent: '#047857',
      imageUrl: scraped.imageUrl || undefined,
      sourceKind: 'live',
    };
    if (productId === id)
      await c.query(
        'INSERT INTO atlas.products VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        [productId, id, product, Date.now()],
      );
    await c.query(
      'INSERT INTO atlas.listings(id,product_id,store,external_id,url,evidence,next_check,last_success) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET evidence=excluded.evidence,last_success=excluded.last_success,failures=0,next_check=excluded.next_check',
      [
        id,
        productId,
        scraped.store,
        scraped.externalId,
        scraped.url,
        {
          attributes: scraped.attributes,
          title: scraped.title,
          parserVersion: scraped.parserVersion,
          condition: scraped.condition,
          imageUrl: scraped.imageUrl,
        },
        Date.now() + Number(process.env.CATALOG_INTERVAL_MINUTES || 1440) * 60000,
        Date.now(),
      ],
    );
    if (scraped.itemPrice === null) {
      await c.query('DELETE FROM atlas.current_offers WHERE listing_id=$1', [id]);
      return { productId, observations: 0 };
    }
    const offer: Offer = {
      id: observationKey(id, runKey),
      productId,
      store: scraped.store,
      itemPrice: scraped.itemPrice,
      shipping: scraped.shipping,
      charges: scraped.charges,
      discount: 0,
      currency: 'INR',
      stock: scraped.stock === true,
      accepted: prior?.match_state !== 'rejected' && prior?.match_state !== 'review',
      condition: scraped.condition,
      observedAt: scraped.observedAt,
      validUntil: scraped.observedAt + policy.displayTtlSeconds * 1000,
      historyAllowed: policy.history,
      alertsAllowed: policy.alerts,
      displayAllowed: policy.currentPrices,
      seller: scraped.seller,
      context: 'Retailer default location; your pincode not checked',
      purchaseUrl: scraped.url,
    };
    const current = (
      await c.query(
        'SELECT o.data FROM atlas.current_offers p JOIN atlas.observations o ON o.id=p.observation_id WHERE p.listing_id=$1',
        [id],
      )
    ).rows[0]?.data as Offer | undefined;
    if (
      current &&
      offer.stock &&
      Math.abs(offer.itemPrice - current.itemPrice) / current.itemPrice > 0.5
    ) {
      await c.query(
        "INSERT INTO atlas.quarantine VALUES($1,$2,$3,$4,'review',$5) ON CONFLICT DO NOTHING",
        [
          offer.id,
          id,
          offer,
          'Price changed by more than 50%; operator verification required',
          Date.now(),
        ],
      );
      return { productId, observations: 0, quarantined: true };
    }
    const inserted = await c.query(
      'INSERT INTO atlas.observations VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
      [
        offer.id,
        productId,
        id,
        runKey,
        offer,
        offer.observedAt,
        offer.observedAt +
          (policy.history
            ? policy.historyRetentionDays * 86400000
            : policy.displayTtlSeconds * 1000),
      ],
    );
    if (inserted.rowCount)
      await c.query(
        'INSERT INTO atlas.current_offers VALUES($1,$2,$3) ON CONFLICT(listing_id) DO UPDATE SET observation_id=excluded.observation_id,observed_at=excluded.observed_at WHERE excluded.observed_at>atlas.current_offers.observed_at',
        [id, offer.id, offer.observedAt],
      );
    return { productId, observations: inserted.rowCount || 0 };
  });
  await evaluateProduct(result.productId);
  return { ...result, product: await findProduct(result.productId) };
}
export async function evaluateProduct(productId: string) {
  const current = await offers(productId);
  const product = await findProduct(productId);
  await tx(async (c) => {
    const rules = await c.query(
      'SELECT * FROM atlas.rules WHERE product_id=$1 ORDER BY id FOR UPDATE',
      [productId],
    );
    for (const row of rules.rows) {
      const rule = row.data as Rule;
      const result = evaluate(rule, current);
      await c.query('UPDATE atlas.rules SET data=$1 WHERE id=$2', [result.state, rule.id]);
      if (result.trigger)
        await c.query(
          'INSERT INTO atlas.notifications(id,user_id,rule_id,event_key,data,next_attempt,created_at) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(event_key) DO NOTHING',
          [
            randomUUID(),
            row.user_id,
            rule.id,
            `${rule.id}:${rule.version}:${result.state.episode}`,
            {
              productId,
              price: total(result.trigger, rule.basis),
              target: rule.target,
              store: result.trigger.store,
              observedAt: result.trigger.observedAt,
              ruleVersion: rule.version,
              title: product?.name || 'Your target price is here',
              channel: 'in-app',
              demo: false,
            },
            Date.now(),
          ],
        );
    }
  });
}
export async function dispatch() {
  const pending = (
    await postgres().query("SELECT * FROM atlas.notifications WHERE state='pending'")
  ).rows;
  for (const n of pending) {
    const user = (
      await postgres().query('SELECT notifications FROM atlas.users WHERE id=$1', [n.user_id])
    ).rows[0];
    const rule = (await postgres().query('SELECT data FROM atlas.rules WHERE id=$1', [n.rule_id]))
      .rows[0]?.data as Rule | undefined;
    const price = rule
      ? rank(
          (await offers(rule.productId)).filter(
            (o) => o.alertsAllowed && (rule.store === 'all' || o.store === rule.store),
          ),
          Date.now(),
          rule.basis,
        ).lowest
      : null;
    const allowed =
      user?.notifications === 1 &&
      rule?.enabled &&
      rule.version === n.data.ruleVersion &&
      price !== null &&
      (rule.operator === 'lte' ? price <= rule.target : price < rule.target);
    await postgres().query('UPDATE atlas.notifications SET state=$2 WHERE id=$1', [
      n.id,
      allowed ? 'delivered' : 'suppressed',
    ]);
  }
}
export async function admin() {
  const [providers, runs, counts, listings, quarantine, jobs, telegram] = await Promise.all([
    postgres().query('SELECT store,paused,last_error FROM atlas.provider_state ORDER BY store'),
    postgres().query('SELECT * FROM atlas.runs ORDER BY started_at DESC LIMIT 20'),
    postgres().query(
      'SELECT (SELECT count(*) FROM atlas.products)::int products,(SELECT count(*) FROM atlas.observations)::int observations,(SELECT count(*) FROM atlas.rules)::int rules',
    ),
    postgres().query(
      'SELECT id,product_id,store,external_id,url,evidence,match_state,failures,last_success FROM atlas.listings ORDER BY next_check LIMIT 100',
    ),
    postgres().query(
      "SELECT id,listing_id,data,reason FROM atlas.quarantine WHERE state='review' ORDER BY created_at LIMIT 50",
    ),
    postgres().query(
      "SELECT id,kind,state,last_error,attempts FROM atlas.jobs WHERE state='failed' ORDER BY created_at DESC LIMIT 50",
    ),
    postgres().query(
      "SELECT notification_id,state,last_error,attempts FROM atlas.telegram_deliveries WHERE state IN ('failed','review') ORDER BY next_attempt LIMIT 50",
    ),
  ]);
  return {
    providers: providers.rows,
    runs: runs.rows.map((r) => ({ ...r, started_at: Number(r.started_at) })),
    counts: counts.rows[0],
    mode: 'live',
    listings: listings.rows,
    quarantine: quarantine.rows,
    jobs: jobs.rows,
    telegram: telegram.rows,
    capabilities: (['Amazon', 'Flipkart'] as const).map((store) => livePolicy(store)),
  };
}
export async function reviewAnomaly(id: string, accept: boolean, actor: string, reason: string) {
  const productId = await tx(async (c) => {
    const n = (
      await c.query("SELECT * FROM atlas.quarantine WHERE id=$1 AND state='review' FOR UPDATE", [
        id,
      ])
    ).rows[0];
    if (!n) throw new Error('Review item not found.');
    const o = n.data as Offer;
    const policy = livePolicy(o.store);
    if (accept) {
      if (o.validUntil <= Date.now() || !policy.currentPrices)
        throw new Error('This observation expired. Refresh the listing before approval.');
      const listing = (
        await c.query("SELECT * FROM atlas.listings WHERE id=$1 AND match_state='accepted'", [
          n.listing_id,
        ])
      ).rows[0];
      if (!listing || listing.product_id !== o.productId)
        throw new Error('Listing identity changed. Collect a new observation.');
      await c.query(
        'INSERT INTO atlas.observations VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
        [
          o.id,
          o.productId,
          n.listing_id,
          `review-${id}`,
          o,
          o.observedAt,
          o.observedAt +
            (policy.history
              ? policy.historyRetentionDays * 86400000
              : policy.displayTtlSeconds * 1000),
        ],
      );
      await c.query(
        'INSERT INTO atlas.current_offers VALUES($1,$2,$3) ON CONFLICT(listing_id) DO UPDATE SET observation_id=excluded.observation_id,observed_at=excluded.observed_at WHERE excluded.observed_at>atlas.current_offers.observed_at',
        [n.listing_id, o.id, o.observedAt],
      );
    }
    await c.query('UPDATE atlas.quarantine SET state=$2 WHERE id=$1', [
      id,
      accept ? 'accepted' : 'rejected',
    ]);
    await c.query('INSERT INTO atlas.audit VALUES($1,$2,$3,$4,$5)', [
      randomUUID(),
      actor,
      `anomaly:${id}:${accept ? 'accept' : 'reject'}`,
      reason,
      Date.now(),
    ]);
    return o.productId;
  });
  if (accept) await evaluateProduct(productId);
}
export async function retryJob(id: string, actor: string, reason: string) {
  await tx(async (c) => {
    await c.query(
      "UPDATE atlas.jobs SET state='pending',available_at=$2,attempts=0 WHERE id=$1 AND state='failed'",
      [id, Date.now()],
    );
    await c.query('INSERT INTO atlas.audit VALUES($1,$2,$3,$4,$5)', [
      randomUUID(),
      actor,
      `retry:${id}`,
      reason,
      Date.now(),
    ]);
  });
}
export async function pauseProvider(store: string, paused: boolean, actor: string, reason: string) {
  return tx(async (c) => {
    await c.query('UPDATE atlas.provider_state SET paused=$1 WHERE store=$2', [
      paused ? 1 : 0,
      store,
    ]);
    await c.query('INSERT INTO atlas.audit VALUES($1,$2,$3,$4,$5)', [
      randomUUID(),
      actor,
      `${paused ? 'pause' : 'resume'}:${store}`,
      reason,
      Date.now(),
    ]);
  });
}
export async function collect(runKey = `live-${Math.floor(Date.now() / 60000)}`) {
  const now = Date.now();
  return tx(async (c) => {
    await c.query(
      "INSERT INTO atlas.runs(id,started_at,status) VALUES($1,$2,'scheduled') ON CONFLICT DO NOTHING",
      [runKey, now],
    );
    const due = await c.query(
      "SELECT l.id,l.url,EXISTS(SELECT 1 FROM atlas.rules r WHERE r.product_id=l.product_id AND (r.data->>'enabled')::boolean) AS tracked FROM atlas.listings l JOIN atlas.provider_state s ON s.store=l.store WHERE l.next_check<=$1 AND s.paused=0 ORDER BY tracked DESC,l.next_check LIMIT 100 FOR UPDATE OF l SKIP LOCKED",
      [now],
    );
    for (const l of due.rows) {
      await c.query(
        "INSERT INTO atlas.jobs VALUES($1,'collect',$2,'pending',$3,NULL,0,NULL,$3) ON CONFLICT DO NOTHING",
        [observationKey(l.id, runKey), { listingId: l.id, url: l.url, runKey }, now],
      );
      await c.query('UPDATE atlas.listings SET next_check=$1 WHERE id=$2', [
        now +
          Number(
            l.tracked
              ? process.env.COLLECTION_INTERVAL_MINUTES || 60
              : process.env.CATALOG_INTERVAL_MINUTES || 1440,
          ) *
            60000,
        l.id,
      ]);
    }
    await c.query(
      "UPDATE atlas.runs SET status='complete',completed_at=$2 WHERE id=$1 AND status='scheduled' AND NOT EXISTS(SELECT 1 FROM atlas.jobs WHERE payload->>'runKey'=$1)",
      [runKey, now],
    );
    return {
      id: runKey,
      status: due.rows.length ? 'scheduled' : 'complete',
      observations: 0,
      jobs: due.rows.length,
    };
  });
}
export async function reviewMatch(
  listingId: string,
  productId: string,
  actor: string,
  reason: string,
) {
  return tx(async (c) => {
    const listing = (
      await c.query('SELECT * FROM atlas.listings WHERE id=$1 FOR UPDATE', [listingId])
    ).rows[0];
    const product = (await c.query('SELECT data FROM atlas.products WHERE id=$1', [productId]))
      .rows[0]?.data as Product | undefined;
    if (!listing || !product) throw new Error('Listing or product not found.');
    if (
      !livePolicy(listing.store).matching ||
      product.attributes.Condition !== 'new' ||
      listing.evidence.condition !== 'new'
    )
      throw new Error(
        'Matching requires enabled source capabilities and confirmed new condition on both listings.',
      );
    const evidence = compareAttributes(
      product.category,
      product.attributes,
      listing.evidence.attributes || {},
    );
    if (evidence.decision !== 'accepted')
      throw new Error(
        `Match cannot be approved: ${[...evidence.conflicts, ...evidence.unknown].join(', ')}`,
      );
    await c.query(
      "UPDATE atlas.listings SET product_id=$1,match_state='accepted',next_check=$2 WHERE id=$3",
      [productId, Date.now(), listingId],
    );
    // Remove the old projection; historical observations retain original identity.
    await c.query('DELETE FROM atlas.current_offers WHERE listing_id=$1', [listingId]);
    await c.query('INSERT INTO atlas.audit VALUES($1,$2,$3,$4,$5)', [
      randomUUID(),
      actor,
      `match:${listingId}:${productId}`,
      reason,
      Date.now(),
    ]);
  });
}
export async function maintenance() {
  return tx(async (c) => {
    for (const store of ['Amazon', 'Flipkart'] as const) {
      const policy = livePolicy(store);
      const cutoff =
        Date.now() -
        (policy.history ? policy.historyRetentionDays * 86400000 : policy.displayTtlSeconds * 1000);
      await c.query(
        'DELETE FROM atlas.observations WHERE listing_id IN (SELECT id FROM atlas.listings WHERE store=$1) AND observed_at<$2',
        [store, cutoff],
      );
      await c.query(
        "UPDATE atlas.listings SET evidence='{}'::jsonb WHERE store=$1 AND last_success<$2",
        [store, cutoff],
      );
    }
    await c.query('DELETE FROM atlas.observations WHERE expires_at<$1', [Date.now()]);
    await c.query(
      "UPDATE atlas.products SET data=(data-'imageUrl'-'attributes'-'description') || jsonb_build_object('name','Saved product · source data expired','attributes','{}'::jsonb,'description','Source metadata expired. Awaiting a successful refresh.','subtitle','Source data expired') WHERE NOT EXISTS(SELECT 1 FROM atlas.listings l WHERE l.product_id=atlas.products.id AND l.evidence<>'{}'::jsonb)",
    );
    await c.query(
      "UPDATE atlas.jobs SET state='pending',lease_until=NULL WHERE state='running' AND lease_until<$1",
      [Date.now()],
    );
    await c.query(
      "UPDATE atlas.notifications SET email_state='pending' WHERE email_state='sending' AND next_attempt<$1",
      [Date.now()],
    );
    await c.query("DELETE FROM atlas.jobs WHERE state='complete' AND created_at<$1", [
      Date.now() - 7 * 86400000,
    ]);
  });
}
