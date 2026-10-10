/**
 * Saved-search matching with a per-search precision setting (user_saved_searches.match_precision).
 *
 * What each setting ACTUALLY changes (keep UI copy in sync with this file):
 *  - "standard" (default): the original rules. Make exact, model exact, year range, max price,
 *    target profit, BUY-only, and radius (deals we can't place on the map are NOT excluded).
 *  - "tighter": standard, plus
 *      1. skip deals the engine rated "pass" (even when BUY-only is off),
 *      2. skip deals flagged as an implausible / teaser price,
 *      3. with a radius set, skip deals we can't place (no coordinates) instead of letting them in.
 *  - "looser": standard, except
 *      1. model matches when the listing's model contains the search model
 *         ("F-150" matches "F-150 XLT"),
 *      2. the year range widens by one year on each side.
 *    Price, profit, BUY-only and radius are unchanged.
 *
 * Thumbs up/down on matches does not change matching by itself. It only feeds a suggestion
 * (precisionSuggestion) that the user can choose to apply.
 */
import { withinMiles } from "@/lib/geo/distance";

export type MatchPrecision = "looser" | "standard" | "tighter";
export type DeliveryMode = "instant" | "digest";

export function normalizePrecision(value: unknown): MatchPrecision {
  return value === "tighter" || value === "looser" ? value : "standard";
}

export function normalizeDeliveryMode(value: unknown): DeliveryMode {
  return value === "digest" ? "digest" : "instant";
}

type LatLng = { lat: number; lng: number };

export function matchesSavedSearch(
  deal: any,
  search: any,
  home?: LatLng | null,
): boolean {
  const precision = normalizePrecision(search?.match_precision);
  const yearSlack = precision === "looser" ? 1 : 0;

  if (search.make && search.make.toLowerCase() !== deal.make?.toLowerCase())
    return false;

  if (search.model) {
    const want = String(search.model).toLowerCase();
    const have = String(deal.model || "").toLowerCase();
    if (precision === "looser" ? !have.includes(want) : have !== want)
      return false;
  }

  if (search.min_year && deal.year < Number(search.min_year) - yearSlack)
    return false;
  if (search.max_year && deal.year > Number(search.max_year) + yearSlack)
    return false;
  if (search.max_price && deal.ask_price > search.max_price) return false;

  // Profit gate: require the engine's net profit to clear the target.
  if (
    search.target_profit &&
    Number(deal.true_net_profit ?? 0) < Number(search.target_profit)
  )
    return false;

  // Verdict gate: only engine-verdict GO deals when the search opts in.
  if (search.require_go && deal.deal_verdict !== "go") return false;

  if (precision === "tighter") {
    if (deal.deal_verdict === "pass") return false;
    if (deal.deal_analysis?.priceImplausible) return false;
  }

  // Radius gate. Standard/looser don't gate on distance when either side lacks coordinates (avoid
  // silently hiding deals we just couldn't place); tighter excludes unplaceable deals.
  if (search.max_distance_miles && search.max_distance_miles > 0) {
    const placeable = home && deal.lat != null && deal.lng != null;
    if (placeable) {
      if (
        !withinMiles(
          home,
          { lat: deal.lat, lng: deal.lng },
          Number(search.max_distance_miles),
        )
      )
        return false;
    } else if (precision === "tighter" && home) {
      return false;
    }
  }

  return true;
}

export const MIN_RATINGS_FOR_SUGGESTION = 5;

/**
 * Suggest a precision change from thumbs ratings (+1 / -1). Only a suggestion: nothing changes
 * unless the user applies it. Needs at least MIN_RATINGS_FOR_SUGGESTION ratings.
 *  - >= 60% thumbs-down → one step tighter (looser → standard → tighter).
 *  - >= 90% thumbs-up while on "tighter" → back to standard (you may be missing good matches).
 */
export function precisionSuggestion(
  ratings: readonly number[],
  current: MatchPrecision,
): { suggest: MatchPrecision | null; up: number; down: number; total: number } {
  const up = ratings.filter((r) => r > 0).length;
  const down = ratings.filter((r) => r < 0).length;
  const total = up + down;
  let suggest: MatchPrecision | null = null;
  if (total >= MIN_RATINGS_FOR_SUGGESTION) {
    if (down / total >= 0.6 && current !== "tighter")
      suggest = current === "looser" ? "standard" : "tighter";
    else if (up / total >= 0.9 && current === "tighter") suggest = "standard";
  }
  return { suggest, up, down, total };
}
