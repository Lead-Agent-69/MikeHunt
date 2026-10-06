import { dealerSourceIdForHost } from "@/lib/sources/source-meta";

// Watched dealers live in user_preferences.prefs (signed-in) or the httpOnly guest prefs cookie
// (guests), both through /api/preferences. localStorage "dealer-watch-v1" is legacy and is
// migrated into prefs once, then removed.

export const LEGACY_DEALER_WATCH_KEY = "dealer-watch-v1";
export const DEALER_WATCH_MIGRATED_KEY = "dealer-watch-v1-migrated";
export const MAX_WATCHED_DEALERS = 200;
const MAX_ENTRY_LENGTH = 253;

/** Dedupe, trim and cap a host / source-id list. Non-strings are dropped. */
export function compactWatchList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const clean = item.trim();
    if (!clean || clean.length > MAX_ENTRY_LENGTH || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= MAX_WATCHED_DEALERS) break;
  }
  return out;
}

/** Saved hosts first, then any legacy hosts not already saved. */
export function mergeWatchedHosts(saved: unknown, legacy: unknown): string[] {
  return compactWatchList([
    ...compactWatchList(saved),
    ...compactWatchList(legacy),
  ]);
}

/** Discovery dealer source ids for the watched hosts, plus any ids saved directly. */
export function watchedDealerSourceIds(
  hosts: unknown,
  savedIds: unknown = [],
): string[] {
  const derived = compactWatchList(hosts)
    .map((host) => dealerSourceIdForHost(host))
    .filter((id): id is string => Boolean(id));
  return compactWatchList([...derived, ...compactWatchList(savedIds)]);
}

/** Toggle one host; returns the next host list and matching source ids to persist. */
export function toggleWatchedHost(hosts: string[], host: string) {
  const current = compactWatchList(hosts);
  const next = current.includes(host)
    ? current.filter((item) => item !== host)
    : compactWatchList([...current, host]);
  return {
    watchedDealerHosts: next,
    watchedDealerSourceIds: watchedDealerSourceIds(next),
  };
}

export const WATCH_LIST_PREF_KEYS = [
  "watchedDealerHosts",
  "watchedDealerSourceIds",
] as const;

/**
 * Validate the watch-list keys of a /api/preferences PUT patch. Returns an error string when a key
 * is present but not a string array, otherwise the patch with those keys compacted.
 */
export function sanitizeWatchListPatch(
  patch: Record<string, unknown>,
): { patch: Record<string, unknown> } | { error: string } {
  const next = { ...patch };
  for (const key of WATCH_LIST_PREF_KEYS) {
    if (!(key in next)) continue;
    const value = next[key];
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      return { error: `${key} must be an array of strings` };
    }
    next[key] = compactWatchList(value);
  }
  return { patch: next };
}
