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
let close: () => Promise<void>;
if (isLive()) close = await startLiveWorker();
else {
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
    .createServer((_, res) => res.writeHead(200).end('Price Atlas Worker Running\n'))
    .listen(Number(port), '0.0.0.0', () => {
      console.log(`Worker health listener running on port ${port} (0.0.0.0)`);
    });
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void close().then(() => process.exit(0));
  });

