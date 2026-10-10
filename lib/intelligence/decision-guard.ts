import { isAuctionChannel } from "@/lib/sources/source-meta";
import { hasReportedRepairRisk } from "./repair-risk";
import { hasRecentSoldEvidence } from "@/lib/valuation/evidence-confidence";
import { dealFreshness } from "@/lib/deals/freshness";

export type DecisionEvidenceState =
  | "verified"
  | "auction_watch"
  | "repairable"
  | "price_anomaly"
  | "needs_evidence"
  | "not_live";

export type DecisionEvidence = {
  state: DecisionEvidenceState;
  label: string;
  summary: string;
  nextCheck: string;
  acquisitionReady: boolean;
};

const AUCTION_SOURCES = new Set([
  "copart",
  "iaa",
  "manheim",
  "adesa",
  "acv",
  "publicsurplus",
  "govdeals",
  "gsa",
  "gsa_auctions",
  "municibid",
  "govplanet",
  "purplewave",
]);

type GuardInput = {
  source?: string | null;
  condition?: string | null;
  damageType?: string | null;
  vin?: string | null;
  mileage?: number | null;
  buyNowPrice?: number | null;
  dealVerdict?: string | null;
  dealAnalysis?: any;
  valuation?: any;
  // Liveness inputs: a frozen / stale / ended row must never be described as a current price.
  sourceUrl?: string | null;
  lastSeenAt?: string | Date | null;
  auctionEndAt?: string | Date | null;
};

export type PurchaseEvidenceGates = {
  priceMeaningConfirmed?: boolean;
  titleReviewed?: boolean;
  conditionInspected?: boolean;
  costsConfirmed?: boolean;
};

/**
 * Separates an opportunity worth acquiring from a listing that needs more proof.
 * A low current auction bid is never a completed purchase price, and a damaged unit
 * is never valued as clean retail without condition-specific evidence.
 */
export function assessDecisionEvidence(input: GuardInput): DecisionEvidence {
  const analysis = input.dealAnalysis || {};
  const valuation = input.valuation || analysis.valuation || {};
  const source = String(input.source || "").toLowerCase();
  const isAuction = AUCTION_SOURCES.has(source) || isAuctionChannel(source);
  const repairable = hasReportedRepairRisk(input.condition, input.damageType);
  const priceAnomaly =
    Boolean(analysis.priceImplausible) ||
    ["typo", "implausible"].includes(String(analysis.priceSanity || ""));
  const hasComparableEvidence =
    valuation.source === "comparables" &&
    ["high", "medium"].includes(valuation.confidence) &&
    Number.isInteger(valuation.compCount) &&
    valuation.compCount >= 3 &&
    valuation.soldLane === "clean" &&
    hasRecentSoldEvidence(valuation);
  const identityComplete =
    /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(input.vin || "").trim()) &&
    typeof input.mileage === "number" &&
    Number.isFinite(input.mileage) &&
    input.mileage >= 0;
  // Legacy scores and seller claims cannot establish completed purchase checks.
  const gates: PurchaseEvidenceGates = analysis.evidenceGates || {};
  const missingChecks = [
    gates.priceMeaningConfirmed !== true
      ? "Confirm the purchase price and terms."
      : null,
    gates.titleReviewed !== true
      ? "Review title documents and purchase eligibility."
      : null,
    gates.conditionInspected !== true
      ? "Get an inspection and resolve condition findings."
      : null,
    gates.costsConfirmed !== true
      ? "Confirm repair, transport, fees and holding costs."
      : null,
  ].filter(Boolean);

  // Only judge liveness when the caller passed a seen time (older callers omit it).
  const liveness =
    input.lastSeenAt !== undefined || input.auctionEndAt !== undefined
      ? dealFreshness({
          source: input.source,
          sourceUrl: input.sourceUrl,
          lastSeenAt: input.lastSeenAt,
          auctionEndAt: input.auctionEndAt,
        })
      : null;
  if (liveness && !liveness.live) {
    const why =
      liveness.state === "ended"
        ? "The auction has ended, so this amount is no longer available."
        : liveness.state === "frozen"
          ? "MikeHunt no longer refreshes this source (its terms ban automated access), so this is the last recorded amount, not a current price."
          : "This listing has not been re-checked recently, so this is the last recorded amount, not a current price.";
    return {
      state: "not_live",
      label: liveness.label,
      summary: why,
      nextCheck:
        liveness.state === "ended"
          ? "Look for a relisting or a similar vehicle that is still live."
          : "Open the source to confirm the vehicle is still available and what it costs now.",
      acquisitionReady: false,
    };
  }

  if (priceAnomaly) {
    return {
      state: "price_anomaly",
      label: "Price needs verification",
      summary:
        "This price is inconsistent with the available vehicle data, so it is not eligible for a buy recommendation.",
      nextCheck:
        "Confirm the real purchase price and listing terms with the source.",
      acquisitionReady: false,
    };
  }

  if (isAuction) {
    return {
      state: "auction_watch",
      label: repairable ? "Repairable auction watch" : "Auction watch",
      summary:
        Number(input.buyNowPrice) > 0
          ? "A buy-now price is reported, but fees, eligibility and condition still need verification. A buy-now amount does not establish all-in cost."
          : "The displayed amount is a current auction price, not a final all-in purchase price.",
      nextCheck: repairable
        ? "Verify title, damage photos, repair quote, auction fees, and final bid before deciding."
        : "Verify auction fees, final bid, title, condition, and comparable sales before deciding.",
      acquisitionReady: false,
    };
  }

  if (repairable) {
    return {
      state: "repairable",
      label: "Repairable vehicle",
      summary:
        "This vehicle belongs in a repair-aware category, not a clean-vehicle price comparison.",
      nextCheck:
        "Confirm title status, damage scope, repair quote, and condition-adjusted comparable sales.",
      acquisitionReady: false,
    };
  }

  if (
    input.dealVerdict !== "go" ||
    !hasComparableEvidence ||
    !identityComplete ||
    missingChecks.length > 0
  ) {
    return {
      state: "needs_evidence",
      label: "Needs evidence",
      summary:
        "The current information is not sufficient for a purchase recommendation.",
      nextCheck: !identityComplete
        ? "Verify VIN and mileage, then confirm title and condition."
        : !hasComparableEvidence
          ? "Find relevant dated comparisons; asking prices are not confirmed sale prices."
          : missingChecks[0] ||
            "Review the economics and your buying requirements before deciding.",
      acquisitionReady: false,
    };
  }

  return {
    state: "verified",
    label: "Buy candidate",
    summary:
      "The recorded evidence meets the current research threshold. This is a candidate, not a guarantee or purchase approval.",
    nextCheck:
      "Review the source listing and confirm the final transaction terms before purchase.",
    acquisitionReady: true,
  };
}
