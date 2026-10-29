// Keep hidden tabs idle and prevent overlapping polls on slow connections.
export function visiblePoll(run: () => Promise<void>, intervalMs = 60000) {
  let stopped = false,
    running = false;
  const tick = async () => {
    if (stopped || running || document.visibilityState === 'hidden') return;
    running = true;
    try {
      await run();
    } catch {
    } finally {
      running = false;
    }
  };
  const visible = () => {
    if (document.visibilityState === 'visible') void tick();
  };
  const timer = setInterval(() => void tick(), intervalMs);
  document.addEventListener('visibilitychange', visible);
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', visible);
  };
}
