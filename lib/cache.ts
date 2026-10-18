// In-memory TTL cache for expensive read endpoints. The discover/market/heatmap/arbitrage feeds each
// recompute from thousands of rows on every request (~1-2s) — caching the heavy result for a short
// window makes repeat loads instant, so a dealer never waits for the same data twice. Per-instance,
// best-effort; freshness stays high because TTLs are short and scrapers update continuously anyway.
type Entry = { value: unknown; expires: number };
const store = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  // Optional guard: skip caching when this returns false (e.g. an empty/failed result that must NOT stick
  // for the full TTL and starve every subsequent request — retry it next call instead). Default: cache all.
  shouldCache?: (value: T) => boolean,
  // Expensive datasets can bound their namespace without evicting unrelated account data.
  limits?: { prefix: string; maxEntries: number },
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  // Defer execution so synchronous throws also share the same cleanup path.
  const task = Promise.resolve()
    .then(fn)
    .then((value) => {
      if (pending.get(key) === task && (!shouldCache || shouldCache(value))) {
        const completedAt = Date.now();
        store.set(key, { value, expires: completedAt + ttlMs });
        if (limits && key.startsWith(limits.prefix)) {
          const group = Array.from(store.keys()).filter((k) =>
            k.startsWith(limits.prefix),
          );
          const excess =
            group.length - Math.max(1, Math.floor(limits.maxEntries));
          for (const oldest of group.slice(0, Math.max(0, excess)))
            store.delete(oldest);
        }
        if (store.size > 300) {
          for (const [k, e] of Array.from(store.entries()))
            if (e.expires <= completedAt) store.delete(k);
        }
      }
      return value;
    })
    .finally(() => {
      if (pending.get(key) === task) pending.delete(key);
    });
  pending.set(key, task);
  return task;
}

/** Drop cache entries (all, or those whose key starts with `prefix`) — e.g. after a fresh scrape. */
export function invalidate(prefix?: string): void {
  if (!prefix) {
    store.clear();
    pending.clear();
    return;
  }
  for (const k of Array.from(store.keys()))
    if (k.startsWith(prefix)) store.delete(k);
  for (const k of Array.from(pending.keys()))
    if (k.startsWith(prefix)) pending.delete(k);
}
