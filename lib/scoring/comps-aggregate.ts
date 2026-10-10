// lib/scoring/comps-aggregate.ts
// Pure comps aggregation: same-state when the sample allows, national otherwise, and never the
// listing's own price. This is the plug point for an external comp feed (eli's data/scraper lane):
// hand analyzeDeal({ ..., }, { comps: CompObservation[] }) and it values the car from these rows
// instead of the in-memory ask index.
//
// Honesty rules (enforced here, covered by comps-aggregate.test.ts):
//   • The target listing is never its own comp (matched by id, and by source+source_deal_id).
//   • Completed sales beat asking prices. Asks get the ask→sold haircut; sold prices do not.
//   • Same-state wins only with n >= minSamples in that state; else national with n >= minSamples;
//     else NO value (null, confidence "none"). We never fill a thin bucket with a guess.
//   • Stale rows (older than maxAgeDays when observedAt is given) are dropped, not down-weighted.
//
// Expected input (CompObservation) — one row per real observed price:
//   price        number  required  cash price in USD (> 0). Not a payment/lease/down number.
//   kind         "sold" | "ask"    completed sale (auction hammer, eBay sold, dealer sold) or live ask
//   state        string?  2-letter US state of the vehicle when observed
//   year         number?  model year (caller should pre-filter to the target's year band)
//   mileage      number?  odometer at observation
//   observedAt   string?  ISO time of the sale / last time the ask was seen live
//   id           string?  deals.id when the comp is one of our own listings
//   source       string?  channel (copart, ebay_motors, cars_com…)
//   sourceDealId string?  the channel's own listing id
// Callers pre-filter to the same make/model/year band (and title lane: clean vs salvage).

export interface CompObservation {
  price: number;
  kind: "sold" | "ask";
  state?: string | null;
  year?: number | null;
  mileage?: number | null;
  observedAt?: string | null;
  id?: string | null;
  source?: string | null;
  sourceDealId?: string | null;
}

export interface CompTarget {
  id?: string | null;
  source?: string | null;
  sourceDealId?: string | null;
  state?: string | null;
}

export type CompScope = "state" | "national" | "none";
export type CompConfidence = "high" | "medium" | "low" | "none";

export interface CompAggregate {
  /** Resale value implied by the comps (sold median, or ask median × askToSold). Null = unknown. */
  value: number | null;
  n: number;
  scope: CompScope;
  kind: "sold" | "ask" | "none";
  confidence: CompConfidence;
  state: string | null;
  mileageMed: number | null;
  /** Rows dropped because they were the target listing itself. */
  excludedSelf: number;
  /** Rows dropped as stale. */
  excludedStale: number;
}

export interface AggregateOptions {
  minSamples?: number;
  askToSold?: number;
  maxAgeDays?: number | null;
  now?: number;
}

export const COMP_MIN_SAMPLES = 3;
/** Listing asks run above transaction prices. Same constant lib/scoring/market-value.ts uses. */
export const ASK_TO_SOLD = 0.95;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Sample-size confidence. Same thresholds as market-value confidenceFor (12 / 6 / 3). */
export function compConfidence(
  n: number,
  minSamples = COMP_MIN_SAMPLES,
): CompConfidence {
  return n >= 12
    ? "high"
    : n >= 6
      ? "medium"
      : n >= minSamples
        ? "low"
        : "none";
}

function norm(v?: string | null): string {
  return String(v || "")
    .trim()
    .toLowerCase();
}

export function isSelfComp(c: CompObservation, t: CompTarget): boolean {
  if (t.id && c.id && c.id === t.id) return true;
  return (
    !!t.source &&
    !!t.sourceDealId &&
    norm(c.source) === norm(t.source) &&
    norm(c.sourceDealId) === norm(t.sourceDealId)
  );
}

const NONE = (
  excludedSelf: number,
  excludedStale: number,
  state: string | null,
): CompAggregate => ({
  value: null,
  n: 0,
  scope: "none",
  kind: "none",
  confidence: "none",
  state,
  mileageMed: null,
  excludedSelf,
  excludedStale,
});

/** Aggregate comps for one target listing. See file header for the rules. */
export function aggregateComps(
  target: CompTarget,
  comps: readonly CompObservation[],
  opts: AggregateOptions = {},
): CompAggregate {
  const minSamples = Math.max(1, opts.minSamples ?? COMP_MIN_SAMPLES);
  const askToSold = opts.askToSold ?? ASK_TO_SOLD;
  const now = opts.now ?? Date.now();
  const cutoff =
    opts.maxAgeDays != null && opts.maxAgeDays > 0
      ? now - opts.maxAgeDays * 86_400_000
      : null;
  const state = /^[A-Za-z]{2}$/.test(String(target.state || "").trim())
    ? String(target.state).trim().toUpperCase()
    : null;

  let excludedSelf = 0;
  let excludedStale = 0;
  const clean: CompObservation[] = [];
  for (const c of comps || []) {
    if (!c || !(Number(c.price) > 0) || (c.kind !== "sold" && c.kind !== "ask"))
      continue;
    if (isSelfComp(c, target)) {
      excludedSelf++;
      continue;
    }
    if (cutoff != null && c.observedAt) {
      const t = Date.parse(c.observedAt);
      if (Number.isFinite(t) && t < cutoff) {
        excludedStale++;
        continue;
      }
    }
    clean.push(c);
  }

  const inState = (c: CompObservation) =>
    !!state &&
    String(c.state || "")
      .trim()
      .toUpperCase() === state;

  // Evidence ladder: sold same-state → sold national → ask same-state → ask national.
  const tiers: {
    kind: "sold" | "ask";
    scope: "state" | "national";
    rows: CompObservation[];
  }[] = [];
  for (const kind of ["sold", "ask"] as const) {
    const ofKind = clean.filter((c) => c.kind === kind);
    if (state)
      tiers.push({ kind, scope: "state", rows: ofKind.filter(inState) });
    tiers.push({ kind, scope: "national", rows: ofKind });
  }

  for (const tier of tiers) {
    if (tier.rows.length < minSamples) continue;
    const med = median(tier.rows.map((r) => Number(r.price)));
    if (med == null || med <= 0) continue;
    const miles = tier.rows
      .map((r) => Number(r.mileage))
      .filter((m) => Number.isFinite(m) && m > 0);
    return {
      value: Math.round(tier.kind === "ask" ? med * askToSold : med),
      n: tier.rows.length,
      scope: tier.scope,
      kind: tier.kind,
      confidence: compConfidence(tier.rows.length, minSamples),
      state,
      mileageMed: miles.length ? Math.round(median(miles)!) : null,
      excludedSelf,
      excludedStale,
    };
  }
  return NONE(excludedSelf, excludedStale, state);
}
