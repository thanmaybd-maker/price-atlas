import { reviewAgentReport } from '../providers/agent-research';
import { saveAgentResearch } from './agent-research-cache';
import { discoverProducts } from './discovery';

export async function publishAgentResearch(raw: unknown, options: { verify?: boolean } = {}) {
  const report = reviewAgentReport(raw);
  if (!report.candidates.length && !report.otherVariants.length)
    return { report, lookup: null, published: false };
  await saveAgentResearch(report);
  if (options.verify === false) return { report, lookup: null, published: true };
  // reviewAgentReport permits name queries only. Name discovery has zero paid allowance.
  const lookup = await discoverProducts(report.query, 'all', { searchMore: true });
  return { report, lookup, published: true };
}
