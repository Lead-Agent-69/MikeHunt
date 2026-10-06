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
  configured?: boolean;
}

/**
 * Cards for the For You rail, or [] when the rail should stay hidden: no response, not
 * personalized (no signals yet, or the deal_signals table isn't there), or no usable items.
 */
export function forYouCards(
  res: ForYouResponse | null | undefined,
  flipDesk: boolean,
): DiscoveryDeal[] {
  if (!res || res.configured === false || res.personalized !== true) return [];
  const items = Array.isArray(res.items) ? res.items : [];
  return items
    .filter(
      (d) =>
        d &&
        typeof d.id === "string" &&
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
      };
      if (!flipDesk) for (const k of FLIP_ONLY) delete card[k];
      return card as DiscoveryDeal;
    });
}
