// Public product data only. Do not cache accounts, cookies or notification data here.
// Stale-while-revalidate: within `ttlMs` the cached value is served; up to `staleMs` the
// stale value is still served at once while one background refresh runs, so a page view
// never waits on the database for catalog data it saw seconds ago.
export function createReadCache(ttlMs = 30000, maxEntries = 32, staleMs = 600000) {
  type Entry = { until: number; stale: number; promise: Promise<unknown>; refreshing?: boolean };
  const entries = new Map<string, Entry>();
  const load = <T>(key: string, fetcher: () => Promise<T>, previous?: Entry) => {
    const entry: Entry = {
      until: Date.now() + ttlMs,
      stale: Date.now() + staleMs,
      promise: Promise.resolve().then(fetcher) as Promise<unknown>,
    };
    entry.promise = entry.promise.catch((error) => {
      if (entries.get(key) === entry) {
        if (previous) entries.set(key, previous);
        else entries.delete(key);
      }
      throw error;
    });
    return entry;
  };
  return {
    read<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
      const cached = entries.get(key);
      const now = Date.now();
      if (cached && cached.until > now) return cached.promise as Promise<T>;
      if (cached && cached.stale > now) {
        if (!cached.refreshing) {
          cached.refreshing = true;
          const next = load(key, fetcher, cached);
          next.promise.then(
            () => entries.set(key, next),
            () => (cached.refreshing = false),
          );
        }
        return cached.promise as Promise<T>;
      }
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!);
      const entry = load(key, fetcher);
      entries.set(key, entry);
      return entry.promise as Promise<T>;
    },
  };
}
