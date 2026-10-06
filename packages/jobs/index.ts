import { Queue, Worker } from 'bullmq';
import { postgres, tx, collect, importScraped, maintenance, offers } from '../database/postgres';
import { ScrapeError, canonicalRetailUrl } from '../providers/scraper';
import { getSourceAdapter } from '../providers/index';
import { livePolicy } from '../providers/live';
import { rank, type Rule } from '../domain/index';
import { ResendNotifications, type NotificationProvider } from '../notifications/index';
import type { Store } from '../domain/index';
import { deliverTelegram } from '../notifications/telegram';
import { deliverTestAlerts } from '../notifications/test-alerts';
export async function reserveSource(store: Store) {
  const policy = livePolicy(store);
  if (!policy.currentPrices)
    throw new ScrapeError('disabled', 'Current price collection is disabled for this source.');
  await tx(async (c) => {
    const day = new Date().toISOString().slice(0, 10);
    const limit = Number(process.env.SCRAPER_REQUESTS_PER_DAY || 40);
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new ScrapeError(
        'configuration',
        'SCRAPER_REQUESTS_PER_DAY must be a positive integer.',
      );
    await c.query('INSERT INTO atlas.collection_budget(day) VALUES($1) ON CONFLICT DO NOTHING', [
      day,
    ]);
    const budget = (
      await c.query('SELECT requests FROM atlas.collection_budget WHERE day=$1 FOR UPDATE', [day])
    ).rows[0];
    if (budget.requests >= limit)
      throw new ScrapeError(
        'daily_budget',
        'The daily collection limit has been reached. Tracking resumes tomorrow.',
      );
    const row = (
      await c.query('SELECT * FROM atlas.provider_state WHERE store=$1 FOR UPDATE', [store])
    ).rows[0];
    if (!row || row.paused) throw new ScrapeError('paused', 'This retailer is paused.');
    const now = Date.now(),
      fresh = now - Number(row.window_start) >= 60000;
    if (!fresh && row.requests >= policy.requestsPerMinute)
      throw new ScrapeError(
        'rate_limited',
        'The source request budget is exhausted. Try again in a minute.',
        true,
      );
    await c.query(
      'UPDATE atlas.provider_state SET requests=$1,window_start=$2,policy=$3 WHERE store=$4',
      [fresh ? 1 : row.requests + 1, fresh ? now : row.window_start, policy, store],
    );
    await c.query('UPDATE atlas.collection_budget SET requests=requests+1 WHERE day=$1', [day]);
  });
}
export async function runCollectionJob(id: string) {
  const claimed = await postgres().query(
    "UPDATE atlas.jobs SET state='running',attempts=attempts+1,lease_until=$2 WHERE id=$1 AND state='pending' AND available_at<=$3 RETURNING *",
    [id, Date.now() + 120000, Date.now()],
  );
  const job = claimed.rows[0];
  if (!job) return;
  try {
    const identity = canonicalRetailUrl(job.payload.url);
    await reserveSource(identity.store);
    const result = await importScraped(
      await getSourceAdapter(identity.store).scrape(job.payload.url),
      job.payload.runKey,
    );
    await tx(async (c) => {
      await c.query("UPDATE atlas.jobs SET state='complete',lease_until=NULL WHERE id=$1", [id]);
      await c.query(
        "UPDATE atlas.runs SET observations=observations+$2,status='running' WHERE id=$1",
        [job.payload.runKey, result.observations],
      );
      await c.query(
        "UPDATE atlas.runs SET status='complete',completed_at=$2 WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM atlas.jobs WHERE payload->>'runKey'=$1 AND state IN ('pending','running'))",
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
    const retryable = error instanceof ScrapeError && error.retryable && job.attempts < 4;
    const delay =
      code === 'daily_budget'
        ? 86400000 - (Date.now() % 86400000) + 60000
        : Math.min(3600000, 60000 * 2 ** job.attempts);
    await tx(async (c) => {
      await c.query(
        'UPDATE atlas.jobs SET state=$2,available_at=$3,lease_until=NULL,last_error=$4 WHERE id=$1',
        [id, retryable ? 'pending' : 'failed', Date.now() + delay, code],
      );
      await c.query('UPDATE atlas.listings SET failures=failures+1,next_check=$2 WHERE id=$1', [
        job.payload.listingId,
        Date.now() + delay,
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
    if (!user.email_enabled) {
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
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for the live worker.');
  const redis = new URL(process.env.REDIS_URL);
  const connection = {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    username: decodeURIComponent(redis.username) || undefined,
    password: decodeURIComponent(redis.password) || undefined,
    tls: redis.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
  const queue = new Queue('atlas-collection', { connection });
  const worker = new Worker('atlas-collection', (job) => runCollectionJob(job.data.id), {
    connection,
    concurrency: 2,
  });
  queue.on('error', () => console.error(JSON.stringify({ event: 'queue_error' })));
  worker.on('error', () => console.error(JSON.stringify({ event: 'worker_error' })));
  let ticking = false,
    stopping = false;
  async function tick() {
    if (ticking || stopping) return;
    ticking = true;
    try {
      await maintenance();
      const run = await collect();
      const due = await postgres().query(
        "SELECT id FROM atlas.jobs WHERE state='pending' AND available_at<=$1 LIMIT 100",
        [Date.now()],
      );
      for (const row of due.rows)
        await queue.add(
          'collect',
          { id: row.id },
          { jobId: row.id, removeOnComplete: true, removeOnFail: true },
        );
      const deliveries = await Promise.allSettled([
        deliverTelegram(),
        deliverNotifications(),
        deliverTestAlerts(),
      ]);
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
    } catch {
      console.error(JSON.stringify({ event: 'worker_tick_failed' }));
    } finally {
      ticking = false;
    }
  }
  const timer = setInterval(() => void tick(), 30000);
  void tick();
  return async () => {
    stopping = true;
    clearInterval(timer);
    await worker.close();
    while (ticking) await new Promise((resolve) => setTimeout(resolve, 100));
    await queue.close();
    await postgres().end();
  };
}
