import 'dotenv/config';
import { postgres, collect } from '../packages/database/postgres';
const id = `pipeline-check-${Date.now()}`;
try {
  const reset = await postgres().query(
    'UPDATE atlas.listings SET next_check=$1 WHERE id=ANY($2::text[])',
    [Date.now(), ['amazon-b09xs7jwhh', 'flipkart-mobh2hjg6kbbmprf']],
  );
  if (!reset.rowCount) throw new Error('Import the two documented example products first.');
  const run = await collect(id);
  console.log(JSON.stringify({ run: id, scheduledJobs: run.jobs }));
  const started = Date.now();
  while (Date.now() - started < 55000) {
    const result = (
      await postgres().query('SELECT status,observations FROM atlas.runs WHERE id=$1', [id])
    ).rows[0];
    if (['complete', 'partial'].includes(result.status)) {
      console.log(JSON.stringify({ run: id, ...result }));
      if (result.status !== 'complete') process.exitCode = 1;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const jobs = (
    await postgres().query("SELECT state,last_error FROM atlas.jobs WHERE payload->>'runKey'=$1", [
      id,
    ])
  ).rows;
  console.log(JSON.stringify({ jobs }));
  if (jobs.some((j) => j.state !== 'complete')) process.exitCode = 1;
} catch {
  console.error('Live pipeline verification failed. Inspect the operator ledger.');
  process.exitCode = 1;
} finally {
  await postgres().end();
}
