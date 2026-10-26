/** Field presence is not verification, vehicle condition, or valuation confidence. */
export const COMPLETENESS_EXPLANATION =
  "Detail completeness measures information reported by the source. It does not verify the price, title, condition, or availability.";

export function detailCompletenessCopy(score: unknown) {
  return typeof score === "number" &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 100
    ? `${Math.round(score)}% of details reported`
    : "Details not assessed";
}
