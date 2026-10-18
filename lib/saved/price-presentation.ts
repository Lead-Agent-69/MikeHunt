import {
  positivePrice,
  priceEvidenceLabel,
  type PriceEvidence,
} from "@/lib/deals/acquisition-price";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Device snapshots retain reported amounts, not a verified purchase price. */
export function savedPricePresentation(
  amount: unknown,
  evidence?: PriceEvidence,
) {
  let reported: unknown;
  if (evidence?.kind === "asking") reported = evidence.askingPrice;
  else if (evidence?.kind === "current_bid") reported = evidence.currentBid;
  else if (evidence?.kind === "buy_now") reported = evidence.buyNow;
  else if (evidence?.kind === "reference") reported = evidence.referenceValue;
  const value =
    positivePrice(reported) ??
    positivePrice(evidence?.listedAmount) ??
    positivePrice(amount);
  return {
    label:
      evidence?.kind === "asking"
        ? "Asking price"
        : evidence?.kind === "reference"
          ? "Reference value"
          : priceEvidenceLabel(evidence) || "Unverified advertised amount",
    amount:
      value === undefined || value <= 0
        ? "Not reported"
        : currency.format(value),
  };
}
