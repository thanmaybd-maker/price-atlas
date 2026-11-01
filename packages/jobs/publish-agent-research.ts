import { reviewAgentReport } from '../providers/agent-research';
import { saveAgentResearch } from './agent-research-cache';
import { discoverProducts } from './discovery';

export async function publishAgentResearch(raw: unknown) {
  const report = reviewAgentReport(raw);
  if (!report.candidates.length) return { report, lookup: null, published: false };
  await saveAgentResearch(report);
  // reviewAgentReport permits name queries only. Name discovery has zero paid allowance.
  const lookup = await discoverProducts(report.query, 'all', { searchMore: true });
  return { report, lookup, published: true };
}
