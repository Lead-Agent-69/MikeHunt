import type { MarketSummary } from "./explorer";
import { reportedPrice } from "@/lib/deals/reported-price";

export const MARKET_NEXT_CHECKS = {
  confirm_price:
    "Confirm the full asking or buy-now price at the source; bids, deposits and payments are different amounts.",
  check_photos:
    "Review source photos and request missing views before judging condition.",
  check_freshness:
    "Recheck source availability and the latest price before making a shortlist.",
  inspect_condition:
    "Compare year, mileage, title and damage evidence, then arrange an inspection.",
  verify_location:
    "Confirm the vehicle's pickup location and include transport, fees and tax in the budget.",
} as const;
export type MarketNextCheck = keyof typeof MARKET_NEXT_CHECKS;

export function marketBriefFacts(summary: MarketSummary, capped: boolean) {
  const unverified = Object.entries(summary.priceKinds)
    .filter(([kind]) => !["asking", "buy_now", "current_bid"].includes(kind))
    .reduce((sum, [, n]) => sum + n, 0);
  return `${summary.count.toLocaleString()} indexed matches across ${Object.keys(summary.sources).length} sources${capped ? " in a limited sample" : ""}. ${summary.withPhotos.toLocaleString()} include source photo URLs; ${summary.fresh24h.toLocaleString()} were last observed within 24 hours. ${summary.askingSample.toLocaleString()} comparable cash asking listings${summary.medianAsk != null ? ` have a median asking price of ${reportedPrice(summary.medianAsk)}` : " support no asking-price median yet"}. ${unverified.toLocaleString()} listings have payment, reference or unverified price evidence. These observations are not completed sales or a vehicle valuation.`;
}

export function defaultMarketChecks(summary: MarketSummary): MarketNextCheck[] {
  return [
    summary.askingSample < 5 ? "confirm_price" : "inspect_condition",
    summary.fresh24h < summary.count ? "check_freshness" : "verify_location",
  ];
}

/** AI may prioritize checks; it never authors market numbers or factual claims. */
export function readMarketChecks(text: string): MarketNextCheck[] | null {
  try {
    const parsed: unknown = JSON.parse(text.trim());
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      parsed.some(
        (key) =>
          typeof key !== "string" ||
          !Object.prototype.hasOwnProperty.call(MARKET_NEXT_CHECKS, key),
      )
    )
      return null;
    return new Set(parsed).size === 2 ? (parsed as MarketNextCheck[]) : null;
  } catch {
    return null;
  }
}

export function marketBriefReport(
  summary: MarketSummary,
  capped: boolean,
  checks = defaultMarketChecks(summary),
) {
  return `${marketBriefFacts(summary, capped)} Next checks: ${checks.map((key) => MARKET_NEXT_CHECKS[key]).join(" ")}`;
}
