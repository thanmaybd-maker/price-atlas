import 'dotenv/config';
import { collect, dispatch, isLive } from '../../packages/database/runtime';
import { startLiveWorker } from '../../packages/jobs/index';
let stopping = false,
  ticking = false;
async function tick() {
  if (stopping || ticking) return;
  ticking = true;
  try {
    const run = await collect();
    await dispatch();
    console.log(JSON.stringify({ event: 'collection', ...run }));
  } catch {
    console.error(JSON.stringify({ event: 'collection_failed' }));
  } finally {
    ticking = false;
  }
}
let close: (() => Promise<void>) & {
  health?: () => { ready: boolean; lastSuccessfulTick: number | null; queue: string };
};
if (isLive()) {
  // Migrate existing worker deployments to the economical tier. Premium/rendering
  // must be enabled specifically for the worker, rather than inherited accidentally.
  process.env.SCRAPER_PREMIUM_PROXY = process.env.WORKER_SCRAPER_PREMIUM_PROXY || 'false';
  process.env.SCRAPER_RENDER_JS = process.env.WORKER_SCRAPER_RENDER_JS || 'false';
  close = await startLiveWorker();
} else {
  await tick();
  const timer = setInterval(() => void tick(), 60000);
  close = async () => {
    stopping = true;
    clearInterval(timer);
    while (ticking) await new Promise((resolve) => setTimeout(resolve, 100));
  };
}
import http from 'node:http';
const port = process.env.PORT;
if (port) {
  http
    .createServer((_, res) => {
      const health = close.health?.() || { ready: !stopping, mode: 'demo' };
      res
        .writeHead(health.ready ? 200 : 503, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(health));
    })
    .listen(Number(port), '0.0.0.0', () => {
      console.log(`Worker health listener running on port ${port} (0.0.0.0)`);
    });
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void close().then(() => process.exit(0));
  });
