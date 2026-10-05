// DealCard wording by buyer desk. Reseller / dealer desks keep the flip vocabulary (resale basis,
// bidding). Personal / DIY / parts / unknown buyers get buyer copy: market value, check the price,
// and a neutral price label (an auction's "Current bid" reads as "Current price").

import { buyTerm } from "@/lib/deal-terms";

export type ValuationSource =
  | "comparables"
  | "third_party"
  | "historical_estimate"
  | "asking_price"
  | string
  | undefined;

export function dealCardCopy(flip: boolean) {
  return {
    /** Price grid / cost stack label for the seller's number. */
    priceLabel(source?: string | null): string {
      const label = buyTerm(source).priceLabel;
      return !flip && label === "Current bid" ? "Current price" : label;
    },
    /** Lowercase noun for the valuation basis ("resale basis" / "market value"). */
    basisNoun: flip ? "resale basis" : "market value",
    /** Title-case row label in Buyer math. */
    basisRowLabel: flip ? "Resale basis" : "Market value",
    /** Price-grid label for the valuation basis. */
    basisLabel(soldAnchored: boolean, hasBasis: boolean): string {
      if (soldAnchored)
        return flip ? "Comp-backed resale" : "Comp-backed value";
      if (hasBasis) return "Ask-based estimate";
      return flip ? "Resale basis" : "Market value";
    },
    basisTitle(source: ValuationSource): string {
      const noun = flip ? "Resale estimate" : "Market value";
      if (source === "comparables")
        return `${noun} backed by comparable listings`;
      if (source === "third_party")
        return `${noun} anchored to an external market benchmark`;
      if (source === "historical_estimate")
        return "Estimate derived from prior listing history, not completed-sale proof";
      if (source === "asking_price")
        return "Estimate anchored to the seller's asking price, not a completed sale";
      return flip
        ? "Modeled resale estimate; verify with comparable sales before bidding"
        : "Modeled market estimate; compare similar listings before you buy";
    },
    /** Summary line: "Comp-backed resale $X" vs "Comp-backed value $X". */
    compBackedPrefix: flip ? "Comp-backed resale" : "Comp-backed value",
    basisMissing: flip
      ? "Resale basis not on file."
      : "Market value not on file.",
    basisMissingShort: flip ? "No resale basis yet" : "No market value yet",
    /** Prefix for the next-checks line under Decision. */
    checksPrefix: flip ? "Tighten before bidding:" : "Check before you buy:",
    confidenceReview: flip
      ? "Worth reviewing, but verify weak fields before bidding."
      : "Worth reviewing, but verify weak fields before you buy.",
    confidenceThin: flip
      ? "Needs better proof before this should drive a bid."
      : "Needs better proof before you rely on this price.",
    historicalNote: flip
      ? "Built from prior active-listing estimates, not verified sale prices. Confirm sold comps before bidding."
      : "Built from prior active-listing estimates, not verified sale prices. Compare sold listings before you buy.",
    modeledNote: flip
      ? "Modeled estimates need sold or market comps before this should drive an aggressive bid."
      : "Modeled estimates need sold or market comps before you rely on them.",
  };
}
