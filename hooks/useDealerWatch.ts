"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import {
  DEALER_WATCH_MIGRATED_KEY,
  LEGACY_DEALER_WATCH_KEY,
  compactWatchList,
  mergeWatchedHosts,
  toggleWatchedHost,
  watchedDealerSourceIds,
} from "@/lib/preferences/watched-dealers";

// Watchlist of favorited dealers (by host). Persisted server-side in prefs.watchedDealerHosts /
// prefs.watchedDealerSourceIds via /api/preferences (user_preferences for signed-in users, the
// httpOnly guest prefs cookie for guests). The old localStorage list is migrated in once.

function readLegacy(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return compactWatchList(
      JSON.parse(localStorage.getItem(LEGACY_DEALER_WATCH_KEY) || "[]"),
    );
  } catch {
    return [];
  }
}

function legacyMigrated(): boolean {
  try {
    return Boolean(localStorage.getItem(DEALER_WATCH_MIGRATED_KEY));
  } catch {
    return true;
  }
}

function markLegacyMigrated() {
  try {
    localStorage.setItem(DEALER_WATCH_MIGRATED_KEY, "1");
    localStorage.removeItem(LEGACY_DEALER_WATCH_KEY);
  } catch {
    /* privacy mode — non-fatal */
  }
}

export function useDealerWatch() {
  const { prefs, save, isLoading } = usePreferences();
  // Stable identities so effects that depend on hosts/sourceIds don't loop on every render.
  const hostsKey = JSON.stringify(compactWatchList(prefs.watchedDealerHosts));
  const idsKey = JSON.stringify(compactWatchList(prefs.watchedDealerSourceIds));
  const hosts = useMemo<string[]>(() => JSON.parse(hostsKey), [hostsKey]);
  const sourceIds = useMemo<string[]>(
    () => watchedDealerSourceIds(hosts, JSON.parse(idsKey)),
    [hosts, idsKey],
  );
  const ready = !isLoading;

  const saveRef = useRef(save);
  saveRef.current = save;
  const migrationStarted = useRef(false);

  useEffect(() => {
    if (!ready || migrationStarted.current || legacyMigrated()) return;
    migrationStarted.current = true;
    const legacy = readLegacy();
    if (!legacy.length) {
      markLegacyMigrated();
      return;
    }
    const next = mergeWatchedHosts(hosts, legacy);
    saveRef
      .current({
        watchedDealerHosts: next,
        watchedDealerSourceIds: watchedDealerSourceIds(next),
      })
      .then(markLegacyMigrated)
      .catch(() => {
        /* keep the legacy list; retry on the next page load */
      });
  }, [ready, hosts]);

  const toggle = useCallback(
    (host: string) => {
      if (!host || !ready) return;
      saveRef.current(toggleWatchedHost(hosts, host)).catch(() => {
        /* SWR revalidates back to the saved list */
      });
    },
    [hosts, ready],
  );

  return {
    hosts,
    sourceIds,
    ready,
    has: (h: string) => hosts.includes(h),
    toggle,
    count: hosts.length,
  };
}
