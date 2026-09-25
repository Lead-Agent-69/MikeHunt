// lib/resolve.ts
// Single-value fallback chain — the cousin of firstNonEmpty() (which resolves LISTS). Declare an ORDERED
// set of providers for one data need (a photo, a price basis, a geocode); the first that yields a non-empty
// value wins, and you get PROVENANCE back — which tier answered + its position — for labeling, confidence,
// and logging. This is the organizing primitive for "fallback after fallback" on single values: cheap /
// authoritative providers first, degraded / synthetic ones last, and the caller always knows which fired.

export interface Provider<T> {
  name: string;
  get: () => T | null | undefined;
}

export interface Resolved<T> {
  value: T;
  source: string; // which provider answered
  tier: number; // 0-based position in the chain (0 = most-preferred/authoritative)
}

const ok = (v: unknown): boolean => v != null && v !== "";

/** Return the first provider's non-empty value + provenance, or null if every tier came up empty. */
export function resolveChain<T>(providers: Provider<T>[]): Resolved<T> | null {
  for (let i = 0; i < providers.length; i++) {
    try {
      const v = providers[i].get();
      if (ok(v)) return { value: v as T, source: providers[i].name, tier: i };
    } catch {
      /* provider threw — treat as empty, fall through to the next */
    }
  }
  return null;
}

/** Async variant — for providers that fetch (an API, an aggregator). Same semantics, awaited in order. */
export async function resolveChainAsync<T>(
  providers: Array<{
    name: string;
    get: () => Promise<T | null | undefined> | T | null | undefined;
  }>,
): Promise<Resolved<T> | null> {
  for (let i = 0; i < providers.length; i++) {
    try {
      const v = await providers[i].get();
      if (ok(v)) return { value: v as T, source: providers[i].name, tier: i };
    } catch {
      /* next */
    }
  }
  return null;
}
