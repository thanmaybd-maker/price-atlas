import { collect, dispatch } from '../../packages/database/index';
let stopping = false;
function tick() {
  if (stopping) return;
  try {
    const run = collect();
    dispatch();
    console.log(JSON.stringify({ level: 'info', event: 'collection', ...run }));
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'collection_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}
tick();
const timer = setInterval(tick, 60000);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    stopping = true;
    clearInterval(timer);
    process.exit(0);
  });
