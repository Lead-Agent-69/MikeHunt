// lib/arbitrage/constants.ts
// Every number the resale-profit engine uses that is NOT computed from data lives here, with where
// it came from. "Mirrors" = copied from an existing repo constant that is private to its module (a
// parity test in engine.test.ts pins it). "New" = introduced by this engine; each is an estimate
// and the engine lists it in `assumptions` whenever it is applied.

/** Mirrors lib/scoring/deal-analyzer.ts SELL_COST_PCT default (0.09): selling + recon-to-retail load as a share of resale. */
export const SELLING_FEE_PCT = 0.09;

/** Mirrors lib/scoring/deal-analyzer.ts DEFAULT_TRANSPORT_COST default ($600): conservative national
 *  carrier cost, booked only when the distance cannot be measured (and confidence is lowered). */
export const UNKNOWN_DISTANCE_TRANSPORT_COST = 600;

/** Mirrors lib/scoring/market-value.ts SOLD_MEDIAN_WINDOW_DAYS (180): comps older than this are
 *  dropped (aggregateComps maxAgeDays), not down-weighted. */
export const COMP_MAX_AGE_DAYS = 180;

/** Mirrors lib/scoring/deal-analyzer.ts feeModel().reconCost: baseline cleanup/keys/detailing for the
 *  channel, booked on top of damage/condition repair. */
export function sourceReconBaseline(source?: string | null): number {
  const s = String(source || "").toLowerCase();
  if (s.includes("copart") || s.includes("iaa")) return 500;
  if (s.includes("manheim") || s.includes("adesa") || s.includes("acv"))
    return 300;
  return 0;
}

/** Mirrors lib/scoring/deal-analyzer.ts conditionRepairBaseline(): repair baseline from a free-text
 *  condition when the listing has no damage_type. Used only when damage_type is absent. */
export function conditionReconBaseline(condition?: string | null): number {
  const c = String(condition || "").toLowerCase();
  if (!c) return 0;
  if (
    c.includes("salvage") ||
    c.includes("rebuilt") ||
    c.includes("repairable") ||
    c.includes("parts")
  )
    return 2500;
  if (c.includes("run_drive") || c.includes("run/drive")) return 1500;
  if (
    c.includes("used") ||
    c.includes("clean") ||
    c.includes("fair") ||
    c.includes("good")
  )
    return 400;
  return 0;
}

/**
 * NEW. Branded-title resale as a fraction of the clean-title comp value. Used ONLY when same-title
 * comps are thin (< COMP_MIN_SAMPLES) and the result is flagged titleAdjusted: "discount_fallback"
 * with a confidence penalty. Rationale: consumer pricing guides (KBB / Edmunds / Carfax) commonly
 * put rebuilt/branded titles 20–40% below an equivalent clean title. We take the conservative end:
 *   rebuilt  0.70 → 30% below clean (repaired, inspected, re-titled).
 *   salvage  0.55 → 45% below clean (incl. rebuildable): harder to finance/insure and the buyer pool
 *                  is mostly dealers/rebuilders. Repair is booked separately in recon.
 * Parts-only and clean lanes never use a discount fallback.
 */
export const TITLE_DISCOUNT: Readonly<Record<"rebuilt" | "salvage", number>> = {
  rebuilt: 0.7,
  salvage: 0.55,
};

/**
 * NEW. Confidence model (0–100, start at 100, subtract penalties). Labels: >= 75 high, >= 50
 * medium, else low. needs_comps rows get no score (they are never ranked on profit).
 */
export const CONFIDENCE = {
  /** By comp count (same 12 / 6 / 3 ladder as compConfidence in comps-aggregate). */
  count: { high: 0, medium: 10, low: 20 },
  /** By evidence tier, best → worst. */
  tier: {
    "sold:state": 0,
    "sold:national": 10,
    "ask:state": 15,
    "ask:national": 25,
  },
  /** By median comp age (observedAt) in days. */
  recency: { freshDays: 30, agingDays: 90, aging: 10, old: 20, unknown: 10 },
  /** Title handling. */
  title: { same_title: 0, title_unverified: 10, discount_fallback: 25 },
  /** Distance basis from lib/geo/buyer-distance. */
  distance: { coords: 0, state_centroid: 5, same_state: 5, unknown: 20 },
  /** Listing/source freshness (hours since the listing was last seen live). */
  freshness: {
    freshHours: 24,
    recentHours: 72,
    weekHours: 168,
    recent: 5,
    week: 15,
    old: 25,
    unknown: 10,
  },
  /** Reported damage: repair is a keyword estimate, not a quote. */
  damageEstimate: 5,
  labels: { high: 75, medium: 50 },
} as const;
