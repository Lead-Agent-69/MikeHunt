import {
  sourcePriceContext,
  type SourcePriceRow,
} from "@/lib/deals/source-price-context";

/** Only recent, source-supported cash asks can feed retail comparisons. */
export function eligibleAskingPrices<T extends SourcePriceRow>(
  rows: T[],
  now = Date.now(),
): T[] {
  return rows.flatMap((row) => {
    const context = sourcePriceContext(row, now);
    return context.canCompareToAskingCurve
      ? [{ ...row, ask_price: context.cashPrice }]
      : [];
  });
}
