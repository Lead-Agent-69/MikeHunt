// Retail fair value for the personal desk: what comparable cars actually sell for to retail
// buyers, not what a dealer could resell them for. Pure: no DB, no network.
//
// Flip / dealer valuation is unchanged (lib/arbitrage evaluateOpportunity: wholesale resale,
// asks × 0.95). This is a separate basis for someone buying a car to drive:
//
//   1. Sold retail comps, last 180 days: same state with n >= 3, else national with n >= 3.
//      Auction / wholesale channels (copart, iaa, manheim, adesa, acv) are not retail sales.
//      → "Typical selling price · N recent sales[ in ST]"
//   2. Else live retail asks, median with NO ask→sold haircut (aggregateComps askToSold: 1).
//      → "Typical asking price · N live listings (asking prices, not sales)"
//   Both: same title lane only (lib/arbitrage/title compCategoriesFor), and ±25k miles when the
//   car's mileage is known (comps without a mileage are left out then). Fewer than 3 → no value.
//
// Verdict (retailVerdict):
//   sold basis: price <= fair → Buy, <= fair × 1.05 → Wait (negotiate), above → Pass.
//   ask basis:  price <= p25 → good price (Buy), <= median → fair (Buy),
//               <= median × 1.05 → negotiate (Wait), above → over market (Pass).
// Confidence: 12 / 6 / 3 comps → high / medium / low. Ask basis caps at medium. Median comp
// older than 90 days drops one step. Unknown title caps at low. < 3 comps → "none".

import {
  aggregateComps,
  compConfidence,
  isSelfComp,
  COMP_MIN_SAMPLES,
  type CompAggregate,
} from "@/lib/scoring/comps-aggregate";
import {
  compCategoriesFor,
  titleCategory,
  type ArbitrageComp,
  type TitleCategory,
} from "@/lib/arbitrage";

export const RETAIL_SOLD_WINDOW_DAYS = 180;
export const RETAIL_MILEAGE_BAND = 25_000;
export const RETAIL_STALE_COMP_DAYS = 90;
/** Auction / dealer-wholesale channels: their hammer prices are not retail sales. */
export const WHOLESALE_SOURCE_RE = /copart|iaa|iaai|manheim|adesa|acv/i;

export type RetailConfidence = "high" | "medium" | "low" | "none";
export type RetailBasis = "sold" | "ask" | "none";
export type PriceRating = "good" | "fair" | "negotiate" | "over";

export interface RetailTarget {
  id?: string | null;
  source?: string | null;
  sourceDealId?: string | null;
  /** Where the car sits (two-letter state). Same-state comps win at n >= 3. */
  state?: string | null;
  mileage?: number | null;
  /** Title / condition text of the car being checked. */
  title?: string | null;
}

export interface RetailFairValue {
  value: number | null;
  basis: RetailBasis;
  /** Buyer-facing basis line, e.g. "Typical selling price · 7 recent sales in IL". */
  label: string | null;
  n: number;
  scope: "state" | "national" | "none";
  state: string | null;
  /** 25th–75th percentile of the comps that set the value. */
  range: { p25: number; p75: number } | null;
  confidence: { label: RetailConfidence; reasons: string[] };
  titleCategory: TitleCategory;
  medianAgeDays: number | null;
  newestAt: string | null;
  /** How many comps each filter dropped (for the "Why" sheet and tests). */
  excluded: { self: number; wholesale: number; title: number; mileage: number; old: number };
}

const DAY = 86_400_000;

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return quantile(s, 0.5);
}

const stateOf = (v?: string | null) => {
  const s = String(v || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
};

const STEP_DOWN: Record<RetailConfidence, RetailConfidence> = {
  high: "medium",
  medium: "low",
  low: "low",
  none: "none",
};
const RANK: Record<RetailConfidence, number> = { none: 0, low: 1, medium: 2, high: 3 };
const capAt = (l: RetailConfidence, cap: RetailConfidence) => (RANK[l] > RANK[cap] ? cap : l);

export function retailConfidence(input: {
  n: number;
  basis: RetailBasis;
  medianAgeDays: number | null;
  titleCategory: TitleCategory;
}): { label: RetailConfidence; reasons: string[] } {
  const reasons: string[] = [];
  if (input.basis === "none" || input.n < COMP_MIN_SAMPLES)
    return { label: "none", reasons: [`fewer than ${COMP_MIN_SAMPLES} comparable cars`] };
  let label = compConfidence(input.n) as RetailConfidence;
  reasons.push(`${input.n} comps`);
  if (input.basis === "ask" && RANK[label] > RANK.medium) {
    label = "medium";
    reasons.push("asking prices, not sales: capped at medium");
  }
  if (input.medianAgeDays != null && input.medianAgeDays > RETAIL_STALE_COMP_DAYS) {
    label = STEP_DOWN[label];
    reasons.push(`comps median ${input.medianAgeDays} days old: one step down`);
  }
  if (input.titleCategory === "Unknown" && RANK[label] > RANK.low) {
    label = capAt(label, "low");
    reasons.push("title not stated: capped at low");
  }
  return { label, reasons };
}

export function retailFairValue(
  target: RetailTarget,
  comps: readonly ArbitrageComp[],
  opts: { now?: number } = {},
): RetailFairValue {
  const now = opts.now ?? Date.now();
  const cat = titleCategory(target.title);
  const lane = compCategoriesFor(cat);
  const state = stateOf(target.state);
  const miles = Number(target.mileage);
  const hasMiles = Number.isFinite(miles) && miles > 0;
  const excluded = { self: 0, wholesale: 0, title: 0, mileage: 0, old: 0 };
  const selfTarget = { id: target.id, source: target.source, sourceDealId: target.sourceDealId };

  const kept: ArbitrageComp[] = [];
  for (const c of comps || []) {
    if (!c || !(Number(c.price) > 0)) continue;
    if (isSelfComp(c, selfTarget)) {
      excluded.self++;
      continue;
    }
    if (WHOLESALE_SOURCE_RE.test(String(c.source || ""))) {
      excluded.wholesale++;
      continue;
    }
    if (!lane.includes(titleCategory(c.title))) {
      excluded.title++;
      continue;
    }
    if (hasMiles) {
      const m = Number(c.mileage);
      if (!(Number.isFinite(m) && m > 0) || Math.abs(m - miles) > RETAIL_MILEAGE_BAND) {
        excluded.mileage++;
        continue;
      }
    }
    if (c.kind === "sold") {
      const t = c.observedAt ? Date.parse(c.observedAt) : NaN;
      // A sale needs a real date inside the window (and not in the future) to count.
      if (!Number.isFinite(t) || t < now - RETAIL_SOLD_WINDOW_DAYS * DAY || t > now + 60_000) {
        excluded.old++;
        continue;
      }
    }
    kept.push(c);
  }

  const target3 = { ...selfTarget, state };
  const sold = kept.filter((c) => c.kind === "sold");
  const asks = kept.filter((c) => c.kind === "ask");
  let agg: CompAggregate = aggregateComps(target3, sold, { now, minSamples: COMP_MIN_SAMPLES });
  let rows = sold;
  if (agg.value == null) {
    agg = aggregateComps(target3, asks, { now, minSamples: COMP_MIN_SAMPLES, askToSold: 1 });
    rows = asks;
  }

  if (agg.value == null || agg.kind === "none") {
    return {
      value: null,
      basis: "none",
      label: null,
      n: 0,
      scope: "none",
      state,
      range: null,
      confidence: retailConfidence({ n: 0, basis: "none", medianAgeDays: null, titleCategory: cat }),
      titleCategory: cat,
      medianAgeDays: null,
      newestAt: null,
      excluded,
    };
  }

  const used =
    agg.scope === "state" ? rows.filter((c) => stateOf(c.state) === agg.state) : rows;
  const prices = used.map((c) => Number(c.price)).sort((a, b) => a - b);
  const times = used
    .map((c) => (c.observedAt ? Date.parse(c.observedAt) : NaN))
    .filter((t) => Number.isFinite(t));
  const ageMed = median(times.map((t) => Math.max(0, (now - t) / DAY)));
  const medianAgeDays = ageMed == null ? null : Math.round(ageMed);
  const basis: RetailBasis = agg.kind === "sold" ? "sold" : "ask";
  const where = agg.scope === "state" && agg.state ? ` in ${agg.state}` : "";
  const label =
    basis === "sold"
      ? `Typical selling price · ${agg.n} recent sales${where}`
      : `Typical asking price · ${agg.n} live listings (asking prices, not sales)`;

  return {
    value: agg.value,
    basis,
    label,
    n: agg.n,
    scope: agg.scope as "state" | "national",
    state: agg.scope === "state" ? agg.state : null,
    range: { p25: Math.round(quantile(prices, 0.25)), p75: Math.round(quantile(prices, 0.75)) },
    confidence: retailConfidence({ n: agg.n, basis, medianAgeDays, titleCategory: cat }),
    titleCategory: cat,
    medianAgeDays,
    newestAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    excluded,
  };
}

export interface RetailVerdict {
  verdict: "buy" | "wait" | "pass" | "not_enough_data";
  rating: PriceRating | null;
  headline: string;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Price vs retail fair value, per basis (see file header). */
export function retailVerdict(price: number, fv: RetailFairValue): RetailVerdict {
  if (fv.value == null || fv.basis === "none")
    return {
      verdict: "not_enough_data",
      rating: null,
      headline: "Not enough data: too few comparable cars to price this one.",
    };
  const fair = fv.value;
  if (fv.basis === "sold") {
    if (price <= fair)
      return {
        verdict: "buy",
        rating: price < fair ? "good" : "fair",
        headline:
          price < fair
            ? `Good price: about ${money(fair - price)} under what similar cars sell for (${money(fair)}).`
            : `Fair price: in line with what similar cars sell for (${money(fair)}).`,
      };
    if (price <= fair * 1.05)
      return {
        verdict: "wait",
        rating: "negotiate",
        headline: `Close: offer ${money(fair)} or less. Similar cars sell for about that.`,
      };
    return {
      verdict: "pass",
      rating: "over",
      headline: `Overpriced by about ${money(price - fair)}. Similar cars sell for ${money(fair)}.`,
    };
  }
  const p25 = fv.range?.p25 ?? fair;
  if (price <= p25)
    return {
      verdict: "buy",
      rating: "good",
      headline: `Good price: among the lowest asks for similar cars (typical ask ${money(fair)}).`,
    };
  if (price <= fair)
    return {
      verdict: "buy",
      rating: "fair",
      headline: `Fair price: at or under the typical ask for similar cars (${money(fair)}).`,
    };
  if (price <= fair * 1.05)
    return {
      verdict: "wait",
      rating: "negotiate",
      headline: `Close: a little over the typical ask. Offer ${money(fair)} or less.`,
    };
  return {
    verdict: "pass",
    rating: "over",
    headline: `Over market: about ${money(price - fair)} above the typical ask (${money(fair)}).`,
  };
}
