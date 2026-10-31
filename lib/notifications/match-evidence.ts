import { recommendationEvidence } from "@/lib/deals/recommendation-evidence";

/** Old callers may send a modeled profit. It is never evidence for an outbound claim. */
export function matchEvidence(options: {
  askPrice: number;
  listingEvidence?: unknown;
}) {
  const evidence =
    options.listingEvidence && typeof options.listingEvidence === "object"
      ? recommendationEvidence(options.listingEvidence)
      : null;
  const amount =
    evidence?.price.amount ??
    (Number.isFinite(options.askPrice) ? options.askPrice : null);
  return {
    verified: evidence?.ready === true,
    price: `${evidence?.price.label || "Unverified advertised amount"}: ${amount == null ? "not reported" : `$${amount.toLocaleString()}`}`,
    profit: evidence?.ready
      ? `Evidence-backed estimated net: $${evidence.profit!.toLocaleString()} (not guaranteed).`
      : "Profit is not established. Verify purchase price, inspection, costs and dated sold evidence.",
  };
}
export const emailText = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
