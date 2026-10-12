// lib/valuation/liquidity.ts
// Hold time / liquidity: a days-to-sell estimate per make/model (state first, then national) from
// our own observations, with sample size and confidence, plus an OPT-IN holding-cost hook.
//
// Evidence, best first:
//   1. "sold"         — sold rows that carry both a listed date and a sold date (sold − listed).
//   2. "delist_proxy" — our listings that disappeared (active = false, or not re-seen for
//                       goneAfterHours, default lib/deals/freshness STALE_AFTER_HOURS = 72):
//                       last_seen_at − first_seen_at. A delisting is NOT proof of a sale (auctions
//                       end, dealers relist), so this basis is capped at "medium" confidence.
//   Live rows are right-censored (still listed): they are reported (liveMedianAgeDays) and, when
//   they are older than the delisted median, the estimate is flagged optimistic and confidence
//   drops one step. Sold rows without a listed date only feed soldLast30d (sales velocity).
// No estimate with fewer than minSamples (3) completed durations: daysToSell = null.

import { STALE_AFTER_HOURS } from "@/lib/deals/freshness";
import {
  COMP_MIN_SAMPLES,
  compConfidence,
  type CompConfidence,
} from "@/lib/scoring/comps-aggregate";

export interface LiquidityRow {
  make?: string | null;
  model?: string | null;
  state?: string | null;
  /** "listing" = one of our deals rows; "sold" = a completed sale. Default listing. */
  kind?: "listing" | "sold";
  firstSeenAt?: string | null;
  createdAt?: string | null;
  lastSeenAt?: string | null;
  active?: boolean | null;
  listedAt?: string | null;
  soldAt?: string | null;
}

export interface LiquidityKey {
  make?: string | null;
  model?: string | null;
  state?: string | null;
}

export interface LiquidityOptions {
  now?: number;
  minSamples?: number;
  goneAfterHours?: number;
  /** Only rows seen (or sold) within this many days count. Default 180. */
  windowDays?: number;
}

export interface LiquidityEstimate {
  daysToSell: number | null;
  p25: number | null;
  p75: number | null;
  n: number;
  basis: "sold" | "delist_proxy" | "none";
  scope: "state" | "national" | "none";
  /** gone / (gone + live) in the window, for the chosen scope. Null when nothing observed. */
  delistRate: number | null;
  liveCount: number;
  liveMedianAgeDays: number | null;
  soldLast30d: number;
  confidence: CompConfidence;
  notes: string[];
}

const DAY = 86_400_000;
const norm = (v?: string | null) =>
  String(v || "")
    .trim()
    .toLowerCase();
const ms = (v?: string | null) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const STEP_DOWN: Record<CompConfidence, CompConfidence> = {
  high: "medium",
  medium: "low",
  low: "low",
  none: "none",
};

function summarise(
  rows: readonly LiquidityRow[],
  scope: "state" | "national",
  now: number,
  minSamples: number,
  goneAfterMs: number,
  windowStart: number,
): LiquidityEstimate | { insufficient: true; partial: LiquidityEstimate } {
  const soldDur: number[] = [];
  const delistDur: number[] = [];
  const liveAges: number[] = [];
  let gone = 0;
  let soldLast30d = 0;
  for (const r of rows) {
    if (r.kind === "sold") {
      const s = ms(r.soldAt);
      if (s == null || s < windowStart) continue;
      if (now - s <= 30 * DAY) soldLast30d++;
      const l = ms(r.listedAt);
      if (l != null && s >= l) soldDur.push((s - l) / DAY);
      continue;
    }
    const first = ms(r.firstSeenAt) ?? ms(r.createdAt);
    const last = ms(r.lastSeenAt);
    if (first == null || last == null || last < first || last < windowStart)
      continue;
    const isGone = r.active === false || now - last > goneAfterMs;
    if (isGone) {
      gone++;
      delistDur.push((last - first) / DAY);
    } else liveAges.push((now - first) / DAY);
  }
  const live = liveAges.length;
  const liveMed = live
    ? Math.round(
        quantile(
          [...liveAges].sort((a, b) => a - b),
          0.5,
        ),
      )
    : null;
  const delistRate =
    gone + live > 0 ? Math.round((gone / (gone + live)) * 100) / 100 : null;
  const useSold = soldDur.length >= minSamples;
  const durs = useSold ? soldDur : delistDur;
  const base: LiquidityEstimate = {
    daysToSell: null,
    p25: null,
    p75: null,
    n: durs.length,
    basis: "none",
    scope: "none",
    delistRate,
    liveCount: live,
    liveMedianAgeDays: liveMed,
    soldLast30d,
    confidence: "none",
    notes: [],
  };
  if (durs.length < minSamples) return { insufficient: true, partial: base };
  const s = [...durs].sort((a, b) => a - b);
  const med = quantile(s, 0.5);
  let confidence = compConfidence(durs.length, minSamples);
  const notes: string[] = [];
  if (!useSold) {
    if (confidence === "high") confidence = "medium";
    notes.push(
      "Based on how long our listings stayed up before disappearing; a delisting is not proof of a sale.",
    );
  }
  if (liveMed != null && live >= minSamples && liveMed > med) {
    confidence = STEP_DOWN[confidence];
    notes.push(
      `Live listings have been up a median ${liveMed} days, longer than the ${Math.round(med)}-day estimate: likely optimistic.`,
    );
  }
  return {
    ...base,
    daysToSell: Math.round(med),
    p25: Math.round(quantile(s, 0.25)),
    p75: Math.round(quantile(s, 0.75)),
    n: durs.length,
    basis: useSold ? "sold" : "delist_proxy",
    scope,
    confidence,
    notes,
  };
}

/** Days-to-sell for one make/model: same state first, national otherwise, or null with reasons. */
export function estimateDaysToSell(
  rows: readonly LiquidityRow[],
  key: LiquidityKey,
  opts: LiquidityOptions = {},
): LiquidityEstimate {
  const now = opts.now ?? Date.now();
  const minSamples = Math.max(1, opts.minSamples ?? COMP_MIN_SAMPLES);
  const goneAfterMs = (opts.goneAfterHours ?? STALE_AFTER_HOURS) * 3_600_000;
  const windowStart = now - (opts.windowDays ?? 180) * DAY;
  const mk = norm(key.make);
  const md = norm(key.model);
  const state = String(key.state || "")
    .trim()
    .toUpperCase();
  const same = rows.filter(
    (r) => (!mk || norm(r.make) === mk) && (!md || norm(r.model) === md),
  );
  const tiers: Array<["state" | "national", LiquidityRow[]]> = [];
  if (/^[A-Z]{2}$/.test(state))
    tiers.push([
      "state",
      same.filter(
        (r) =>
          String(r.state || "")
            .trim()
            .toUpperCase() === state,
      ),
    ]);
  tiers.push(["national", same]);
  let last: LiquidityEstimate | null = null;
  for (const [scope, tierRows] of tiers) {
    const r = summarise(
      tierRows,
      scope,
      now,
      minSamples,
      goneAfterMs,
      windowStart,
    );
    if (!("insufficient" in r)) return r;
    last = r.partial;
  }
  return {
    ...(last as LiquidityEstimate),
    notes: [
      `Fewer than ${minSamples} completed listings or sales for this make/model: no days-to-sell estimate.`,
    ],
  };
}

/** Mirrors lib/scoring/profit-calculator dailyFloorRate default ($35/day). A heuristic floorplan rate. */
export const DEFAULT_DAILY_HOLDING_RATE = 35;

export interface HoldingCostOptions {
  /** Default false: holding cost is reported in assumptions but NOT subtracted from net. */
  enabled?: boolean;
  dailyRate?: number;
}

/**
 * Holding-cost hook for the engine's `assumptions`. Off by default, so net never changes unless a
 * caller opts in. Returns the cost it would book and the sentence to show either way.
 */
export function holdingCost(
  liq: Pick<LiquidityEstimate, "daysToSell" | "basis" | "n">,
  opts: HoldingCostOptions = {},
): { cost: number | null; included: boolean; assumption: string } {
  const rate = opts.dailyRate ?? DEFAULT_DAILY_HOLDING_RATE;
  if (liq.daysToSell == null)
    return {
      cost: null,
      included: false,
      assumption:
        "Holding/floorplan cost not included (no days-to-sell estimate).",
    };
  const cost = Math.round(liq.daysToSell * rate);
  const basis =
    liq.basis === "sold" ? "sold history" : "listing delist history";
  if (!opts.enabled)
    return {
      cost,
      included: false,
      assumption: `Holding/floorplan cost not included (would be ~${liq.daysToSell} days × $${rate}/day = $${cost}, from ${basis}, n=${liq.n}).`,
    };
  return {
    cost,
    included: true,
    assumption: `Holding cost $${cost}: ~${liq.daysToSell} days (${basis}, n=${liq.n}) × $${rate}/day floorplan heuristic.`,
  };
}
