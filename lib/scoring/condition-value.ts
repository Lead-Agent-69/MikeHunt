// lib/scoring/condition-value.ts
// The moat: a clean-market comp median is NOT what a given car is worth — its title/damage status,
// mileage, and the real transaction market for its segment are. This module converts a clean-retail
// comp into the TRUE sell value for THIS specific car, encoding the dealer pricing reality:
//   • Title/damage is the dominant lever — a brand-new model that's flood/salvage/wrecked sells as a
//     FRACTION of clean retail, regardless of year. Title BRAND dominates damage description.
//   • High miles drag value down; low miles command a premium.
//   • Real sold prices (eBay completed sales) are the truth anchor for the damaged/budget segment,
//     where that market actually transacts.

import type { Deal } from "@/types";

export interface ConditionAdjustment {
  sell: number;
  titleMult: number;
  mileageMult: number;
  titleTag: string;
  soldAnchored: boolean;
}

// Severity → fraction of CLEAN retail. Ordered most-specific/most-severe first; the first match wins,
// so "prior salvage" (branded history, clean now) is checked before plain "salvage".
const SEVERITY_RULES: Array<[RegExp, number, string]> = [
  [
    /\bparts?\b|parts only|non[-\s]?running|no engine|shell only|stripped/,
    0.2,
    "parts-only",
  ],
  [/\bfire\b|burn(t|ed)?\b/, 0.3, "fire"],
  [/flood|water damage/, 0.38, "flood"],
  [
    /prior salvage|previously salvage|salvage history|branded title|title brand/,
    0.82,
    "prior-salvage",
  ],
  [
    /\bsalvage\b|salvage_title|certificate of destruction|\bcod\b/,
    0.5,
    "salvage",
  ],
  [/rebuilt|reconstruct|restored title|prior reconstruct/, 0.72, "rebuilt"],
  [/\bhail\b/, 0.85, "hail"],
  [
    /repairable|wreck(ed)?|collision|accident|rear[-\s]?end|front[-\s]?end|side damage|all over|undercarriage|mechanical/,
    0.58,
    "damaged",
  ],
];

/** Title/damage multiplier vs clean retail for this car (condition + damage_type + title + metadata). */
export function titleSeverityMultiplier(deal: Partial<Deal>): {
  mult: number;
  tag: string;
} {
  const meta = (deal as any).metadata;
  const hay =
    `${deal.condition || ""} ${(deal as any).damage_type || ""} ${(deal as any).title || ""} ${meta ? JSON.stringify(meta) : ""}`.toLowerCase();
  for (const [rx, mult, tag] of SEVERITY_RULES)
    if (rx.test(hay)) return { mult, tag };
  if (/certified|\bcpo\b/.test(hay)) return { mult: 1.05, tag: "certified" };
  return { mult: 1.0, tag: "clean" };
}

/** Mileage multiplier vs the expected mileage for the car's age (~12k mi/yr). Capped ±30%. */
export function mileageMultiplier(
  deal: Partial<Deal>,
  currentYear = new Date().getFullYear(),
  refMileage?: number | null,
): number {
  const miles = deal.mileage || 0;
  const year = deal.year || 0;
  if (year <= 0) return 1.0;
  const age = Math.max(0, currentYear - year);
  // No odometer (common on salvage/Copart — the public payload omits it). Don't value an unknown-mileage
  // car as pristine; assume age-appropriate wear so it isn't over-valued. Mild for newish, stronger for
  // old (capped at -18%). This is the single biggest fix for the salvage segment's accuracy.
  if (miles <= 0) return Math.max(0.82, 1 - age * 0.012);
  // Anchor to the ACTUAL comp pool's median mileage when we have it ("these comps are ~120k-mi cars;
  // this one has 200k"). Otherwise a capped age estimate — capped at 130k so a 20-yr car isn't assumed
  // to tolerate 240k miles for free (the old bug that made high-mile clunkers read as low-mileage).
  const expected =
    refMileage && refMileage > 0
      ? refMileage
      : Math.min(130000, Math.max(6000, age * 12000));
  const deviation = miles - expected; // positive = more miles than the reference = cheaper
  const adj = -(deviation / 10000) * 0.045; // ~4.5% per 10k mi off the reference
  // Mileage is a MAJOR value driver: high miles can crater value (to 0.4×), but a low odometer has a
  // ceiling (~1.22×) — pristine miles don't make an old car worth double. Was a too-narrow ±30%.
  return Math.max(0.4, Math.min(1.22, 1 + adj));
}

/**
 * Convert a clean-retail comp median into the TRUE sell value for this specific car.
 * Applies title/damage + mileage, then anchors to real sold prices for the damaged/budget segment.
 */
export function conditionAdjustedSell(
  cleanRetail: number,
  deal: Partial<Deal>,
  realSold?: { median: number; n: number } | null,
  currentYear = new Date().getFullYear(),
  refMileage?: number | null,
): ConditionAdjustment {
  const { mult: titleMult, tag: titleTag } = titleSeverityMultiplier(deal);
  const mileageMult = mileageMultiplier(deal, currentYear, refMileage);
  let sell = cleanRetail * titleMult * mileageMult;

  // Real-sold anchor: for damaged/budget cars (titleMult < ~1), eBay's completed-sale market IS the
  // right market — blend toward its median, weighted by how many real sales back it.
  let soldAnchored = false;
  if (realSold && realSold.n >= 3 && realSold.median > 0 && titleMult < 0.95) {
    const w = Math.min(0.6, realSold.n / 20); // up to 60% as the real-sale sample grows
    sell = sell * (1 - w) + realSold.median * w;
    soldAnchored = true;
  }

  return {
    sell: Math.round(sell),
    titleMult,
    mileageMult,
    titleTag,
    soldAnchored,
  };
}
