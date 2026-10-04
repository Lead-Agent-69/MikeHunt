export type DecisionEvidenceState =
  | "verified"
  | "auction_watch"
  | "repairable"
  | "price_anomaly"
  | "needs_evidence";

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

const REPAIRABLE_RE =
  /salvage|rebuilt|parts|flood|wrecked|repairable|non[- ]?run|not running|mechanic special|damage/i;

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
  const text = `${input.condition || ""} ${input.damageType || ""}`;
  const isAuction = AUCTION_SOURCES.has(source);
  const repairable = REPAIRABLE_RE.test(text);
  const priceAnomaly =
    Boolean(analysis.priceImplausible) ||
    ["typo", "implausible"].includes(String(analysis.priceSanity || ""));
  const hasComparableEvidence =
    (valuation.source === "comparables" &&
      Number(valuation.compCount || valuation.sampleCount || 0) >= 3) ||
    (valuation.source === "third_party" && valuation.confidence !== "none");
  const identityComplete = Boolean(input.vin) && Number(input.mileage || 0) > 0;

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
        "The displayed amount is a current auction price, not a final all-in purchase price.",
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
    !identityComplete
  ) {
    return {
      state: "needs_evidence",
      label: "Needs evidence",
      summary:
        "The current information is not sufficient for a purchase recommendation.",
      nextCheck: !identityComplete
        ? "Verify VIN and mileage, then confirm title and condition."
        : "Confirm comparable sales, title, condition, and all-in costs before deciding.",
      acquisitionReady: false,
    };
  }

  return {
    state: "verified",
    label: "Evidence-backed buy",
    summary:
      "The valuation and listing details meet the current purchase recommendation threshold.",
    nextCheck:
      "Review the source listing and confirm the final transaction terms before purchase.",
    acquisitionReady: true,
  };
}
