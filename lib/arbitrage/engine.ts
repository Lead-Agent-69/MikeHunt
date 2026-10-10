// lib/arbitrage/engine.ts
// Resale-profit finder (arbitrage v2) — pure engine. No DB, no network, no clock unless `now` is
// omitted. The /api/arbitrage route (PR 2) loads listings + comps and hands them here.
//
//   spread = expectedResale − (ask + buyerFees + transport + recon + sellingFees)
//
// Honesty rules (covered by engine.test.ts):
//   • expectedResale comes ONLY from aggregateComps on real comps in the buyer's SELL market:
//     sold same-state → sold national → ask same-state → ask national, n >= 3 per tier. No tier
//     qualifies → status "needs_comps" with NO profit, resale or cost total. Never a guess.
//   • Title lanes: salvage (incl. rebuildable) vs salvage, rebuilt vs rebuilt, parts vs parts.
//     A branded car is never graded on clean comps directly. Thin same-title comps (< 3) may fall
//     back to clean comps × TITLE_DISCOUNT, flagged titleAdjusted "discount_fallback" with a
//     confidence penalty. Parts-only has no fallback.
//   • Stale / frozen rows are excluded before valuation (stale | is_stale | frozen | is_frozen
//     fields, or an injected isStale predicate).
//   • Every estimate that is not measured is written into `assumptions`.

import {
  aggregateComps,
  compConfidence,
  isSelfComp,
  COMP_MIN_SAMPLES,
  type CompAggregate,
  type CompObservation,
} from "@/lib/scoring/comps-aggregate";
import {
  buyerDistance,
  resolvePointState,
  transportCostForDistance,
  type DistanceBasis,
  type GeoPoint,
} from "@/lib/geo/buyer-distance";
import { feeModel } from "@/lib/scoring/max-bid";
import { estimateRepairCost } from "@/lib/scoring/profit-calculator";
import {
  COMP_MAX_AGE_DAYS,
  CONFIDENCE,
  SELLING_FEE_PCT,
  TITLE_DISCOUNT,
  UNKNOWN_DISTANCE_TRANSPORT_COST,
  conditionReconBaseline,
  sourceReconBaseline,
} from "./constants";
import { compLanesFor, titleLane, type TitleLane } from "./title";

// ─── Types ───────────────────────────────────────────────────────────────────────────────────────

export interface ArbitrageListing {
  id: string;
  /** Cash ask / current bid in USD. */
  ask: number | null;
  source?: string | null;
  sourceDealId?: string | null;
  /** Free-text title/condition (deals.condition / title_type). */
  title?: string | null;
  damageType?: string | null;
  location?: GeoPoint | null;
  /** ISO time the listing was last seen live (deals.last_seen_at). */
  lastSeenAt?: string | null;
  /** Stale/frozen flags, if the row carries them. */
  stale?: boolean | null;
  is_stale?: boolean | null;
  frozen?: boolean | null;
  is_frozen?: boolean | null;
}

export interface ArbitrageComp extends CompObservation {
  /** Free-text title/condition of the comp; mapped to a TitleLane. Missing → "unknown". */
  title?: string | null;
}

export interface ArbitrageOptions {
  /** Buyer's SELL market (their home). Comps are same-state to this, then national. */
  sellMarket?: GeoPoint | null;
  /** Extra stale/frozen predicate (e.g. the stale flag another worker is adding). */
  isStale?: (row: ArbitrageListing) => boolean;
  now?: number;
  compMaxAgeDays?: number | null;
}

export type TitleAdjusted =
  | "same_title"
  | "title_unverified"
  | "discount_fallback";

export interface Confidence {
  score: number;
  label: "high" | "medium" | "low";
  reasons: string[];
}

export interface ScoredOpportunity {
  status: "scored";
  id: string;
  profit: number;
  expectedResale: number;
  costs: {
    ask: number;
    buyerFees: number;
    transport: number;
    recon: number;
    sellingFees: number;
    total: number;
  };
  comps: {
    n: number;
    scope: "state" | "national";
    kind: "sold" | "ask";
    titleLane: TitleLane;
    titleAdjusted: TitleAdjusted;
    medianAgeDays: number | null;
    sellState: string | null;
  };
  distance: { miles: number | null; basis: DistanceBasis };
  confidence: Confidence;
  /** profit × confidence.score / 100 — see rankOpportunities. */
  rankKey: number;
  assumptions: string[];
}

/** No profit, no resale, no cost total — by type, not by convention. */
export interface NeedsCompsOpportunity {
  status: "needs_comps";
  id: string;
  ask: number;
  titleLane: TitleLane;
  reason: string;
  assumptions: string[];
}

export type ArbitrageOpportunity = ScoredOpportunity | NeedsCompsOpportunity;

export interface ExcludedListing {
  id: string;
  reason: "stale" | "no_price";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────────────

export function isStaleListing(
  row: ArbitrageListing,
  isStale?: (row: ArbitrageListing) => boolean,
): boolean {
  if (row.stale || row.is_stale || row.frozen || row.is_frozen) return true;
  return !!isStale?.(row);
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median age (days) of the comps aggregateComps actually used for `agg`. */
function tierMedianAgeDays(
  pool: readonly ArbitrageComp[],
  agg: CompAggregate,
  listing: ArbitrageListing,
  now: number,
  maxAgeDays: number | null,
): number | null {
  const cutoff = maxAgeDays ? now - maxAgeDays * 86_400_000 : null;
  const ages: number[] = [];
  for (const c of pool) {
    if (!(Number(c.price) > 0) || c.kind !== agg.kind) continue;
    if (
      isSelfComp(c, {
        id: listing.id,
        source: listing.source,
        sourceDealId: listing.sourceDealId,
      })
    )
      continue;
    if (
      agg.scope === "state" &&
      String(c.state || "")
        .trim()
        .toUpperCase() !== agg.state
    )
      continue;
    const t = c.observedAt ? Date.parse(c.observedAt) : NaN;
    if (!Number.isFinite(t)) continue;
    if (cutoff != null && t < cutoff) continue;
    ages.push(Math.max(0, (now - t) / 86_400_000));
  }
  const m = median(ages);
  return m == null ? null : Math.round(m);
}

interface Valuation {
  value: number;
  agg: CompAggregate;
  pool: ArbitrageComp[];
  titleAdjusted: TitleAdjusted;
}

function valueFromComps(
  listing: ArbitrageListing,
  lane: TitleLane,
  comps: readonly ArbitrageComp[],
  sellState: string | null,
  now: number,
  maxAgeDays: number | null,
  assumptions: string[],
): Valuation | null {
  const target = {
    id: listing.id,
    source: listing.source,
    sourceDealId: listing.sourceDealId,
    // Same-state means the buyer's SELL market, not where the car is listed.
    state: sellState,
  };
  const opts = { now, maxAgeDays, minSamples: COMP_MIN_SAMPLES };
  const byLane = (lanes: readonly TitleLane[]) =>
    comps.filter((c) => lanes.includes(titleLane(c.title)));

  const pool = byLane(compLanesFor(lane));
  const agg = aggregateComps(target, pool, opts);
  if (
    agg.value != null &&
    (agg.scope === "state" || agg.scope === "national")
  ) {
    return {
      value: agg.value,
      agg,
      pool,
      titleAdjusted: lane === "unknown" ? "title_unverified" : "same_title",
    };
  }

  if (lane === "salvage" || lane === "rebuilt") {
    const cleanPool = byLane(["clean"]);
    const cleanAgg = aggregateComps(target, cleanPool, opts);
    if (cleanAgg.value != null) {
      const factor = TITLE_DISCOUNT[lane];
      assumptions.push(
        `Fewer than ${COMP_MIN_SAMPLES} ${lane}-title comps: resale = clean-title comps × ${factor} (documented ${lane} title discount), not a same-title comp.`,
      );
      return {
        value: Math.round(cleanAgg.value * factor),
        agg: cleanAgg,
        pool: cleanPool,
        titleAdjusted: "discount_fallback",
      };
    }
  }
  return null;
}

function scoreConfidence(input: {
  n: number;
  kind: "sold" | "ask";
  scope: "state" | "national";
  medianAgeDays: number | null;
  titleAdjusted: TitleAdjusted;
  basis: DistanceBasis;
  lastSeenHours: number | null;
  hasDamage: boolean;
}): Confidence {
  const C = CONFIDENCE;
  let score = 100;
  const reasons: string[] = [];
  const hit = (pts: number, why: string) => {
    if (pts > 0) {
      score -= pts;
      reasons.push(`${why} (−${pts})`);
    }
  };

  const cc = compConfidence(input.n);
  hit(
    cc === "high"
      ? C.count.high
      : cc === "medium"
        ? C.count.medium
        : C.count.low,
    `${input.n} comps`,
  );
  hit(
    C.tier[`${input.kind}:${input.scope}` as keyof typeof C.tier],
    `${input.kind === "sold" ? "sold" : "asking-price"} comps, ${input.scope === "state" ? "same state as your sell market" : "national"}`,
  );
  if (input.medianAgeDays == null) hit(C.recency.unknown, "comp dates unknown");
  else if (input.medianAgeDays > C.recency.agingDays)
    hit(C.recency.old, `comps median ${input.medianAgeDays} days old`);
  else if (input.medianAgeDays > C.recency.freshDays)
    hit(C.recency.aging, `comps median ${input.medianAgeDays} days old`);
  hit(
    C.title[input.titleAdjusted],
    input.titleAdjusted === "discount_fallback"
      ? "branded title valued from clean comps × title discount"
      : "title not stated on the listing",
  );
  hit(
    C.distance[input.basis],
    input.basis === "unknown"
      ? "distance unknown; transport is a national default"
      : input.basis === "same_state"
        ? "same state, no coordinates; transport is the carrier minimum"
        : "distance from state centroids, not exact coordinates",
  );
  const h = input.lastSeenHours;
  if (h == null) hit(C.freshness.unknown, "listing last-seen time unknown");
  else if (h > C.freshness.weekHours)
    hit(C.freshness.old, `listing last seen ${Math.round(h / 24)} days ago`);
  else if (h > C.freshness.recentHours)
    hit(C.freshness.week, `listing last seen ${Math.round(h / 24)} days ago`);
  else if (h > C.freshness.freshHours)
    hit(C.freshness.recent, `listing last seen ${Math.round(h)}h ago`);
  if (input.hasDamage)
    hit(C.damageEstimate, "repair cost is a damage-type estimate");

  score = Math.max(0, Math.min(100, score));
  const label =
    score >= C.labels.high
      ? "high"
      : score >= C.labels.medium
        ? "medium"
        : "low";
  return { score, label, reasons };
}

// ─── Public API ──────────────────────────────────────────────────────────────────────────────────

/** Evaluate one listing. Returns null when it must be excluded (stale/frozen or no usable ask). */
export function evaluateOpportunity(
  listing: ArbitrageListing,
  comps: readonly ArbitrageComp[],
  opts: ArbitrageOptions = {},
): ArbitrageOpportunity | ExcludedListing {
  if (isStaleListing(listing, opts.isStale))
    return { id: listing.id, reason: "stale" };
  const ask = Number(listing.ask);
  if (!Number.isFinite(ask) || ask <= 0)
    return { id: listing.id, reason: "no_price" };

  const now = opts.now ?? Date.now();
  const maxAgeDays =
    opts.compMaxAgeDays === undefined ? COMP_MAX_AGE_DAYS : opts.compMaxAgeDays;
  const lane = titleLane(listing.title);
  const sellState = resolvePointState(opts.sellMarket);
  const assumptions: string[] = [];
  if (!sellState)
    assumptions.push(
      "No sell-market state for the buyer: comps are national only.",
    );

  const val = valueFromComps(
    listing,
    lane,
    comps,
    sellState,
    now,
    maxAgeDays,
    assumptions,
  );
  if (!val) {
    return {
      status: "needs_comps",
      id: listing.id,
      ask,
      titleLane: lane,
      reason:
        lane === "parts"
          ? `Fewer than ${COMP_MIN_SAMPLES} parts-only comps (no clean-comp fallback for parts-only titles).`
          : lane === "salvage" || lane === "rebuilt"
            ? `Fewer than ${COMP_MIN_SAMPLES} ${lane}-title comps and fewer than ${COMP_MIN_SAMPLES} clean comps for the title-discount fallback.`
            : `Fewer than ${COMP_MIN_SAMPLES} comps in any tier (same-state or national, sold or ask).`,
      assumptions,
    };
  }
  const { value: expectedResale, agg } = val;
  if (agg.kind === "ask")
    assumptions.push(
      "Resale from asking-price comps × 0.95 ask→sold haircut (no sold comps in the tier).",
    );
  if (lane === "unknown")
    assumptions.push(
      "Listing title not stated: valued on clean/unknown-title comps; verify the title.",
    );

  // Buyer fees — lib/scoring/max-bid feeModel (per source).
  const fm = feeModel(listing.source);
  const buyerFees = Math.round(ask * fm.feeRate + fm.flatFee + fm.titleFee);
  if (buyerFees > 0)
    assumptions.push(
      `Buyer fees from the ${listing.source} fee model: ${Math.round(fm.feeRate * 100)}% + $${fm.flatFee} + $${fm.titleFee} title.`,
    );

  // Transport — haversine via lib/geo/buyer-distance, priced with lib/geo transportCostForMiles.
  const distance = buyerDistance(opts.sellMarket, listing.location);
  const transport =
    transportCostForDistance(distance, UNKNOWN_DISTANCE_TRANSPORT_COST) ??
    UNKNOWN_DISTANCE_TRANSPORT_COST;
  if (distance.basis === "unknown")
    assumptions.push(
      `Distance unknown: transport is the $${UNKNOWN_DISTANCE_TRANSPORT_COST} national default.`,
    );
  else if (distance.basis === "same_state")
    assumptions.push(
      "Same state without coordinates: transport is the carrier minimum.",
    );
  else if (distance.basis === "state_centroid")
    assumptions.push(
      "Distance measured between state centroids (no exact coordinates).",
    );

  // Recon — profit-calculator estimateRepairCost by damage type, else condition baseline, plus
  // the channel's cleanup baseline.
  const damage = String(listing.damageType || "").trim();
  const hasDamage = !!damage && damage.toLowerCase() !== "none";
  const repair = hasDamage
    ? estimateRepairCost(damage)
    : conditionReconBaseline(listing.title);
  const recon = repair + sourceReconBaseline(listing.source);
  if (recon > 0)
    assumptions.push(
      hasDamage
        ? `Recon is an estimate from damage type "${damage}", not a repair quote.`
        : "Recon is an estimate from the stated condition, not an inspection.",
    );

  const sellingFees = Math.round(expectedResale * SELLING_FEE_PCT);
  assumptions.push(
    `Selling costs ${Math.round(SELLING_FEE_PCT * 100)}% of resale.`,
  );
  assumptions.push("Holding/floorplan cost not included.");

  const total = ask + buyerFees + transport + recon + sellingFees;
  const profit = Math.round(expectedResale - total);

  const seen = listing.lastSeenAt ? Date.parse(listing.lastSeenAt) : NaN;
  const lastSeenHours = Number.isFinite(seen)
    ? Math.max(0, (now - seen) / 3_600_000)
    : null;
  const medianAgeDays = tierMedianAgeDays(
    val.pool,
    agg,
    listing,
    now,
    maxAgeDays,
  );
  const scope = agg.scope as "state" | "national";
  const kind = agg.kind as "sold" | "ask";
  const confidence = scoreConfidence({
    n: agg.n,
    kind,
    scope,
    medianAgeDays,
    titleAdjusted: val.titleAdjusted,
    basis: distance.basis,
    lastSeenHours,
    hasDamage,
  });

  return {
    status: "scored",
    id: listing.id,
    profit,
    expectedResale,
    costs: { ask, buyerFees, transport, recon, sellingFees, total },
    comps: {
      n: agg.n,
      scope,
      kind,
      titleLane: lane,
      titleAdjusted: val.titleAdjusted,
      medianAgeDays,
      sellState,
    },
    distance: { miles: distance.miles, basis: distance.basis },
    confidence,
    rankKey: Math.round((profit * confidence.score) / 100),
    assumptions,
  };
}

export function isExcluded(
  r: ArbitrageOpportunity | ExcludedListing,
): r is ExcludedListing {
  return !("status" in r);
}

/**
 * Rank opportunities. Scored rows first, by rankKey = profit × confidence.score / 100
 * (confidence-weighted expected profit: $3,000 at 90 → 2,700 beats $3,200 at 55 → 1,760), then
 * higher confidence, then higher profit, then id for a stable order. needs_comps rows always sort
 * after every scored row (by ask ascending, then id) and never carry a profit.
 */
export function rankOpportunities(
  rows: readonly ArbitrageOpportunity[],
): ArbitrageOpportunity[] {
  const scored = rows.filter(
    (r): r is ScoredOpportunity => r.status === "scored",
  );
  const needs = rows.filter(
    (r): r is NeedsCompsOpportunity => r.status === "needs_comps",
  );
  scored.sort(
    (a, b) =>
      b.rankKey - a.rankKey ||
      b.confidence.score - a.confidence.score ||
      b.profit - a.profit ||
      a.id.localeCompare(b.id),
  );
  needs.sort((a, b) => a.ask - b.ask || a.id.localeCompare(b.id));
  return [...scored, ...needs];
}

/** Evaluate + exclude + rank a batch. `compsFor` returns the pre-filtered comps for a listing
 *  (same make/model/year band); the engine applies title lanes, sell market and tiers. */
export function findOpportunities(
  listings: readonly ArbitrageListing[],
  compsFor: (listing: ArbitrageListing) => readonly ArbitrageComp[],
  opts: ArbitrageOptions = {},
): { ranked: ArbitrageOpportunity[]; excluded: ExcludedListing[] } {
  const out: ArbitrageOpportunity[] = [];
  const excluded: ExcludedListing[] = [];
  for (const l of listings) {
    // Exclude stale/frozen before touching comps.
    if (isStaleListing(l, opts.isStale)) {
      excluded.push({ id: l.id, reason: "stale" });
      continue;
    }
    const r = evaluateOpportunity(l, compsFor(l), opts);
    if (isExcluded(r)) excluded.push(r);
    else out.push(r);
  }
  return { ranked: rankOpportunities(out), excluded };
}
