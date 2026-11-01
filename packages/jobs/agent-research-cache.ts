import { postgres } from '../database/postgres';
import {
  agentResearchKey,
  parseAgentResearch,
  type AgentResearch,
} from '../providers/agent-research';
import { normalizeQuery } from '../domain/search';

export async function saveAgentResearch(report: AgentResearch) {
  await postgres().query(
    "INSERT INTO atlas.search_cache(query_key,state,data,expires_at) VALUES($1,'complete',$2,$3) ON CONFLICT(query_key) DO UPDATE SET state='complete',data=excluded.data,expires_at=excluded.expires_at",
    [agentResearchKey(report.query), report, report.researchedAt + 24 * 3600000],
  );
}

export async function cachedAgentResearch(query: string): Promise<AgentResearch | null> {
  const row = (
    await postgres().query(
      "SELECT data FROM atlas.search_cache WHERE query_key=$1 AND state='complete' AND expires_at>$2",
      [agentResearchKey(query), Date.now()],
    )
  ).rows[0];
  const r = row?.data as AgentResearch | undefined;
  if (
    !r ||
    r.provider !== 'antigravity' ||
    typeof r.query !== 'string' ||
    normalizeQuery(r.query) !== normalizeQuery(query) ||
    !Number.isFinite(r.researchedAt) ||
    r.researchedAt > Date.now() ||
    Date.now() - r.researchedAt > 24 * 3600000
  )
    return null;
  // Revalidate on read: cached output can never bypass today's URL/variant guards.
  return parseAgentResearch(query, { products: r.candidates }, r.researchedAt);
}
