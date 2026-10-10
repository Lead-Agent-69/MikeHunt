// lib/market/timing.ts
// Like-for-like market timing. The old market_timing_signals view averaged every ask seen in the
// last 7 days against every ask seen 7-30 days ago. Those are different cars each week (years,
// miles, trims, auction bids), so a newer, low-mile batch arriving read as "prices +44.7%, BUY NOW".
//
// Method, in order of preference:
//   1. same_listing: for each fixed-price listing that had an ask before the recent window and is
//      still listed in it, compare its current ask with its own ask at the start of the recent window
//      (price_history is change-logged, so an unchanged listing counts as 0%). The trend is the mean
//      per-listing change, each clipped to ±30% so a data error can't swing it.
//   2. mix_adjusted: when there aren't enough same-listing pairs, group listings into cohorts of
//      year × mileage band × trim, compare each cohort's median ask across the two windows, and take
//      the weighted mean of the cohort log-ratios (weight = the smaller window count). Only cohorts
//      seen in both windows count, so a cohort that only appears recently cannot move the index.
//   3. none: below the minimum sample, there is no signal.
// Auction rows (bids rise by design) and asks under $500 (placeholder bids) are excluded from both.
// Only high/medium confidence can carry a BUY_NOW / WAIT / NEUTRAL verdict; low returns the trend with
// a caveat and signal null.

import { isAuctionChannel } from "@/lib/sources/source-meta";

export type TimingSignal = "BUY_NOW" | "WAIT" | "NEUTRAL";
export type TimingConfidence = "high" | "medium" | "low" | "none";
export type TimingBasis = "same_listing" | "mix_adjusted" | "none";

export interface TimingObservation {
  dealId: string;
  price: number;
  observedAt: string;
  year?: number | null;
  mileage?: number | null;
  trim?: string | null;
  source?: string | null;
  auctionEndAt?: string | null;
  lastSeenAt?: string | null;
}

export interface TimingWindow {
  from: string;
  recentFrom: string;
  to: string;
  days: number;
  recentDays: number;
}

export interface TimingResult {
  signal: TimingSignal | null;
  confidence: TimingConfidence;
  basis: TimingBasis;
  /** same_listing: matched listings; mix_adjusted: distinct listings in matched cohorts. */
  sampleSize: number;
  /** Like-for-like change in percent (1 dp); null when confidence is none. */
  trendPct: number | null;
  /** Median current ask of the listings behind the trend (context only, not a verdict). */
  medianAsk: number | null;
  window: TimingWindow;
  reason: string;
  detail: {
    sameListingPairs: number;
    mixCohorts: number;
    mixRecentListings: number;
    mixPriorListings: number;
  };
}

/** Thresholds are exported so tests and docs pin the same numbers. */
export const TIMING_THRESHOLDS = {
  windowDays: 30,
  recentDays: 7,
  minPrice: 500,
  /** Per-listing change is clipped to ±30% before averaging. */
  maxPairChange: 0.3,
  sameListing: { low: 3, medium: 8, high: 20 },
  /** Mix-adjusted tops out at medium: year/miles/trim still miss condition and title. */
  mixAdjusted: {
    lowCohorts: 2,
    lowListingsPerWindow: 3,
    mediumCohorts: 5,
    mediumListingsPerWindow: 8,
  },
  /** |trend| needed for BUY_NOW / WAIT, by basis. */
  verdictPct: { same_listing: 3, mix_adjusted: 5 },
} as const;

const DAY = 86_400_000;

export function mileageBand(miles: number | null | undefined): string {
  if (miles == null || !Number.isFinite(miles) || miles < 0) return "mi?";
  if (miles < 30_000) return "0-30k";
  if (miles < 60_000) return "30-60k";
  if (miles < 100_000) return "60-100k";
  if (miles < 150_000) return "100-150k";
  return "150k+";
}

function normTrim(trim: string | null | undefined): string {
  const t = (trim ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return t || "trim?";
}

function isFixedPrice(o: TimingObservation): boolean {
  return !o.auctionEndAt && !isAuctionChannel(o.source);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function verdict(basis: Exclude<TimingBasis, "none">, pct: number): TimingSignal {
  const t = TIMING_THRESHOLDS.verdictPct[basis];
  if (pct >= t) return "BUY_NOW";
  if (pct <= -t) return "WAIT";
  return "NEUTRAL";
}

interface Partial_ {
  confidence: TimingConfidence;
  trendPct: number | null;
  sampleSize: number;
  medianAsk: number | null;
}

function sameListing(
  byDeal: Map<string, TimingObservation[]>,
  recentStart: number,
): Partial_ & { pairs: number } {
  const changes: number[] = [];
  const asks: number[] = [];
  const clip = TIMING_THRESHOLDS.maxPairChange;
  for (const obs of Array.from(byDeal.values())) {
    const before = obs.filter((o) => Date.parse(o.observedAt) < recentStart);
    if (!before.length) continue;
    const baseline = before[before.length - 1];
    const current = obs[obs.length - 1];
    const stillListed =
      Date.parse(current.observedAt) >= recentStart ||
      (current.lastSeenAt != null && Date.parse(current.lastSeenAt) >= recentStart);
    if (!stillListed) continue; // may have sold; its last ask says nothing about now
    const ch = current.price / baseline.price - 1;
    changes.push(Math.max(-clip, Math.min(clip, ch)));
    asks.push(current.price);
  }
  const n = changes.length;
  const { low, medium, high } = TIMING_THRESHOLDS.sameListing;
  const confidence: TimingConfidence =
    n >= high ? "high" : n >= medium ? "medium" : n >= low ? "low" : "none";
  const mean = n ? changes.reduce((s, x) => s + x, 0) / n : 0;
  return {
    pairs: n,
    confidence,
    trendPct: confidence === "none" ? null : round1(mean * 100),
    sampleSize: n,
    medianAsk: n ? Math.round(median(asks)) : null,
  };
}

function mixAdjusted(
  byDeal: Map<string, TimingObservation[]>,
  recentStart: number,
): Partial_ & { cohorts: number; recentN: number; priorN: number } {
  // One price per listing per window (its latest), so a frequently re-logged listing can't dominate.
  const cohorts = new Map<string, { recent: number[]; prior: number[]; ids: Set<string> }>();
  for (const [id, obs] of Array.from(byDeal.entries())) {
    const head = obs[obs.length - 1];
    if (head.year == null) continue; // a year-less row has no cohort
    const key = `${head.year}|${mileageBand(head.mileage)}|${normTrim(head.trim)}`;
    const c = cohorts.get(key) ?? { recent: [], prior: [], ids: new Set<string>() };
    const prior = obs.filter((o) => Date.parse(o.observedAt) < recentStart);
    const recent = obs.filter((o) => Date.parse(o.observedAt) >= recentStart);
    if (prior.length) c.prior.push(prior[prior.length - 1].price);
    if (recent.length) c.recent.push(recent[recent.length - 1].price);
    c.ids.add(id);
    cohorts.set(key, c);
  }
  let wSum = 0;
  let lrSum = 0;
  let matched = 0;
  let recentN = 0;
  let priorN = 0;
  const ids = new Set<string>();
  const asks: number[] = [];
  for (const c of Array.from(cohorts.values())) {
    if (!c.recent.length || !c.prior.length) continue;
    const w = Math.min(c.recent.length, c.prior.length);
    lrSum += w * Math.log(median(c.recent) / median(c.prior));
    wSum += w;
    matched += 1;
    recentN += c.recent.length;
    priorN += c.prior.length;
    c.ids.forEach((i) => ids.add(i));
    asks.push(...c.recent);
  }
  const m = TIMING_THRESHOLDS.mixAdjusted;
  const perWindow = Math.min(recentN, priorN);
  const confidence: TimingConfidence =
    matched >= m.mediumCohorts && perWindow >= m.mediumListingsPerWindow
      ? "medium"
      : matched >= m.lowCohorts && perWindow >= m.lowListingsPerWindow
        ? "low"
        : "none";
  return {
    cohorts: matched,
    recentN,
    priorN,
    confidence,
    trendPct:
      confidence === "none" || !wSum ? null : round1((Math.exp(lrSum / wSum) - 1) * 100),
    sampleSize: ids.size,
    medianAsk: asks.length ? Math.round(median(asks)) : null,
  };
}

const RANK: Record<TimingConfidence, number> = { high: 3, medium: 2, low: 1, none: 0 };

export function computeMarketTiming(
  observations: TimingObservation[],
  now: Date = new Date(),
): TimingResult {
  const T = TIMING_THRESHOLDS;
  const to = now.getTime();
  const from = to - T.windowDays * DAY;
  const recentStart = to - T.recentDays * DAY;
  const window: TimingWindow = {
    from: new Date(from).toISOString(),
    recentFrom: new Date(recentStart).toISOString(),
    to: new Date(to).toISOString(),
    days: T.windowDays,
    recentDays: T.recentDays,
  };

  const byDeal = new Map<string, TimingObservation[]>();
  for (const o of observations) {
    const t = Date.parse(o.observedAt);
    if (!Number.isFinite(t) || t < from || t > to) continue;
    if (!(o.price >= T.minPrice) || !isFixedPrice(o)) continue;
    const list = byDeal.get(o.dealId) ?? [];
    list.push(o);
    byDeal.set(o.dealId, list);
  }
  for (const list of Array.from(byDeal.values()))
    list.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));

  const same = sameListing(byDeal, recentStart);
  const mix = mixAdjusted(byDeal, recentStart);
  const detail = {
    sameListingPairs: same.pairs,
    mixCohorts: mix.cohorts,
    mixRecentListings: mix.recentN,
    mixPriorListings: mix.priorN,
  };

  // Same-listing wins at medium+; mix-adjusted only if it is strictly more confident.
  const useSame = RANK[same.confidence] >= RANK[mix.confidence];
  const basis: TimingBasis =
    same.confidence === "none" && mix.confidence === "none"
      ? "none"
      : useSame
        ? "same_listing"
        : "mix_adjusted";

  if (basis === "none") {
    return {
      signal: null,
      confidence: "none",
      basis: "none",
      sampleSize: Math.max(same.sampleSize, mix.sampleSize),
      trendPct: null,
      medianAsk: null,
      window,
      reason:
        `Not enough like-for-like data: ${same.pairs} same-listing price pairs ` +
        `(need ${T.sameListing.low}+) and ${mix.cohorts} year/mileage/trim cohorts seen in both ` +
        `windows (need ${T.mixAdjusted.lowCohorts}+ with ${T.mixAdjusted.lowListingsPerWindow}+ listings each window). ` +
        `Fixed-price asks only; auction bids are excluded.`,
      detail,
    };
  }

  const p = basis === "same_listing" ? same : mix;
  const canVerdict = p.confidence === "high" || p.confidence === "medium";
  const signal = canVerdict && p.trendPct != null ? verdict(basis, p.trendPct) : null;
  const what =
    basis === "same_listing"
      ? `${same.pairs} listings compared with their own earlier ask`
      : `${mix.cohorts} year/mileage/trim cohorts (${mix.priorN} earlier vs ${mix.recentN} recent listings)`;
  const reason = canVerdict
    ? `Like-for-like trend from ${what}: ${p.trendPct! > 0 ? "+" : ""}${p.trendPct}% over the last ${T.recentDays} days.`
    : `Early read only (low confidence) from ${what}: ${p.trendPct! > 0 ? "+" : ""}${p.trendPct}%. ` +
      `Too few matches for a buy/wait call.`;

  return {
    signal,
    confidence: p.confidence,
    basis,
    sampleSize: p.sampleSize,
    trendPct: p.trendPct,
    medianAsk: p.medianAsk,
    window,
    reason,
    detail,
  };
}
