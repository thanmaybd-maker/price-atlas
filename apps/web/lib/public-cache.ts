// Public product data only. Do not cache accounts, cookies or notification data here.
export function createReadCache(ttlMs = 30000, maxEntries = 32) {
  const entries = new Map<string, { until: number; promise: Promise<unknown> }>();
  return {
    read<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
      const cached = entries.get(key);
      if (cached && cached.until > Date.now()) return cached.promise as Promise<T>;
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!);
      const entry = {
        until: Date.now() + ttlMs,
        promise: Promise.resolve().then(fetcher) as Promise<unknown>,
      };
      entry.promise = entry.promise.catch((error) => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
      entries.set(key, entry);
      return entry.promise as Promise<T>;
    },
  };
}
