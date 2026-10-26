// A price outlier is a reason to verify a listing, not evidence of a corrected price.
export interface PriceSanity {
  status: "ok" | "typo" | "implausible";
  /** Legacy compatibility only. Never infer a replacement asking price from a benchmark. */
  inferredPrice?: number;
  reason?: string;
}

const CHEAP_OK =
  /salvage|parts|flood|fire|rebuilt|repairable|junk|non[-\s]?run|mechanic/i;

/** Compare the reported amount with an estimate without inventing a seller's cash price. */
export function checkPriceSanity(
  ask: number,
  expected: number,
  condition?: string | null,
): PriceSanity {
  if (
    !Number.isFinite(ask) ||
    !Number.isFinite(expected) ||
    ask <= 0 ||
    expected <= 0
  )
    return { status: "ok" };
  const ratio = ask / expected;
  const salvageLike = CHEAP_OK.test(condition || "");
  if (ratio >= 0.45 || (salvageLike && ratio >= 0.12)) return { status: "ok" };

  return {
    status: "implausible",
    reason: `The advertised amount is ${Math.round(ratio * 100)}% of the estimated comparison value. Confirm the full purchase price and condition with the seller; this difference alone cannot establish a typo, payment amount, damage, or profit.`,
  };
}
