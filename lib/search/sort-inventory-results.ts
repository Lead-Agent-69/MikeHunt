type SortableListing = {
  askPrice?: number;
  year?: number;
  mileage?: number;
  profitEstimate?: number;
  profitScore?: number;
  trustExplanation?: { score?: number };
  firstSeenAt?: string | Date;
};

/** Keep client merges in the selected order without promoting missing values to zero. */
export function sortInventoryResults<T extends SortableListing>(
  rows: T[],
  sort: string,
): T[] {
  const value = (row: T): number | undefined => {
    if (sort === "price" || sort === "price-desc")
      return row.askPrice && row.askPrice > 0 ? row.askPrice : undefined;
    if (sort === "year") return row.year && row.year > 0 ? row.year : undefined;
    if (sort === "mileage")
      return row.mileage != null && row.mileage >= 0 ? row.mileage : undefined;
    if (sort === "newest")
      return row.firstSeenAt ? new Date(row.firstSeenAt).getTime() : undefined;
    if (sort === "score") return row.trustExplanation?.score ?? row.profitScore;
    if (sort === "profit") return row.profitEstimate;
    return undefined;
  };
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    const aKnown = av != null && Number.isFinite(av);
    const bKnown = bv != null && Number.isFinite(bv);
    if (!aKnown || !bKnown) return aKnown ? -1 : bKnown ? 1 : 0;
    return sort === "price" || sort === "mileage" ? av - bv : bv - av;
  });
}
