import { createHash } from 'node:crypto';
import { postgres, tx } from '../database/postgres';
import { normalizeQuery } from '../domain/search';
import { cachedAgentResearch } from './agent-research-cache';

const heartbeatKey = 'agent-worker-v1';
const prefix = 'agent-job-v1:';
const dayKey = () => 'agent-usage-v1:' + new Date().toISOString().slice(0, 10);
const cap = () => Math.min(100, Math.max(1, Number(process.env.AGENT_RESEARCH_DAILY_LIMIT) || 20));
const jobKey = (q: string) => prefix + createHash('sha256').update(normalizeQuery(q)).digest('hex');
const valid = (q: string) => q.length >= 2 && q.length <= 160 && !/^https?:/i.test(q);

export async function researchHeartbeat() {
  await postgres().query(
    "INSERT INTO atlas.search_cache VALUES($1,'complete',$2,$3) ON CONFLICT(query_key) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at",
    [heartbeatKey, { at: Date.now() }, Date.now() + 45000],
  );
}

export async function requestAgentResearch(query: string, beforeEnqueue?: () => Promise<boolean>) {
  const base = {
    provider: 'antigravity',
    available: true,
    query,
    candidates: [] as { title: string; url: string; store: string; quotedRupees: null }[],
    sources: [] as { title: string; uri: string }[],
  };
  if (!valid(query)) return { ...base, reason: 'not_applicable' };
  const key = jobKey(query);
  const report = await cachedAgentResearch(query);
  if (report)
    return {
      ...base,
      candidates: report.candidates.map((c) => ({
        title: c.title,
        url: c.url,
        store: c.store,
        quotedRupees: null,
      })),
      sources: report.candidates.map((c) => ({ title: c.title, uri: c.url })),
      via: 'agent-research',
      reason: report.candidates.length ? undefined : 'none_found',
    };
  const reason = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['agent-research-queue']);
    const now = Date.now();
    const row = (
      await c.query(
        'SELECT state,data FROM atlas.search_cache WHERE query_key=$1 AND expires_at>$2',
        [key, now],
      )
    ).rows[0];
    if (row?.state === 'complete') return row.data.reason || 'none_found';
    const online = (
      await c.query(
        'SELECT query_key FROM atlas.search_cache WHERE query_key=$1 AND expires_at>$2',
        [heartbeatKey, now],
      )
    ).rows.length;
    if (!online) return 'offline';
    const used =
      (await c.query('SELECT data FROM atlas.search_cache WHERE query_key=$1', [dayKey()])).rows[0]
        ?.data?.used || 0;
    if (row && Number(row.data.leaseUntil) > now) return 'pending';
    if (used >= cap()) return 'limited';
    if (row) return 'pending';
    const waiting = (
      await c.query(
        "SELECT count(*) n FROM atlas.search_cache WHERE query_key LIKE 'agent-job-v1:%' AND state='pending' AND expires_at>$1",
        [now],
      )
    ).rows[0];
    if (Number(waiting.n) >= 8) return 'busy';
    if (beforeEnqueue && !(await beforeEnqueue())) return 'limited';
    await c.query(
      "INSERT INTO atlas.search_cache VALUES($1,'pending',$2,$3) ON CONFLICT(query_key) DO UPDATE SET state='pending',data=excluded.data,expires_at=excluded.expires_at",
      [key, { query }, now + 10 * 60000],
    );
    return 'pending';
  });
  return { ...base, reason };
}

export async function claimResearchJob() {
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['agent-research-queue']);
    const now = Date.now();
    const active = (
      await c.query(
        "SELECT query_key FROM atlas.search_cache WHERE query_key LIKE 'agent-job-v1:%' AND state='pending' AND expires_at>$1 AND (data->>'leaseUntil')::bigint>$1 LIMIT 1",
        [now],
      )
    ).rows.length;
    if (active) return null;
    const used = Number(
      (await c.query('SELECT data FROM atlas.search_cache WHERE query_key=$1', [dayKey()])).rows[0]
        ?.data?.used || 0,
    );
    if (used >= cap()) return null;
    const row = (
      await c.query(
        "SELECT query_key,data FROM atlas.search_cache WHERE query_key LIKE 'agent-job-v1:%' AND state='pending' AND expires_at>$1 ORDER BY expires_at LIMIT 1 FOR UPDATE",
        [now],
      )
    ).rows[0];
    if (!row) return null;
    if (typeof row.data.query !== 'string' || !valid(row.data.query)) {
      await c.query("UPDATE atlas.search_cache SET state='complete',data=$2 WHERE query_key=$1", [
        row.query_key,
        { reason: 'invalid_query' },
      ]);
      return null;
    }
    await c.query(
      "INSERT INTO atlas.search_cache VALUES($1,'complete',$2,$3) ON CONFLICT(query_key) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at",
      [dayKey(), { used: used + 1 }, now + 2 * 86400000],
    );
    await c.query('UPDATE atlas.search_cache SET data=$2 WHERE query_key=$1', [
      row.query_key,
      { ...row.data, leaseUntil: now + 5 * 60000 },
    ]);
    return { key: row.query_key as string, query: row.data.query as string };
  });
}

export async function finishResearchJob(key: string, reason = 'none_found') {
  await postgres().query(
    "UPDATE atlas.search_cache SET state='complete',data=data || $2::jsonb,expires_at=$3 WHERE query_key=$1",
    [key, { reason }, Date.now() + 15 * 60000],
  );
}
