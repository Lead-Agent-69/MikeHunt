import type { DiscoveryDeal } from "@/components/discovery/types";

/**
 * Flip economics and seller contact a non-flip desk never sees. Mirrors CARD_FLIP_ONLY_FIELDS in
 * lib/deals/deal-desk-access.ts (server-only module), applied again on the client because the
 * API redacts by the saved desk while Discover renders for the desk in use right now.
 */
const FLIP_ONLY = [
  "true_net_profit",
  "trueNetProfit",
  "netProfit",
  "profit",
  "profit_estimate",
  "profitEstimate",
  "profit_score",
  "profitScore",
  "score",
  "recommended_max_bid",
  "recommendedMaxBid",
  "estimated_net_profit",
  "roi",
  "roiPct",
  "totalProfit",
  "downsideBuffer",
  "avgRoi",
  "maxProfit",
  "rankScore",
  "ai_wholesale_estimate",
  "ai_retail_estimate",
  "ai_rationale",
  "aiRationale",
  "is_arbitrage_opportunity",
  "contact",
  "sellerPhone",
  "sellerEmail",
  "sellerContactUrl",
  // Nested analysis / forecasts can carry profit or max bid; the rail doesn't need them.
  "dealAnalysis",
  "deal_analysis",
  "prediction",
] as const;

export interface ForYouResponse {
  items?: Array<Record<string, any>>;
  personalized?: boolean;
  /** false = deal_signals missing / not configured; true = cold start or personalized. */
  signalsAvailable?: boolean;
  configured?: boolean;
}

/**
 * Soft empty-strip copy when signed-in For You has nothing personalized yet.
 * Returns null when the rail should stay fully hidden (no response / network /
 * unsigned → fetchForYou null; or when personalized cards will render).
 */
export function forYouHonestyMessage(
  res: ForYouResponse | null | undefined,
): string | null {
  if (!res || res.configured === false) return null;
  if (res.personalized === true) return null;
  if (res.signalsAvailable === false) {
    return "Personalized picks aren't available yet (signals not configured).";
  }
  // Cold start: table exists but no usable signals yet (or API omitted the flag).
  if (res.signalsAvailable === true || res.personalized === false) {
    return "For You builds from listings you open or save — nothing personalized yet.";
  }
  return null;
}

/**
 * Cards for the For You rail, or [] when the rail should stay hidden: no response, not
 * personalized (cold start or signalsAvailable:false), or no usable items. The API sets
 * signalsAvailable so callers can tell missing table apart from an empty cold start.
 */
export function forYouCards(
  res: ForYouResponse | null | undefined,
  flipDesk: boolean,
  eligibleDeals?: DiscoveryDeal[],
): DiscoveryDeal[] {
  if (!res || res.configured === false || res.personalized !== true) return [];
  const items = Array.isArray(res.items) ? res.items : [];
  // Recommendations cannot widen the active search or replace richer listing evidence.
  const eligible = eligibleDeals
    ? new Map(eligibleDeals.map((deal) => [deal.id, deal]))
    : null;
  return items
    .filter(
      (d) =>
        d &&
        typeof d.id === "string" &&
        (!eligible || eligible.has(d.id)) &&
        Array.isArray(d.images) &&
        d.images[0] &&
        Number(d.askPrice) > 0,
    )
    .map((d) => {
      const card: Record<string, any> = {
        ...d,
        title:
          d.title || `${d.year ?? ""} ${d.make ?? ""} ${d.model ?? ""}`.trim(),
        askPrice: Number(d.askPrice),
        sellEstimate: d.sellEstimate ?? undefined,
        winReason:
          typeof d.forYouReason === "string" && d.forYouReason
            ? d.forYouReason
            : undefined,
        // No market grade or discount is computed for these rows; DiscoveryCard needs the keys.
        grade: "unknown",
        discountPct: 0,
        gradeLabel: "",
        alsoOn: [],
        listingCount: 1,
        ...(eligible?.get(d.id) || {}),
      };
      if (!flipDesk) for (const k of FLIP_ONLY) delete card[k];
      return card as DiscoveryDeal;
    });
}
