// In-memory TTL cache for expensive read endpoints. The discover/market/heatmap/arbitrage feeds each
// recompute from thousands of rows on every request (~1-2s) — caching the heavy result for a short
// window makes repeat loads instant, so a dealer never waits for the same data twice. Per-instance,
// best-effort; freshness stays high because TTLs are short and scrapers update continuously anyway.
type Entry = { value: unknown; expires: number };
const store = new Map<string, Entry>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  // Optional guard: skip caching when this returns false (e.g. an empty/failed result that must NOT stick
  // for the full TTL and starve every subsequent request — retry it next call instead). Default: cache all.
  shouldCache?: (value: T) => boolean,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const value = await fn();
  if (!shouldCache || shouldCache(value)) {
    store.set(key, { value, expires: now + ttlMs });
    if (store.size > 300) {
      for (const [k, e] of Array.from(store.entries()))
        if (e.expires <= now) store.delete(k);
    }
  }
  return value;
}

/** Drop cache entries (all, or those whose key starts with `prefix`) — e.g. after a fresh scrape. */
export function invalidate(prefix?: string): void {
  if (!prefix) return store.clear();
  for (const k of Array.from(store.keys()))
    if (k.startsWith(prefix)) store.delete(k);
}
