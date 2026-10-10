import { isSoldCompAnchored } from "@/lib/buyer/flip-lead";

// Arbitrage profit math is only honest when both sides of the spread are real:
//   • the resale side is anchored to verified sold comps (not an ask-haircut / markup guess), and
//   • the buy side is a real price, not an auction's placeholder opening bid ($100 with no bids).
// Rows that fail either check stay listable (needsComps) but carry NO profit number (null, never 0)
// and never feed best flip, profit pools, route totals, or margins.

/** Opening bids at or under this, with no bids placed, are placeholders, not a buy price. */
export const PLACEHOLDER_BID_MAX = 500;
/** An ask under this fraction of resale with no bids is a placeholder, not a real price. */
export const PLACEHOLDER_ASK_RATIO = 0.05;
/** A margin above this (profit / ask, in %) is an outlier even with comps: flag, do not pool. */
export const MAX_HONEST_MARGIN_PCT = 300;

export type ArbitrageExclusionReason =
  | "unverified_comps"
  | "placeholder_bid"
  | "outlier_margin";

type DealLike = {
  askPrice?: number;
  sellEstimate?: number;
  mmrValue?: number;
  bidCount?: number;
  sellerType?: string;
  auctionEndAt?: unknown;
  source?: string;
  dealAnalysis?: unknown;
  deal_analysis?: unknown;
};

const AUCTION_SOURCES = /copart|iaai|salvage|auction|manheim|adesa|acv|bidfax/i;

function isAuctionRow(deal: DealLike): boolean {
  return (
    deal.sellerType === "auction" ||
    deal.auctionEndAt != null ||
    AUCTION_SOURCES.test(String(deal.source || ""))
  );
}

/** True when the ask is a placeholder (opening bid / token price), not something you could buy at. */
export function isPlaceholderBid(deal: DealLike): boolean {
  const ask = Number(deal.askPrice) || 0;
  if (ask <= 0) return true;
  const noBids = !(Number(deal.bidCount) > 0);
  if (!noBids) return false;
  if (isAuctionRow(deal) && ask <= PLACEHOLDER_BID_MAX) return true;
  const resale = Number(deal.sellEstimate) || 0;
  return resale > 0 && ask < resale * PLACEHOLDER_ASK_RATIO;
}

/** True when the resale side is anchored to verified sold comps. */
export function hasVerifiedComps(deal: DealLike): boolean {
  return isSoldCompAnchored(deal.dealAnalysis ?? deal.deal_analysis);
}

/**
 * Why this row cannot count toward arbitrage profit, or null when it can.
 * `profitMargin` is the provisional margin (%) so outliers get flagged even with comps.
 */
export function arbitrageExclusion(
  deal: DealLike,
  profitMargin?: number | null,
): ArbitrageExclusionReason | null {
  if (isPlaceholderBid(deal)) return "placeholder_bid";
  if (!hasVerifiedComps(deal)) return "unverified_comps";
  if (profitMargin != null && profitMargin > MAX_HONEST_MARGIN_PCT)
    return "outlier_margin";
  return null;
}
