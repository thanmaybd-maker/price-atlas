import 'dotenv/config';
import { resolve } from 'node:path';
import {
  researchHeartbeat,
  claimResearchJob,
  finishResearchJob,
} from '../packages/jobs/agent-research-queue';
import { boundedOperatorCommand } from '../packages/providers/operator-process';
import { postgres } from '../packages/database/postgres';
import { execFileSync } from 'node:child_process';
import { researchEnvironment } from '../packages/providers/agent-session';

let stopping = false;
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    stopping = true;
    controller.abort();
  });
let heartbeat: ReturnType<typeof setInterval> | undefined;
try {
  const check = JSON.parse(
    execFileSync(
      process.platform === 'win32' ? 'agy.exe' : 'agy',
      ['-p', '/usage', '--output-format', 'json', '--print-timeout', '10s'],
      {
        env: researchEnvironment(),
        timeout: 15000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      },
    ),
  );
  if (check.status !== 'SUCCESS' || check.finished_reason === 'print_timeout')
    throw new Error('CLI sign-in check failed');
  await researchHeartbeat();
  heartbeat = setInterval(
    () =>
      void researchHeartbeat().catch(() => console.error('{"event":"research_heartbeat_failed"}')),
    10000,
  );
  console.log('{"event":"research_worker_ready"}');
  while (!stopping) {
    const job = await claimResearchJob();
    if (!job) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    try {
      await boundedOperatorCommand(
        process.execPath,
        [
          resolve('node_modules/tsx/dist/cli.mjs'),
          resolve('scripts/research-products.ts'),
          job.query,
          '--publish',
        ],
        controller.signal,
      );
      await finishResearchJob(job.key);
      console.log(JSON.stringify({ event: 'research_complete', query: job.query }));
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      const output = String(failure.stdout || '') + '\n' + String(failure.stderr || '');
      let reason = 'process_error';
      for (const line of output.split('\n')) {
        try {
          const item = JSON.parse(line);
          if (typeof item.reason === 'string' && /^[a-z_]{1,64}$/.test(item.reason))
            reason = item.reason;
        } catch {
          /* Non-JSON process diagnostics are not exposed. */
        }
      }
      await finishResearchJob(job.key, reason === 'quota' ? 'limited' : 'error');
      console.error(JSON.stringify({ event: 'research_failed', query: job.query, reason }));
    }
  }
} catch {
  console.error('{"event":"research_worker_failed"}');
  process.exitCode = 1;
} finally {
  clearInterval(heartbeat);
  await postgres().end();
}
