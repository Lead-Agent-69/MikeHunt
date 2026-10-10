/**
 * Load-state copy that never reports a false zero / "never" / error while data or auth is still
 * resolving. Before: /scan painted "0 active deals · Last loaded: never" until the first /api/scan
 * response landed (and on the SSR pass, where SWR reports isLoading=false), and /saved headed the
 * page "Could not load your account watchlist." while the session and first fetch were in flight.
 */

export function scanStatusCopy(input: {
  hasData: boolean;
  error: string | null;
  total: number;
  lastLoadedAt: Date | null;
}): { count: string | null; countLabel: string; lastLoaded: string } {
  if (!input.hasData) {
    return input.error
      ? {
          count: null,
          countLabel: "listings not loaded",
          lastLoaded: "not yet",
        }
      : {
          count: null,
          countLabel: "Loading listings…",
          lastLoaded: "loading…",
        };
  }
  return {
    count: Number(input.total || 0).toLocaleString(),
    countLabel: input.total === 1 ? "active listing" : "active listings",
    lastLoaded: input.lastLoadedAt
      ? input.lastLoadedAt.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "just now",
  };
}

export type SavedSyncStatus = "checking" | "guest" | "unavailable" | "ready";

/**
 * Saved status from auth + fetch state. "checking" until auth has resolved AND (for a signed-in
 * user) the first account fetch has either returned or failed — so an unresolved session or an
 * in-flight request is never shown as an error.
 */
export function savedSyncStatus(input: {
  authLoading: boolean;
  userId: string | null;
  fetchLoading: boolean;
  hasData: boolean;
  error: unknown;
}): SavedSyncStatus {
  if (input.authLoading) return "checking";
  if (!input.userId) return "guest";
  if (input.error) return "unavailable";
  if (input.fetchLoading || !input.hasData) return "checking";
  return "ready";
}

export function savedWatchlistHeadline(
  status: SavedSyncStatus,
  canShowLocalSaves: boolean,
): string {
  switch (status) {
    case "ready":
      return "Your account watchlist is connected.";
    case "checking":
      return "Checking your account watchlist…";
    case "unavailable":
      return canShowLocalSaves
        ? "Account sync is unavailable — local watchlist still works."
        : "Could not load your account watchlist.";
    case "guest":
    default:
      return canShowLocalSaves
        ? "Your watchlist is saved on this device."
        : "Save a vehicle to start watching locally.";
  }
}
