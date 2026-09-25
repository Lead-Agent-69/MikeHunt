// lib/scoring/price-sanity.ts
// "Too good to be true" intelligence. A clean, late-model car at a fraction of its real value is
// almost never a deal — it's a data-entry slip (the classic MISSING LEADING DIGIT: a 2025 Silverado
// worth ~$48k listed at $8,700 because the seller dropped the "4" → $48,700), a deposit/teaser, or
// bait. Showing it as a +$40k "GO" would obliterate dealer trust in one screen. We detect it, refuse
// to book the fake profit, and tell the dealer the LIKELY REAL price so they can sanity-check it.

export interface PriceSanity {
  status: "ok" | "typo" | "implausible";
  inferredPrice?: number; // the likely-correct price when a dropped digit explains it
  reason?: string;
}

// Conditions where a very low price is legitimate (salvage/parts/branded) — don't false-flag those.
const CHEAP_OK =
  /salvage|parts|flood|fire|rebuilt|repairable|junk|non[-\s]?run|mechanic/i;

/**
 * @param ask       the listing's asking price
 * @param expected  the car's expected CLEAN market value (sell estimate / baseline)
 * @param condition the listing condition (salvage etc. are exempt from the cheap-flag)
 */
export function checkPriceSanity(
  ask: number,
  expected: number,
  condition?: string | null,
): PriceSanity {
  if (ask <= 0 || expected <= 0 || ask >= expected) return { status: "ok" };
  const ratio = ask / expected;
  const salvageLike = CHEAP_OK.test(condition || "");

  // A real (even great) deal lives down to ~45% of value; salvage can go lower. Above that → fine.
  if (ratio >= 0.45 || (salvageLike && ratio >= 0.12)) return { status: "ok" };

  // MISSING-DIGIT check: try prepending 1-9 (8,700 → 48,700) or appending a 0 (8,700 → 87,000); if
  // any lands near the expected value, the listed price is almost certainly that number mistyped.
  const mag = Math.pow(10, Math.floor(Math.log10(ask)) + 1); // 8700 → 10000
  let best: number | null = null;
  let bestDiff = Infinity;
  for (let d = 1; d <= 9; d++) {
    const cand = d * mag + ask;
    const diff = Math.abs(cand - expected) / expected;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = cand;
    }
  }
  const appended = ask * 10;
  const appDiff = Math.abs(appended - expected) / expected;
  if (appDiff < bestDiff) {
    bestDiff = appDiff;
    best = appended;
  }

  if (best && bestDiff < 0.3) {
    return {
      status: "typo",
      inferredPrice: Math.round(best),
      reason: `Listed at $${Math.round(ask).toLocaleString()} — almost certainly a typo for ~$${Math.round(
        best,
      ).toLocaleString()}. A clean car this far below value doesn't happen; verify before acting.`,
    };
  }

  // Implausibly low with no clean typo explanation, and not salvage → bait/deposit/error, not a price.
  if (ratio < 0.3 && !salvageLike) {
    return {
      status: "implausible",
      reason: `Listed at ${Math.round(ratio * 100)}% of its value — likely a deposit, teaser, or error rather than the real price.`,
    };
  }
  return { status: "ok" };
}
