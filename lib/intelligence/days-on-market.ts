// lib/intelligence/days-on-market.ts
// Days a listing has been live (from first_seen_at). For a dealer this is a negotiating signal —
// a car sitting 45+ days = motivated seller. Pure, $0.

export function daysOnMarket(
  firstSeenAt?: string | Date | null,
): number | null {
  if (!firstSeenAt) return null;
  const t =
    typeof firstSeenAt === "string"
      ? Date.parse(firstSeenAt)
      : firstSeenAt.getTime();
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((Date.now() - t) / 86400000);
  return days < 0 ? 0 : days;
}

export interface DomTier {
  color: string;
  label: string;
}

// green = fresh, amber = aging, red = stale/motivated.
export function domTier(days: number): DomTier {
  if (days <= 14) return { color: "var(--green)", label: "fresh" };
  if (days <= 45) return { color: "var(--amber)", label: "aging" };
  return { color: "var(--red)", label: "stale — motivated seller" };
}
