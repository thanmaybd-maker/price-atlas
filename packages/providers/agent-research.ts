import { createHash } from 'node:crypto';
import { canonicalRetailUrl } from './scraper';
import { normalizeQuery, matchesQuery } from '../domain/search';
import { discoveryConflict } from '../domain/discovery-guard';
import { variantSignature } from '../domain/variant-guard';
import type { SearchCandidate } from './search';
import { parseQueryIntent } from '../domain/query-intent';

export type AgentLead = SearchCandidate & {
  status: 'DISCOVERY_UNVERIFIED';
  variant: ReturnType<typeof variantSignature>;
};
export type AgentResearch = {
  provider: 'antigravity';
  query: string;
  researchedAt: number;
  candidates: AgentLead[];
  otherVariants: AgentLead[];
};
export const agentResearchKey = (query: string) =>
  'agent-research-v1:' + createHash('sha256').update(normalizeQuery(query)).digest('hex');

// An agent's links are leads only. Never retain its quoted prices or identity assertions.
export function parseAgentResearch(query: string, raw: unknown, now = Date.now()): AgentResearch {
  if (
    typeof query !== 'string' ||
    query.trim().length < 2 ||
    query.length > 160 ||
    /^https?:/i.test(query)
  )
    throw new Error('invalid_query');
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { products?: unknown }).products))
    throw new Error('Agent response must contain a products array.');
  const result: AgentResearch = {
    provider: 'antigravity',
    query,
    researchedAt: now,
    candidates: [],
    otherVariants: [],
  };
  const seen = new Set<string>();
  const intent = parseQueryIntent(query);
  const phrase = intent.text || intent.category?.replace(/-/g, ' ') || query;
  for (const value of (raw as { products: unknown[] }).products.slice(0, 24)) {
    if (!value || typeof value !== 'object') continue;
    const row = value as { title?: unknown; url?: unknown };
    if (typeof row.title !== 'string' || typeof row.url !== 'string') continue;
    const title = row.title.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (title.length < 4) continue;
    const accessory =
      /\b(?:case|cover|sleeve|protector|replacement|earpads|adapter|charger|cable|stand)\b/i;
    if (accessory.test(title) && !accessory.test(query)) continue;
    try {
      const identity = canonicalRetailUrl(row.url);
      const key = `${identity.store}:${identity.externalId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const lead: AgentLead = {
        title,
        url: identity.url,
        store: identity.store,
        status: 'DISCOVERY_UNVERIFIED',
        variant: variantSignature(title),
      };
      if (discoveryConflict(title, query)) result.otherVariants.push(lead);
      else if (matchesQuery({ name: title, brand: '', subtitle: '' }, phrase))
        result.candidates.push(lead);
    } catch {
      /* Unsupported, private or non-product links are discarded. */
    }
  }
  return result;
}

export function reviewAgentReport(raw: unknown, now = Date.now()): AgentResearch {
  const r = raw as Partial<AgentResearch> | null;
  if (
    !r ||
    r.provider !== 'antigravity' ||
    typeof r.query !== 'string' ||
    !Array.isArray(r.candidates) ||
    !Array.isArray(r.otherVariants)
  )
    throw new Error('invalid_report');
  if (
    !Number.isFinite(r.researchedAt) ||
    r.researchedAt! > now ||
    now - r.researchedAt! > 24 * 3600000
  )
    throw new Error('expired_report');
  return parseAgentResearch(
    r.query,
    { products: [...r.candidates, ...r.otherVariants] },
    r.researchedAt,
  );
}
