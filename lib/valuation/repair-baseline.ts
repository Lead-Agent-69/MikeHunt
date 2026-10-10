// lib/valuation/repair-baseline.ts
// Repair-cost RANGE (low / mid / high) with a confidence label, as a strict superset of
// lib/scoring/profit-calculator estimateRepairCost. No behaviour change for existing callers:
// estimateRepairCost is untouched, and `baseMid` here is always exactly estimateRepairCost(damage).
//
// What is heuristic vs data-backed (see docs/valuation/repair-and-condition.md):
//   • baseMid: the existing keyword table in profit-calculator (heuristic, already in production).
//   • low/high spread: heuristic multipliers around baseMid. No free, licence-compatible public
//     dataset maps make/model/year/damage type to parts+labor dollars, so we do not pretend to have
//     one. Spreads are wider and skewed up for damage that hides problems (flood, fire, frame).
//   • vehicle factor: coarse, round-number heuristics (luxury makes cost more to repair; very old
//     cars can use used/aftermarket parts). Off with { vehicleFactors: false }.
//   • A seller-stated repair estimate on the listing is used as the mid when present ("medium").
// Calibration path: deal_outcomes logs real repair spend per closed deal; once there are enough
// rows per damage bucket, replace the spread multipliers with observed p25/p75.

import { estimateRepairCost } from "@/lib/scoring/profit-calculator";
import { conditionReconBaseline } from "@/lib/arbitrage/constants";

export type RepairBucket =
  | "none"
  | "all_over"
  | "structural"
  | "fire"
  | "flood"
  | "front"
  | "side"
  | "rear"
  | "mechanical"
  | "hail"
  | "minor"
  | "unrecognized"
  | "condition_only";

export type RepairConfidence = "medium" | "low" | "none";

export interface RepairRange {
  low: number;
  mid: number;
  high: number;
  /** Exactly estimateRepairCost(damageType) (or the condition baseline when no damage type). */
  baseMid: number;
  bucket: RepairBucket;
  /** Product of vehicle factors applied to baseMid (1 when none apply or disabled). */
  vehicleFactor: number;
  confidence: RepairConfidence;
  basis: "listing_estimate" | "damage_keyword" | "condition_baseline" | "none";
  reasons: string[];
}

export interface RepairInput {
  damageType?: string | null;
  /** deals.condition / title text; used only when there is no damage type (engine parity). */
  condition?: string | null;
  make?: string | null;
  year?: number | null;
  /** Seller/source-stated repair estimate (deals.repair_estimate / estimated_repair_cost). */
  statedRepair?: number | null;
}

export interface RepairOptions {
  vehicleFactors?: boolean;
  /** Calendar year for the age factor. Defaults to the current year. */
  currentYear?: number;
}

/** Same keyword order as estimateRepairCost, so the bucket always agrees with the dollar figure. */
export function repairBucket(damageType?: string | null): RepairBucket {
  const d = String(damageType || "")
    .toLowerCase()
    .trim();
  if (!d || d === "none") return "none";
  if (d.includes("all over") || d.includes("total")) return "all_over";
  if (d.includes("frame") || d.includes("structural") || d.includes("roll"))
    return "structural";
  if (d.includes("burn") || d.includes("fire")) return "fire";
  if (d.includes("water") || d.includes("flood")) return "flood";
  if (d.includes("front")) return "front";
  if (d.includes("side")) return "side";
  if (d.includes("rear")) return "rear";
  if (d.includes("mechanical")) return "mechanical";
  if (d.includes("hail")) return "hail";
  if (d.includes("minor") || d.includes("scratch")) return "minor";
  return "unrecognized";
}

/**
 * HEURISTIC spread around the mid, as [lowMult, highMult]. Visible body damage (front/side/rear,
 * hail, minor) is usually scoped from photos, so a narrower band. Damage that hides problems
 * (flood, fire, frame, all-over, mechanical, or text we can't classify) is skewed further up:
 * overruns are more likely than savings. Round numbers on purpose: there is no dataset behind them.
 */
export const REPAIR_SPREAD: Readonly<
  Record<Exclude<RepairBucket, "none">, readonly [number, number]>
> = {
  minor: [0.6, 1.6],
  hail: [0.6, 1.6],
  front: [0.6, 1.6],
  side: [0.6, 1.6],
  rear: [0.6, 1.6],
  mechanical: [0.5, 2.0],
  flood: [0.5, 2.0],
  fire: [0.5, 2.0],
  structural: [0.5, 2.0],
  all_over: [0.5, 2.0],
  unrecognized: [0.5, 2.0],
  condition_only: [0.5, 2.0],
};

/** Seller-stated estimates are not our quote either; keep a band around them. HEURISTIC. */
export const STATED_REPAIR_SPREAD = [0.8, 1.5] as const;

/**
 * HEURISTIC vehicle factors. Luxury/premium makes: higher parts list prices and specialised labor
 * (aluminium bodies, ADAS recalibration). Old cars (>= OLD_CAR_AGE years): used/aftermarket parts
 * are widely available. Model is not used: we have no basis for per-model numbers.
 */
export const LUXURY_MAKES: ReadonlySet<string> = new Set([
  "acura",
  "alfa romeo",
  "audi",
  "bmw",
  "cadillac",
  "genesis",
  "infiniti",
  "jaguar",
  "land rover",
  "lexus",
  "lincoln",
  "maserati",
  "mercedes-benz",
  "mercedes",
  "porsche",
  "tesla",
  "volvo",
]);
export const LUXURY_REPAIR_FACTOR = 1.3;
export const OLD_CAR_AGE = 15;
export const OLD_CAR_REPAIR_FACTOR = 0.85;

const round50 = (n: number) => Math.max(0, Math.round(n / 50) * 50);

export function vehicleRepairFactor(
  make?: string | null,
  year?: number | null,
  currentYear = new Date().getFullYear(),
): { factor: number; reasons: string[] } {
  let factor = 1;
  const reasons: string[] = [];
  const m = String(make || "")
    .trim()
    .toLowerCase();
  if (m && LUXURY_MAKES.has(m)) {
    factor *= LUXURY_REPAIR_FACTOR;
    reasons.push(
      `premium make (${make}): ×${LUXURY_REPAIR_FACTOR} parts/labor heuristic`,
    );
  }
  const y = Number(year);
  if (Number.isFinite(y) && y > 1900 && currentYear - y >= OLD_CAR_AGE) {
    factor *= OLD_CAR_REPAIR_FACTOR;
    reasons.push(
      `${currentYear - y}-year-old car: ×${OLD_CAR_REPAIR_FACTOR} used/aftermarket parts heuristic`,
    );
  }
  return { factor, reasons };
}

/** Repair range for one listing. See file header for what is measured and what is a heuristic. */
export function estimateRepairRange(
  input: RepairInput,
  opts: RepairOptions = {},
): RepairRange {
  const damage = String(input.damageType || "").trim();
  const bucket0 = repairBucket(damage);
  const stated = Number(input.statedRepair);
  const vf =
    opts.vehicleFactors === false
      ? { factor: 1, reasons: [] as string[] }
      : vehicleRepairFactor(input.make, input.year, opts.currentYear);

  if (Number.isFinite(stated) && stated > 0) {
    const [lo, hi] = STATED_REPAIR_SPREAD;
    return {
      low: round50(stated * lo),
      mid: Math.round(stated),
      high: round50(stated * hi),
      baseMid: Math.round(stated),
      bucket: bucket0,
      vehicleFactor: 1,
      confidence: "medium",
      basis: "listing_estimate",
      reasons: [
        "seller/source-stated repair estimate, not an inspection",
        `band ×${lo}–×${hi} heuristic`,
      ],
    };
  }

  if (bucket0 === "none") {
    const base = conditionReconBaseline(input.condition);
    if (base <= 0) {
      return {
        low: 0,
        mid: 0,
        high: 0,
        baseMid: 0,
        bucket: "none",
        vehicleFactor: 1,
        confidence: "none",
        basis: "none",
        reasons: ["no damage or condition reported (not proof of no damage)"],
      };
    }
    const [lo, hi] = REPAIR_SPREAD.condition_only;
    const mid = Math.round(base * vf.factor);
    return {
      low: round50(mid * lo),
      mid,
      high: round50(mid * hi),
      baseMid: base,
      bucket: "condition_only",
      vehicleFactor: vf.factor,
      confidence: "low",
      basis: "condition_baseline",
      reasons: [
        "estimate from the stated condition (arbitrage conditionReconBaseline), not an inspection",
        ...vf.reasons,
      ],
    };
  }

  const baseMid = estimateRepairCost(damage);
  const [lo, hi] = REPAIR_SPREAD[bucket0];
  const mid = Math.round(baseMid * vf.factor);
  return {
    low: round50(mid * lo),
    mid,
    high: round50(mid * hi),
    baseMid,
    bucket: bucket0,
    vehicleFactor: vf.factor,
    confidence: "low",
    basis: "damage_keyword",
    reasons: [
      bucket0 === "unrecognized"
        ? `damage "${damage}" not recognised: generic default`
        : `damage-type keyword "${bucket0}" (profit-calculator table)`,
      `band ×${lo}–×${hi} heuristic`,
      ...vf.reasons,
    ],
  };
}
