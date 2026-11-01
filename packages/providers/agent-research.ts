import { createHash } from 'node:crypto';
import { canonicalRetailUrl } from './scraper';
import { normalizeQuery, matchesQuery } from '../domain/search';
import { discoveryConflict } from '../domain/discovery-guard';
import { variantSignature } from '../domain/variant-guard';
import type { SearchCandidate } from './search';
import { parseQueryIntent } from '../domain/query-intent';
import { RESEARCH_LISTING_LIMIT } from '../domain/research-limits';
import { researchListingTitle } from './agent-payload';

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
  'agent-research-v2:' + createHash('sha256').update(normalizeQuery(query)).digest('hex');

export function retailerRoundRobin<T extends { store: string }>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.store) || [];
    group.push(row);
    groups.set(row.store, group);
  }
  const result: T[] = [];
  while (result.length < rows.length)
    for (const group of groups.values()) {
      const row = group.shift();
      if (row) result.push(row);
    }
  return result;
}

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
  const family = phrase
    .replace(/\b\d+(?:\.\d+)?\s*(?:gb|tb|ml|kg|g|litres?|liters?)\b/gi, '')
    .replace(/\b(?:pack|set)\s*(?:of\s*)?\d+\b/gi, '')
    .replace(
      /\b(?:paperback|hardcover|hardback|softcover|kindle|spiral|refurbished|renewed|used|open.box)\b/gi,
      '',
    )
    .replace(/\bsize\s+[a-z0-9]+\b/gi, '')
    .replace(
      /\b(?:black|white|blue|red|green|silver|gray|grey|gold|pink|purple|titanium|silverblue|rose)\b/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
  for (const value of (raw as { products: unknown[] }).products.slice(0, RESEARCH_LISTING_LIMIT)) {
    if (!value || typeof value !== 'object') continue;
    const row = value as { title?: unknown; url?: unknown };
    if (typeof row.title !== 'string' || typeof row.url !== 'string') continue;
    let title = row.title.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (title.length < 4) continue;
    const accessory =
      /\b(?:case|cover|sleeve|protector|replacement|earpads|adapter|charger|cable|stand)\b/i;
    if (accessory.test(title) && !accessory.test(query)) continue;
    try {
      const identity = canonicalRetailUrl(row.url);
      title = researchListingTitle(title, identity.url);
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
      if (
        !discoveryConflict(title, query) &&
        matchesQuery({ name: title, brand: '', subtitle: '' }, phrase)
      )
        result.candidates.push(lead);
      else {
        if (
          family.length >= 2 &&
          !discoveryConflict(title, family) &&
          matchesQuery({ name: title, brand: '', subtitle: '' }, family)
        )
          result.otherVariants.push(lead);
      }
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
