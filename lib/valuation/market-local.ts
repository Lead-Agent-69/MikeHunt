// lib/valuation/market-local.ts
// Market-local valuation: adjust a NATIONAL comp value to the buyer's own market, and price the
// trip there. Two rules keep it honest:
//   1. The regional ratio comes ONLY from our own comps: median(same-state) / median(national), same
//      evidence kind on both sides, n >= minSamples (3) on EACH side, self and stale rows excluded.
//      No published regional multipliers, no guesses. Otherwise ratio = null and NO adjustment, with
//      the reason returned so callers can say so.
//   2. A value that already came from same-state comps is never re-adjusted (the ratio is already in
//      it). Distance changes only transport (existing haversine buyerDistance +
//      transportCostForDistance); we do not invent a per-mile value discount.

import {
  COMP_MIN_SAMPLES,
  compConfidence,
  isSelfComp,
  type CompConfidence,
  type CompObservation,
  type CompTarget,
} from "@/lib/scoring/comps-aggregate";
import {
  buyerDistance,
  resolvePointState,
  transportCostForDistance,
  type BuyerDistance,
  type GeoPoint,
} from "@/lib/geo/buyer-distance";
import { UNKNOWN_DISTANCE_TRANSPORT_COST } from "@/lib/arbitrage/constants";

export interface RegionalRatio {
  /** median(state) / median(national), rounded to 3 dp. Null = no adjustment. */
  ratio: number | null;
  kind: "sold" | "ask" | "none";
  state: string | null;
  nState: number;
  nNational: number;
  stateMedian: number | null;
  nationalMedian: number | null;
  /** compConfidence(min(nState, nNational)). */
  confidence: CompConfidence;
  reason: string;
}

export interface RegionalOptions {
  minSamples?: number;
  /** Drop comps observed more than this many days ago (same meaning as aggregateComps). */
  maxAgeDays?: number | null;
  now?: number;
  /** Force one evidence kind. Default: sold when both sides qualify, else ask. */
  kind?: "sold" | "ask";
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const st = (v?: string | null) =>
  String(v || "")
    .trim()
    .toUpperCase();

/** Same-state vs national median ratio from our own comps, or null with the reason. */
export function regionalRatio(
  target: CompTarget,
  comps: readonly CompObservation[],
  sellMarket: GeoPoint | null | undefined,
  opts: RegionalOptions = {},
): RegionalRatio {
  const minSamples = Math.max(1, opts.minSamples ?? COMP_MIN_SAMPLES);
  const state = resolvePointState(sellMarket);
  const now = opts.now ?? Date.now();
  const cutoff =
    opts.maxAgeDays != null && opts.maxAgeDays > 0
      ? now - opts.maxAgeDays * 86_400_000
      : null;
  const none = (reason: string, extra: Partial<RegionalRatio> = {}) =>
    ({
      ratio: null,
      kind: "none",
      state,
      nState: 0,
      nNational: 0,
      stateMedian: null,
      nationalMedian: null,
      confidence: "none",
      reason,
      ...extra,
    }) as RegionalRatio;
  if (!state) return none("No buyer market state: no regional adjustment.");

  const clean = (comps || []).filter((c) => {
    if (!c || !(Number(c.price) > 0)) return false;
    if (c.kind !== "sold" && c.kind !== "ask") return false;
    if (isSelfComp(c, target)) return false;
    if (cutoff != null && c.observedAt) {
      const t = Date.parse(c.observedAt);
      if (Number.isFinite(t) && t < cutoff) return false;
    }
    return true;
  });

  const side = (kind: "sold" | "ask") => {
    const nat = clean.filter((c) => c.kind === kind);
    const inSt = nat.filter((c) => st(c.state) === state);
    return {
      nat,
      inSt,
      ok: inSt.length >= minSamples && nat.length >= minSamples,
    };
  };
  const kinds: Array<"sold" | "ask"> = opts.kind
    ? [opts.kind]
    : ["sold", "ask"];
  for (const kind of kinds) {
    const s = side(kind);
    if (!s.ok) continue;
    const sm = median(s.inSt.map((c) => Number(c.price)))!;
    const nm = median(s.nat.map((c) => Number(c.price)))!;
    if (!(nm > 0)) continue;
    const n = Math.min(s.inSt.length, s.nat.length);
    return {
      ratio: Math.round((sm / nm) * 1000) / 1000,
      kind,
      state,
      nState: s.inSt.length,
      nNational: s.nat.length,
      stateMedian: Math.round(sm),
      nationalMedian: Math.round(nm),
      confidence: compConfidence(n, minSamples),
      reason: `${state} ${kind} median $${Math.round(sm)} (n=${s.inSt.length}) vs national $${Math.round(nm)} (n=${s.nat.length}).`,
    };
  }
  const best = side(opts.kind ?? "ask");
  return none(
    `Fewer than ${minSamples} comps in ${state} or nationally for the same evidence kind: no regional adjustment.`,
    { nState: best.inSt.length, nNational: best.nat.length },
  );
}

export interface MarketLocalInput {
  /** The comp value to localise (e.g. aggregateComps(...).value). */
  value: number | null;
  /** Where that value came from. "state" values are already local and are never re-adjusted. */
  valueScope: "state" | "national" | "none";
  ratio: RegionalRatio;
  /** Buyer home (resolveBuyerHome output is a GeoPoint) and listing location, for transport. */
  home?: GeoPoint | null;
  listing?: GeoPoint | null;
}

export interface MarketLocalValue {
  value: number | null;
  adjusted: boolean;
  ratio: number | null;
  distance: BuyerDistance;
  /** Haversine transport cost; national default when distance is unknown. */
  transport: number;
  assumptions: string[];
}

export function marketLocalValue(input: MarketLocalInput): MarketLocalValue {
  const distance = buyerDistance(input.home, input.listing);
  const transport =
    transportCostForDistance(distance, UNKNOWN_DISTANCE_TRANSPORT_COST) ??
    UNKNOWN_DISTANCE_TRANSPORT_COST;
  const assumptions: string[] = [];
  if (distance.basis === "unknown")
    assumptions.push(
      `Distance unknown: transport is the $${UNKNOWN_DISTANCE_TRANSPORT_COST} national default.`,
    );
  assumptions.push(
    "Distance affects transport only; no per-mile value discount is applied.",
  );

  const v = Number(input.value);
  if (input.value == null || !Number.isFinite(v) || v <= 0)
    return {
      value: null,
      adjusted: false,
      ratio: null,
      distance,
      transport,
      assumptions,
    };

  if (input.valueScope === "state") {
    assumptions.push(
      "Value already from same-state comps: no regional adjustment needed.",
    );
    return {
      value: Math.round(v),
      adjusted: false,
      ratio: null,
      distance,
      transport,
      assumptions,
    };
  }
  if (input.valueScope !== "national" || input.ratio.ratio == null) {
    assumptions.push(input.ratio.reason);
    return {
      value: Math.round(v),
      adjusted: false,
      ratio: null,
      distance,
      transport,
      assumptions,
    };
  }
  assumptions.push(
    `Regional adjustment ×${input.ratio.ratio} from our own comps: ${input.ratio.reason}`,
  );
  return {
    value: Math.round(v * input.ratio.ratio),
    adjusted: true,
    ratio: input.ratio.ratio,
    distance,
    transport,
    assumptions,
  };
}
