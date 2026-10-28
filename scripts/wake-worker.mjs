import { setTimeout as sleep } from 'node:timers/promises';

// Public health only; retailer and account credentials stay on Render.
const origin = process.env.RENDER_WORKER_ORIGIN || 'https://price-atlas-1cmc.onrender.com';
const url = new URL('/', origin);
if (url.protocol !== 'https:') throw new Error('Worker origin must use HTTPS.');
const deadline = Date.now() + 240000;
let lastStatus = 'starting';
while (Date.now() < deadline) {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(45000),
    });
    lastStatus = `HTTP ${response.status}`;
    const health = await response.json();
    if (
      response.ok &&
      health.ready === true &&
      Number(health.lastSuccessfulTick) > Date.now() - 180000
    ) {
      console.log(
        JSON.stringify({
          event: 'render_worker_ready',
          queue: health.queue,
          lastSuccessfulTick: health.lastSuccessfulTick,
        }),
      );
      process.exit(0);
    }
  } catch {
    lastStatus = 'waiting_for_worker';
  }
  await sleep(10000);
}
console.error(JSON.stringify({ event: 'render_worker_unavailable', status: lastStatus }));
process.exitCode = 1;
