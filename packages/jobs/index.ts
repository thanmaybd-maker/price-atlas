import {
  boundedLimit,
  MAX_TOTAL_REQUESTS_PER_DAY,
  MAX_PAID_CREDITS_PER_DAY,
  MAX_PAID_CREDITS_PER_MONTH,
  MAX_PAID_CREDITS_PER_REQUEST,
} from './credit-budget';
import { Queue, Worker } from 'bullmq';
import { postgres, tx, collect, importScraped, maintenance, offers } from '../database/postgres';
import {
  ScrapeError,
  canonicalRetailUrl,
  scraperCreditCost,
  scraperConfig,
  scrapeProduct,
  type ScraperConfig,
  type ScrapedProduct,
} from '../providers/scraper';
import { getSourceAdapter } from '../providers/index';
import { livePolicy } from '../providers/live';
import { rank, type Rule } from '../domain/index';
import {
  ResendNotifications,
  emailDeliveryEnabled,
  type NotificationProvider,
} from '../notifications/index';
import type { Store } from '../domain/index';
import { deliverTelegram } from '../notifications/telegram';
import { deliverTestAlerts } from '../notifications/test-alerts';
import {
  availableCredentials,
  recordCredentialFailure,
  recordCredentialSuccess,
} from './provider-pool';
import { runCatalogExpansionStep } from './catalog-expansion';
export class SourceLimitError extends ScrapeError {}
export async function reserveSource(store: Store, config: ScraperConfig = scraperConfig()) {
  const policy = livePolicy(store);
  if (!policy.currentPrices)
    throw new ScrapeError('disabled', 'Current price collection is disabled for this source.');
  await tx(async (c) => {
    const day = new Date().toISOString().slice(0, 10);
    const limit = boundedLimit(process.env.SCRAPER_REQUESTS_PER_DAY, MAX_TOTAL_REQUESTS_PER_DAY);
    const creditLimit = boundedLimit(process.env.SCRAPER_CREDITS_PER_DAY, MAX_PAID_CREDITS_PER_DAY);
    const monthLimit = boundedLimit(
      process.env.SCRAPER_CREDITS_PER_MONTH,
      MAX_PAID_CREDITS_PER_MONTH,
    );
    const cost = scraperCreditCost(config);
    if (![creditLimit, monthLimit].every((n) => Number.isSafeInteger(n) && n >= 0))
      throw new ScrapeError('configuration', 'Scraper credit limits must be nonnegative integers.');
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new ScrapeError(
        'configuration',
        'SCRAPER_REQUESTS_PER_DAY must be a positive integer.',
      );
    await c.query("SELECT pg_advisory_xact_lock(hashtext('atlas:collection-budget'))");
    await c.query('INSERT INTO atlas.collection_budget(day) VALUES($1) ON CONFLICT DO NOTHING', [
      day,
    ]);
    const budget = (
      await c.query(
        'SELECT requests,credits FROM atlas.collection_budget WHERE day=$1 FOR UPDATE',
        [day],
      )
    ).rows[0];
    if (budget.requests >= limit || (cost > 0 && Number(budget.credits) + cost > creditLimit))
      throw new SourceLimitError(
        'daily_budget',
        'The daily collection limit has been reached. Tracking resumes tomorrow.',
      );
    const month = (
      await c.query(
        'SELECT COALESCE(sum(credits),0) AS credits FROM atlas.collection_budget WHERE day >= $1 AND day <= $2',
        [day.slice(0, 7) + '-01', day],
      )
    ).rows[0];
    if (cost > 0 && Number(month.credits) + cost > monthLimit)
      throw new SourceLimitError(
        'monthly_budget',
        'The monthly collection credit limit has been reached.',
      );
    const row = (
      await c.query('SELECT * FROM atlas.provider_state WHERE store=$1 FOR UPDATE', [store])
    ).rows[0];
    if (!row || row.paused) throw new SourceLimitError('paused', 'This retailer is paused.');
    const now = Date.now(),
      fresh = now - Number(row.window_start) >= 60000;
    if (!fresh && row.requests >= policy.requestsPerMinute)
      throw new SourceLimitError(
        'rate_limited',
        'The source request budget is exhausted. Try again in a minute.',
        true,
      );
    await c.query(
      'UPDATE atlas.provider_state SET requests=$1,window_start=$2,policy=$3 WHERE store=$4',
      [fresh ? 1 : row.requests + 1, fresh ? now : row.window_start, policy, store],
    );
    await c.query(
      'UPDATE atlas.collection_budget SET requests=requests+1,credits=credits+$2 WHERE day=$1',
      [day, cost],
    );
  });
}
export async function fetchProductWithBudget(
  url: string,
  timeoutMs?: number,
  allowPaid?: (cost: number) => boolean,
  overrides: Partial<ScraperConfig> = {},
  skipDirect = false,
) {
  const { store } = canonicalRetailUrl(url);
  const configured = { ...scraperConfig(), ...(timeoutMs ? { timeoutMs } : {}), ...overrides };
  let partial: ScrapedProduct | undefined;
  if (
    !skipDirect &&
    configured.transport !== 'direct' &&
    process.env.SCRAPER_DIRECT_FIRST !== 'false'
  ) {
    await reserveSource(store, { transport: 'direct' });
    try {
      const result = await scrapeProduct(url, { transport: 'direct', timeoutMs: 6000 });
      if (result.status !== 'PARTIAL_UNVERIFIED') return result;
      partial = result;
    } catch (error) {
      if (!(error instanceof ScrapeError)) throw error;
    }
  }
  const cost = scraperCreditCost(configured);
  if (configured.transport !== 'direct' && allowPaid && !allowPaid(Math.max(1, cost))) {
    if (partial) return partial;
    throw new SourceLimitError(
      'lookup_budget',
      'The paid allowance for this lookup has been reached. Try a direct product link.',
    );
  }
  if (configured.transport !== 'scrapingbee' && configured.transport !== 'firecrawl') {
    await reserveSource(store, configured);
    return scrapeProduct(url, configured);
  }
  const provider = configured.transport;
  const keys = await availableCredentials(configured.apiKey, provider);
  const deadline = Date.now() + Math.min(44000, (timeoutMs || 15000) * 2);
  let spent = 0,
    temporaryFailures = 0,
    first = true;
  for (const apiKey of keys) {
    if (spent + cost > MAX_PAID_CREDITS_PER_REQUEST || Date.now() > deadline - 1000) break;
    if (!first && allowPaid && !allowPaid(cost)) break;
    first = false;
    const attempt = {
      ...configured,
      apiKey,
      timeoutMs: Math.min(configured.timeoutMs || 15000, deadline - Date.now(), 28000),
    };
    await reserveSource(store, attempt);
    spent += cost;
    try {
      const result = await scrapeProduct(url, attempt);
      await recordCredentialSuccess(apiKey, provider);
      return result;
    } catch (error) {
      if (!(error instanceof ScrapeError)) throw error;
      const permanent = ['provider_credits', 'provider_auth'].includes(error.code);
      const temporary =
        error.code === 'network' ||
        error.code === 'provider_unavailable' ||
        error.code === 'provider_rate_limited';
      // Retailers often refuse Firecrawl's basic proxy (Amazon answers 503/403). Retry this
      // key once through the stealth proxy, inside the same per-request credit ceiling.
      if (
        !permanent &&
        !temporary &&
        provider === 'firecrawl' &&
        !attempt.stealth &&
        ['blocked', 'http_error', 'empty'].includes(error.code) &&
        spent + 5 <= MAX_PAID_CREDITS_PER_REQUEST &&
        Date.now() < deadline - 3000 &&
        (!allowPaid || allowPaid(5))
      ) {
        const stealth = {
          ...attempt,
          stealth: true,
          timeoutMs: Math.min(25000, deadline - Date.now()),
        };
        await reserveSource(store, stealth);
        spent += 5;
        try {
          const result = await scrapeProduct(url, stealth);
          await recordCredentialSuccess(apiKey, provider);
          return result;
        } catch (retry) {
          if (!(retry instanceof ScrapeError)) throw retry;
          if (partial) return partial;
          throw retry;
        }
      }
      if (!permanent && !temporary) {
        if (partial) return partial;
        throw error;
      }
      await recordCredentialFailure(apiKey, error.code, provider);
      if (temporary && ++temporaryFailures >= 2 && provider === 'scrapingbee') {
        if (partial) return partial;
        throw error;
      }
    }
  }
  if (partial) return partial;
  throw new ScrapeError(
    'provider_pool_unavailable',
    'Paid verification is temporarily unavailable. Saved products and free fetching remain available.',
  );
}
// Scheduled checks try the free direct fetch first. Flipkart and Amazon often answer a
// datacenter IP with 429/403, so a refused direct fetch falls back to the paid provider
// pool (Firecrawl) inside the shared daily credit budget instead of losing the day's check.
async function collectPage(url: string) {
  try {
    return await fetchProductWithBudget(url, undefined, undefined, {
      transport: 'direct',
      timeoutMs: 6000,
    });
  } catch (error) {
    const refused =
      error instanceof ScrapeError &&
      ['rate_limited', 'blocked', 'http_error', 'empty', 'network'].includes(error.code) &&
      !(error instanceof SourceLimitError);
    if (!refused || !process.env.FIRECRAWL_API_KEY) throw error;
    return fetchProductWithBudget(
      url,
      20000,
      undefined,
      { transport: 'firecrawl', apiKey: process.env.FIRECRAWL_API_KEY },
      true,
    );
  }
}
export async function runCollectionJob(id: string) {
  const claimed = await postgres().query(
    "UPDATE atlas.jobs SET state='running',attempts=attempts+1,lease_until=$2 WHERE id=$1 AND state='pending' AND available_at<=$3 RETURNING *",
    [id, Date.now() + 120000, Date.now()],
  );
  const job = claimed.rows[0];
  if (!job) return;
  try {
    const result = await importScraped(await collectPage(job.payload.url), job.payload.runKey);
    await tx(async (c) => {
      await c.query("UPDATE atlas.jobs SET state='complete',lease_until=NULL WHERE id=$1", [id]);
      await c.query(
        "UPDATE atlas.runs SET observations=observations+$2,status='running' WHERE id=$1",
        [job.payload.runKey, result.observations],
      );
      await c.query(
        "UPDATE atlas.runs SET status=CASE WHEN EXISTS(SELECT 1 FROM atlas.jobs WHERE payload->>'runKey'=$1 AND state='failed') THEN 'partial' ELSE 'complete' END,completed_at=$2 WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM atlas.jobs WHERE payload->>'runKey'=$1 AND state IN ('pending','running'))",
        [job.payload.runKey, Date.now()],
      );
    });
    console.log(
      JSON.stringify({
        event: 'collection_completed',
        jobId: id,
        productId: result.productId,
        observations: result.observations,
        quarantined: !!result.quarantined,
      }),
    );
  } catch (error) {
    const code = error instanceof ScrapeError ? error.code : 'collection_failed';
    const deferred =
      error instanceof SourceLimitError &&
      ['daily_budget', 'monthly_budget', 'rate_limited', 'paused'].includes(code);
    const retryable =
      deferred || (error instanceof ScrapeError && error.retryable && job.attempts < 4);
    const now = new Date();
    const delay = !retryable
      ? 86400000
      : code === 'monthly_budget'
        ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - Date.now() + 60000
        : code === 'daily_budget'
          ? 86400000 - (Date.now() % 86400000) + 60000
          : Math.min(3600000, 60000 * 2 ** job.attempts);
    await tx(async (c) => {
      await c.query(
        'UPDATE atlas.jobs SET state=$2,available_at=$3,lease_until=NULL,last_error=$4,attempts=attempts-$5 WHERE id=$1',
        [id, retryable ? 'pending' : 'failed', Date.now() + delay, code, deferred ? 1 : 0],
      );
      await c.query('UPDATE atlas.listings SET failures=failures+$3,next_check=$2 WHERE id=$1', [
        job.payload.listingId,
        Date.now() + delay,
        deferred ? 0 : 1,
      ]);
      await c.query('UPDATE atlas.provider_state SET last_error=$2 WHERE store=$1', [
        canonicalRetailUrl(job.payload.url).store,
        code,
      ]);
      await c.query(
        "UPDATE atlas.runs SET status='partial',completed_at=$2 WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM atlas.jobs WHERE payload->>'runKey'=$1 AND state IN ('pending','running'))",
        [job.payload.runKey, Date.now()],
      );
    });
    console.error(JSON.stringify({ event: 'collection_failed', jobId: id, code, retryable }));
  }
}
export async function deliverNotifications(
  provider: NotificationProvider = new ResendNotifications(),
) {
  const rows = await tx(async (c) => {
    const due = await c.query(
      "SELECT * FROM atlas.notifications WHERE email_state='pending' AND next_attempt<=$1 ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED",
      [Date.now()],
    );
    for (const n of due.rows)
      await c.query(
        "UPDATE atlas.notifications SET email_state='sending',next_attempt=$2 WHERE id=$1",
        [n.id, Date.now() + 120000],
      );
    return due.rows;
  });
  for (const n of rows) {
    const user = (await postgres().query('SELECT * FROM atlas.users WHERE id=$1', [n.user_id]))
      .rows[0];
    const rule = (await postgres().query('SELECT data FROM atlas.rules WHERE id=$1', [n.rule_id]))
      .rows[0]?.data as Rule | undefined;
    const best = rule
      ? rank(
          (await offers(rule.productId)).filter(
            (o) => o.alertsAllowed && (rule.store === 'all' || o.store === rule.store),
          ),
          Date.now(),
          rule.basis,
        ).lowest
      : null;
    const allowed =
      user?.verified &&
      user.notifications === 1 &&
      rule?.enabled &&
      rule.version === n.data.ruleVersion &&
      best !== null &&
      (rule.operator === 'lte' ? best <= rule.target : best < rule.target);
    if (!allowed) {
      await postgres().query(
        "UPDATE atlas.notifications SET state='suppressed',email_state='suppressed' WHERE id=$1",
        [n.id],
      );
      continue;
    }
    await postgres().query("UPDATE atlas.notifications SET state='delivered' WHERE id=$1", [n.id]);
    if (user.suppressed) {
      await postgres().query(
        "UPDATE atlas.notifications SET email_state='suppressed' WHERE id=$1",
        [n.id],
      );
      continue;
    }
    if (!user.email_enabled || !emailDeliveryEnabled()) {
      await postgres().query("UPDATE atlas.notifications SET email_state='disabled' WHERE id=$1", [
        n.id,
      ]);
      continue;
    }
    // Resend retains idempotency keys for 24h; ambiguous older sends need review.
    if (n.first_attempt && Date.now() - Number(n.first_attempt) > 23 * 3600000) {
      await postgres().query("UPDATE atlas.notifications SET email_state='review' WHERE id=$1", [
        n.id,
      ]);
      continue;
    }
    if (!process.env.EMAIL_FROM || !process.env.UNSUBSCRIBE_SECRET) {
      await postgres().query(
        "UPDATE atlas.notifications SET email_state='pending',next_attempt=$2 WHERE id=$1",
        [n.id, Date.now() + 300000],
      );
      continue;
    }
    try {
      await postgres().query(
        'UPDATE atlas.notifications SET first_attempt=COALESCE(first_attempt,$2),attempts=attempts+1 WHERE id=$1',
        [n.id, Date.now()],
      );
      const result = await provider.send({
        id: n.id,
        eventKey: n.event_key,
        userId: n.user_id,
        email: user.email,
        productId: n.data.productId,
        title: n.data.title,
        price: n.data.price,
        target: n.data.target,
        store: n.data.store,
        observedAt: n.data.observedAt,
        createdAt: Number(n.created_at),
      });
      await postgres().query(
        "UPDATE atlas.notifications SET email_state='sent',provider_id=$2 WHERE id=$1",
        [n.id, result.id],
      );
    } catch {
      await postgres().query(
        'UPDATE atlas.notifications SET email_state=$2,next_attempt=$3 WHERE id=$1',
        [
          n.id,
          n.attempts + 1 >= 5 ? 'failed' : 'pending',
          Date.now() + Math.min(3600000, 60000 * 2 ** n.attempts),
        ],
      );
    }
  }
}
export async function startLiveWorker() {
  const useRedis = process.env.WORKER_QUEUE === 'redis';
  if (useRedis && !process.env.REDIS_URL)
    throw new Error('REDIS_URL is required for Redis queue mode.');
  const redis = useRedis ? new URL(process.env.REDIS_URL!) : null;
  const connection = redis
    ? {
        host: redis.hostname,
        port: Number(redis.port || 6379),
        username: decodeURIComponent(redis.username) || undefined,
        password: decodeURIComponent(redis.password) || undefined,
        tls: redis.protocol === 'rediss:' ? {} : undefined,
        maxRetriesPerRequest: null,
      }
    : null;
  const queue = connection ? new Queue('atlas-collection', { connection }) : null;
  const worker = connection
    ? new Worker('atlas-collection', (job) => runCollectionJob(job.data.id), {
        connection,
        concurrency: 2,
        drainDelay: 60,
      })
    : null;
  queue?.on('error', () => console.error(JSON.stringify({ event: 'queue_error' })));
  worker?.on('error', () => console.error(JSON.stringify({ event: 'worker_error' })));
  let ticking = false,
    stopping = false;
  let lastSuccess = 0;
  async function tick() {
    if (ticking || stopping) return;
    ticking = true;
    try {
      await maintenance();
      const run = await collect();
      const due = await postgres().query(
        "SELECT j.id FROM atlas.jobs j WHERE j.state='pending' AND j.available_at<=$1 ORDER BY EXISTS(SELECT 1 FROM atlas.listings l JOIN atlas.rules r ON r.product_id=l.product_id WHERE l.id=j.payload->>'listingId' AND (r.data->>'enabled')::boolean) DESC,j.created_at,j.id LIMIT 4",
        [Date.now()],
      );
      for (const row of due.rows)
        if (queue)
          await queue.add(
            'collect',
            { id: row.id },
            { jobId: row.id, removeOnComplete: true, removeOnFail: true },
          );
        else await runCollectionJob(row.id);
      const deliveries = await Promise.allSettled([
        deliverTelegram(),
        deliverNotifications(),
        deliverTestAlerts(),
      ]);
      for (let i = 0; i < 2; i++) {
        const expansion = await runCatalogExpansionStep();
        if (expansion.event === 'catalog_idle') break;
        console.log(JSON.stringify(expansion));
        if (expansion.event === 'catalog_budget_pause') break;
      }
      console.log(
        JSON.stringify({
          event: 'worker_tick',
          ...run,
          queued: due.rows.length,
          notificationDispatch: deliveries.map((r) => r.status),
        }),
      );
      if (deliveries.some((result) => result.status === 'rejected'))
        console.error(JSON.stringify({ event: 'notification_dispatch_failed' }));
      else lastSuccess = Date.now();
    } catch {
      console.error(JSON.stringify({ event: 'worker_tick_failed' }));
    } finally {
      ticking = false;
    }
  }
  const timer = setInterval(() => void tick(), 60000);
  void tick();
  const close = async () => {
    stopping = true;
    clearInterval(timer);
    await worker?.close();
    while (ticking) await new Promise((resolve) => setTimeout(resolve, 100));
    await queue?.close();
    await postgres().end();
  };
  return Object.assign(close, {
    health: () => ({
      ready: !stopping && lastSuccess > Date.now() - 180000,
      lastSuccessfulTick: lastSuccess || null,
      queue: useRedis ? 'redis' : 'database',
    }),
  });
}
