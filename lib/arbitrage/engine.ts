// lib/arbitrage/engine.ts
// Resale-profit finder (arbitrage v2) — pure engine. No DB, no network, no clock unless `now` is
// omitted. The /api/arbitrage route (PR 2) loads listings + comps and maps `spread` onto its rows.
//
//   net = expectedResale − (ask + fees + transport + recon + repair + sellingCost)
//
// Honesty rules (covered by engine.test.ts):
//   • expectedResale comes ONLY from aggregateComps on real comps in the buyer's SELL market:
//     sold same-state → sold national → ask same-state → ask national, n >= 3 per tier. No tier
//     qualifies → status "needs_comps": expectedResale, sellingCost and net are null, confidence
//     "none". Never a guess.
//   • Title categories: Salvage vs Salvage, Rebuilt vs Rebuilt, Rebuildable vs Rebuildable/Salvage.
//     A branded car is never graded on clean comps directly. Thin same-title comps (< 3) may fall
//     back to clean comps × TITLE_DISCOUNT, compScope "title_discount_fallback", with a confidence
//     penalty. Unknown title caps confidence at "low".
//   • Stale / frozen rows are excluded before valuation (stale | is_stale | frozen | is_frozen
//     fields, or an injected isStale predicate, e.g. lib/deals/freshness isFrozenDeal once it lands).
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
  sellingCostFor,
  sourceReconBaseline,
} from "./constants";
import {
  compCategoriesFor,
  isBrandedTitle,
  titleCategory,
  type TitleCategory,
} from "./title";

// ─── Types ───────────────────────────────────────────────────────────────────────────────────────

export interface ArbitrageListing {
  id: string;
  /** Cash ask / current bid in USD. */
  ask: number | null;
  source?: string | null;
  sourceDealId?: string | null;
  /** Title/condition (deals.condition: clean_title, salvage_title, … or free text). */
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
  /** Title/condition of the comp; mapped to a TitleCategory. Missing → Unknown. */
  title?: string | null;
}

export interface ArbitrageOptions {
  /** Buyer's SELL market (their home). Comps are same-state to this, then national. */
  sellMarket?: GeoPoint | null;
  /** Extra stale/frozen predicate (e.g. isFrozenDeal from lib/deals/freshness once it lands). */
  isStale?: (row: ArbitrageListing) => boolean;
  now?: number;
  compMaxAgeDays?: number | null;
}

export type ConfidenceLabel = "high" | "medium" | "low" | "none";
export type CompScope =
  | "same_state"
  | "national"
  | "title_discount_fallback"
  | "none";

/** The row contract PR 2 maps onto /api/arbitrage (May's UI contract). */
export interface Spread {
  ask: number;
  /** Buyer fees (auction premium + flat + title fee). */
  fees: number;
  transport: number;
  /** Channel cleanup/keys/detailing baseline. */
  recon: number;
  /** Damage-type (or condition) repair estimate. */
  repair: number;
  /** Null when there is no comp-backed resale. */
  sellingCost: number | null;
  expectedResale: number | null;
  /** Null whenever comps are insufficient. */
  net: number | null;
  compsCount: number;
  compsNewestAt: string | null;
  compKind: "sold" | "ask" | "none";
  compScope: CompScope;
  confidence: ConfidenceLabel;
  titleCategory: TitleCategory;
}

export interface Confidence {
  score: number;
  label: ConfidenceLabel;
  reasons: string[];
}

interface OpportunityBase {
  id: string;
  spread: Spread;
  confidence: Confidence;
  distance: { miles: number | null; basis: DistanceBasis };
  assumptions: string[];
}

export interface ScoredOpportunity extends OpportunityBase {
  status: "scored";
  /** Same as spread.net (always a number here). */
  profit: number;
  /** profit × confidence.score / 100 — see rankOpportunities. */
  rankKey: number;
  comps: {
    medianAgeDays: number | null;
    sellState: string | null;
    /** Where the comps actually came from: same-state or national (also for the fallback). */
    geoScope: "state" | "national";
  };
}

/** No profit, no resale, no rank key — by type, not by convention. */
export interface NeedsCompsOpportunity extends OpportunityBase {
  status: "needs_comps";
  reason: string;
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

/** Median age (days) and newest observedAt of the comps aggregateComps used for `agg`. */
function tierDates(
  pool: readonly ArbitrageComp[],
  agg: CompAggregate,
  listing: ArbitrageListing,
  now: number,
  maxAgeDays: number | null,
): { medianAgeDays: number | null; newestAt: string | null } {
  const cutoff = maxAgeDays ? now - maxAgeDays * 86_400_000 : null;
  const times: number[] = [];
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
    times.push(t);
  }
  if (!times.length) return { medianAgeDays: null, newestAt: null };
  const m = median(times.map((t) => Math.max(0, (now - t) / 86_400_000)))!;
  return {
    medianAgeDays: Math.round(m),
    newestAt: new Date(Math.max(...times)).toISOString(),
  };
}

type TitleMatch = "same_title" | "title_unverified" | "discount_fallback";

interface Valuation {
  value: number;
  agg: CompAggregate;
  pool: ArbitrageComp[];
  titleMatch: TitleMatch;
}

function valueFromComps(
  listing: ArbitrageListing,
  cat: TitleCategory,
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
  const byCat = (cats: readonly TitleCategory[]) =>
    comps.filter((c) => cats.includes(titleCategory(c.title)));

  const pool = byCat(compCategoriesFor(cat));
  const agg = aggregateComps(target, pool, opts);
  if (agg.value != null) {
    return {
      value: agg.value,
      agg,
      pool,
      titleMatch: cat === "Unknown" ? "title_unverified" : "same_title",
    };
  }

  if (cat === "Salvage" || cat === "Rebuilt" || cat === "Rebuildable") {
    const cleanPool = byCat(["Clean"]);
    const cleanAgg = aggregateComps(target, cleanPool, opts);
    if (cleanAgg.value != null) {
      const factor = TITLE_DISCOUNT[cat];
      assumptions.push(
        `Fewer than ${COMP_MIN_SAMPLES} ${cat}-title comps: resale = clean-title comps × ${factor} (documented ${cat} title discount), not a same-title comp.`,
      );
      return {
        value: Math.round(cleanAgg.value * factor),
        agg: cleanAgg,
        pool: cleanPool,
        titleMatch: "discount_fallback",
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
  titleMatch: TitleMatch;
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
    C.title[input.titleMatch],
    input.titleMatch === "discount_fallback"
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
  if (
    input.titleMatch === "title_unverified" &&
    score > C.unknownTitleMaxScore
  ) {
    score = C.unknownTitleMaxScore;
    reasons.push("unknown title caps confidence at low");
  }
  const label: ConfidenceLabel =
    score >= C.labels.high
      ? "high"
      : score >= C.labels.medium
        ? "medium"
        : "low";
  return { score, label, reasons };
}

/** Buyer fees on `ask` for a source (auction premium + flat + title fee), exactly as
 *  evaluateOpportunity books them (lib/scoring/max-bid feeModel). */
export function buyerFeesFor(ask: number, source?: string | null): number {
  const fm = feeModel(source);
  return Math.round(ask * fm.feeRate + fm.flatFee + fm.titleFee);
}

/**
 * Highest ask (rounded down to `step`) at which the engine's own cost line still clears
 * `targetNet`, holding a scored spread's resale, transport, recon, repair and selling cost fixed:
 *   net(ask) = resale − ask − (ask·feeRate + flat + titleFee) − transport − recon − repair − selling
 * Null when the spread has no comp-backed resale.
 */
export function maxAskForNet(
  spread: Pick<
    Spread,
    "expectedResale" | "transport" | "recon" | "repair" | "sellingCost"
  >,
  source: string | null | undefined,
  targetNet: number,
  step = 50,
): number | null {
  if (spread.expectedResale == null) return null;
  const fm = feeModel(source);
  const fixed =
    spread.transport +
    spread.recon +
    spread.repair +
    (spread.sellingCost ?? 0) +
    fm.flatFee +
    fm.titleFee;
  return Math.max(
    0,
    Math.floor((spread.expectedResale - fixed - targetNet) / (1 + fm.feeRate) / step) * step,
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────────────────────────

/** Evaluate one listing. Excluded (stale/frozen or no usable ask) rows come back as ExcludedListing. */
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
  const cat = titleCategory(listing.title);
  const sellState = resolvePointState(opts.sellMarket);
  const assumptions: string[] = [];
  if (!sellState)
    assumptions.push(
      "No sell-market state for the buyer: comps are national only.",
    );

  // ── Costs that do not depend on resale ──
  // Buyer fees — lib/scoring/max-bid feeModel (per source).
  const fm = feeModel(listing.source);
  const fees = buyerFeesFor(ask, listing.source);
  if (fees > 0)
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

  // Repair vs recon — the split profit-calculator / deal-analyzer already use:
  //   repair = estimateRepairCost(damage_type), else the condition baseline;
  //   recon  = the channel's cleanup/keys/detailing baseline.
  const damage = String(listing.damageType || "").trim();
  const hasDamage = !!damage && damage.toLowerCase() !== "none";
  const repair = hasDamage
    ? estimateRepairCost(damage)
    : conditionReconBaseline(listing.title);
  const recon = sourceReconBaseline(listing.source);
  if (repair > 0)
    assumptions.push(
      hasDamage
        ? `Repair is an estimate from damage type "${damage}", not a repair quote.`
        : "Repair is an estimate from the stated condition, not an inspection.",
    );
  if (recon > 0)
    assumptions.push(
      `Recon is the ${listing.source} channel cleanup baseline ($${recon}).`,
    );

  const distanceOut = { miles: distance.miles, basis: distance.basis };
  const val = valueFromComps(
    listing,
    cat,
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
      spread: {
        ask,
        fees,
        transport,
        recon,
        repair,
        sellingCost: null,
        expectedResale: null,
        net: null,
        compsCount: 0,
        compsNewestAt: null,
        compKind: "none",
        compScope: "none",
        confidence: "none",
        titleCategory: cat,
      },
      confidence: {
        score: 0,
        label: "none",
        reasons: ["not enough comps"],
      },
      distance: distanceOut,
      reason: isBrandedTitle(cat)
        ? `Fewer than ${COMP_MIN_SAMPLES} ${cat}-title comps and fewer than ${COMP_MIN_SAMPLES} clean comps for the title-discount fallback.`
        : `Fewer than ${COMP_MIN_SAMPLES} comps in any tier (same-state or national, sold or ask).`,
      assumptions,
    };
  }

  const { value: expectedResale, agg } = val;
  if (agg.kind === "ask")
    assumptions.push(
      "Resale from asking-price comps × 0.95 ask→sold haircut (no sold comps in the tier).",
    );
  if (cat === "Unknown")
    assumptions.push(
      "Listing title not stated: valued on clean/unknown-title comps; verify the title.",
    );
  const sellingCost = sellingCostFor(expectedResale);
  assumptions.push(
    `Selling cost ${Math.round(SELLING_FEE_PCT * 100)}% of resale.`,
  );
  assumptions.push("Holding/floorplan cost not included.");

  const net = Math.round(
    expectedResale - (ask + fees + transport + recon + repair + sellingCost),
  );

  const seen = listing.lastSeenAt ? Date.parse(listing.lastSeenAt) : NaN;
  const lastSeenHours = Number.isFinite(seen)
    ? Math.max(0, (now - seen) / 3_600_000)
    : null;
  const { medianAgeDays, newestAt } = tierDates(
    val.pool,
    agg,
    listing,
    now,
    maxAgeDays,
  );
  const geoScope = agg.scope as "state" | "national";
  const kind = agg.kind as "sold" | "ask";
  const confidence = scoreConfidence({
    n: agg.n,
    kind,
    scope: geoScope,
    medianAgeDays,
    titleMatch: val.titleMatch,
    basis: distance.basis,
    lastSeenHours,
    hasDamage,
  });

  return {
    status: "scored",
    id: listing.id,
    profit: net,
    spread: {
      ask,
      fees,
      transport,
      recon,
      repair,
      sellingCost,
      expectedResale,
      net,
      compsCount: agg.n,
      compsNewestAt: newestAt,
      compKind: kind,
      compScope:
        val.titleMatch === "discount_fallback"
          ? "title_discount_fallback"
          : geoScope === "state"
            ? "same_state"
            : "national",
      confidence: confidence.label,
      titleCategory: cat,
    },
    comps: { medianAgeDays, sellState, geoScope },
    distance: distanceOut,
    confidence,
    rankKey: Math.round((net * confidence.score) / 100),
    assumptions,
  };
}

export function isExcluded(
  r: ArbitrageOpportunity | ExcludedListing,
): r is ExcludedListing {
  return !("status" in r);
}

/**
 * Rank opportunities. Scored rows first, by rankKey = net × confidence.score / 100
 * (confidence-weighted expected profit: $3,000 at 90 → 2,700 beats $3,200 at 55 → 1,760), then
 * higher confidence, then higher net, then id for a stable order. needs_comps rows always sort
 * after every scored row (by ask ascending, then id) and never carry a net.
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
  needs.sort((a, b) => a.spread.ask - b.spread.ask || a.id.localeCompare(b.id));
  return [...scored, ...needs];
}

/** Evaluate + exclude + rank a batch. `compsFor` returns the pre-filtered comps for a listing
 *  (same make/model/year band); the engine applies title categories, sell market and tiers. */
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
