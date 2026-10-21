/** Comparison snapshots may be up to a week old; they are not live-price promises. */
export const PRICE_COMPARISON_DAYS = 7;
const FUTURE_TOLERANCE_MS = 60_000;

export function isRecentPriceObservation(
  timestamp: string | null | undefined,
  now = Date.now(),
): boolean {
  const observed = Date.parse(timestamp || "");
  return (
    Number.isFinite(observed) &&
    observed <= now + FUTURE_TOLERANCE_MS &&
    observed >= now - PRICE_COMPARISON_DAYS * 86_400_000
  );
}

/** Malformed or elapsed closing times cannot support cash comparisons. */
export function hasOpenPriceWindow(
  auctionEndAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (auctionEndAt == null || auctionEndAt === "") return true;
  const endsAt = Date.parse(auctionEndAt);
  return Number.isFinite(endsAt) && endsAt > now;
}
