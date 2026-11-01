import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { reviewAgentReport } from '../packages/providers/agent-research';
import { publishAgentResearch } from '../packages/jobs/publish-agent-research';
import { postgres } from '../packages/database/postgres';

let openedDatabase = false;
try {
  if (!process.argv[2]) throw new Error('Usage: pnpm research:publish <report.json>');
  const raw = await readFile(process.argv[2], 'utf8');
  if (raw.length > 128000) throw new Error('Report exceeds size limit.');
  const report = reviewAgentReport(JSON.parse(raw));
  openedDatabase = Boolean(report.candidates.length && process.env.DATABASE_URL);
  const result = await publishAgentResearch(report);
  console.log(
    JSON.stringify({
      status: result.published ? 'complete' : 'no_matching_leads',
      published: result.published,
      products: result.lookup?.products?.map((p) => ({ id: p.id, name: p.name })),
      sources: result.lookup?.sources,
      pricesSavedFromAgent: 0,
    }),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  console.error(
    JSON.stringify({
      status: 'failed',
      reason: ['invalid_query', 'invalid_report', 'expired_report'].includes(message)
        ? message
        : 'publish_failed',
      pricesSavedFromAgent: 0,
    }),
  );
  process.exitCode = 1;
} finally {
  if (openedDatabase) await postgres().end();
}
