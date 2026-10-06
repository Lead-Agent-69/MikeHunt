// lib/intelligence/affinity.ts
//
// The view-signal half of the recommendation loop (YouTube / TikTok / Instagram style, but $0 and
// explainable). Pure: callers pass compact signal rows from public.deal_signals.
//
//   signals ──► affinity profile (per-facet scores, recency-decayed, session-boosted)
//           ──► rankForYou (affinity + freshness + locality + quality, with an exploration slot)
//           ──► similarPrompt ("Interested in similar?" after meaningful views; honest copy)
//
// No embeddings, no AI call, no photo bytes. Every reason we show points at the user's own views.

export const SIGNAL_KINDS = [
  "open",
  "dwell",
  "save",
  "unsave",
  "dismiss",
  "interest_yes",
  "interest_no",
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

/** One compact row of public.deal_signals. Attributes are a snapshot so a pruned deal still teaches. */
export interface SignalRow {
  deal_id?: string | null;
  kind: SignalKind | string;
  dwell_ms?: number | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  price?: number | null;
  body?: string | null;
  state?: string | null;
  source?: string | null;
  title_class?: string | null;
  /** For interest_yes / interest_no: the prompt facet key that was answered. */
  facet?: string | null;
  created_at: string;
}

/**
 * Base weights. A save means more than an open; a dismiss or "no thanks" pushes away. Dwell is
 * scored separately (see dwellWeight) because a 3-second bounce is not interest.
 */
export const SIGNAL_WEIGHTS: Record<Exclude<SignalKind, "dwell">, number> = {
  open: 1,
  save: 3,
  unsave: -1.5,
  dismiss: -2,
  interest_yes: 2.5,
  interest_no: -1.5,
};

/** Long-term taste: a signal's weight halves every 30 days. */
export const LONG_TERM_HALF_LIFE_DAYS = 30;
/** Session intent: signals in the last 6 hours count 1.5x (what you are shopping for right now). */
export const SESSION_WINDOW_HOURS = 6;
export const SESSION_BOOST = 1.5;
/** Dwell under this is a bounce and teaches nothing. */
export const MIN_DWELL_MS = 5_000;
/** Dwell at or above this is a "meaningful" view for the similar prompt. */
export const MEANINGFUL_DWELL_MS = 15_000;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export function dwellWeight(dwellMs?: number | null): number {
  const ms = Number(dwellMs);
  if (!Number.isFinite(ms) || ms < MIN_DWELL_MS) return 0;
  // 30s ≈ one open; capped at 2 so a tab left open is not a save.
  return Math.min(2, ms / 30_000);
}

export function signalWeight(row: SignalRow): number {
  if (row.kind === "dwell") return dwellWeight(row.dwell_ms);
  return SIGNAL_WEIGHTS[row.kind as Exclude<SignalKind, "dwell">] ?? 0;
}

export function recencyFactor(createdAt: string, now: number): number {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return 0;
  const ageMs = Math.max(0, now - t);
  const long = Math.pow(0.5, ageMs / DAY_MS / LONG_TERM_HALF_LIFE_DAYS);
  return ageMs <= SESSION_WINDOW_HOURS * HOUR_MS ? long * SESSION_BOOST : long;
}

// ── Facets ──────────────────────────────────────────────────────────────────────────────────────

export type Facet =
  | "model"
  | "make"
  | "yearBand"
  | "priceBand"
  | "body"
  | "state"
  | "source"
  | "title";

/** How much each facet contributes to a candidate's affinity. Sums to 1. */
export const FACET_WEIGHTS: Record<Facet, number> = {
  model: 0.3,
  make: 0.15,
  priceBand: 0.15,
  body: 0.12,
  yearBand: 0.08,
  state: 0.08,
  title: 0.07,
  source: 0.05,
};

const PRICE_BANDS = [5_000, 10_000, 15_000, 20_000, 30_000, 45_000, 70_000];

export function priceBand(price?: number | null): string | null {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return null;
  let lo = 0;
  for (const hi of PRICE_BANDS) {
    if (p < hi) return `${lo}-${hi}`;
    lo = hi;
  }
  return `${lo}+`;
}

export function yearBand(year?: number | null): string | null {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1950 || y > 2100) return null;
  const lo = Math.floor(y / 3) * 3;
  return `${lo}-${lo + 2}`;
}

function norm(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export interface FacetSource {
  make?: string | null;
  model?: string | null;
  year?: number | null;
  price?: number | null;
  body?: string | null;
  state?: string | null;
  source?: string | null;
  title_class?: string | null;
}

/** Facet values for a listing or signal snapshot. Missing attributes produce no facet. */
export function facetsOf(x: FacetSource): Partial<Record<Facet, string>> {
  const out: Partial<Record<Facet, string>> = {};
  const make = norm(x.make);
  const model = norm(x.model);
  if (make) out.make = make;
  if (make && model) out.model = `${make}|${model}`;
  const yb = yearBand(x.year);
  if (yb) out.yearBand = yb;
  const pb = priceBand(x.price);
  if (pb) out.priceBand = pb;
  const body = norm(x.body);
  if (body) out.body = body;
  const st = String(x.state || "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{2}$/.test(st)) out.state = st;
  const src = norm(x.source);
  if (src) out.source = src;
  const title = norm(x.title_class);
  if (title && title !== "unknown") out.title = title;
  return out;
}

// ── Profile ─────────────────────────────────────────────────────────────────────────────────────

export interface FacetStat {
  score: number;
  /** Distinct deals with a positive signal on this value (for honest "you viewed N" copy). */
  positiveDeals: number;
}

export interface AffinityProfile {
  facets: Record<Facet, Map<string, FacetStat>>;
  /** Strongest absolute score per facet, for normalizing to -1..1. */
  maxAbs: Record<Facet, number>;
  /** Deals the user dismissed (never recommend again) and opened (push down, don't repeat). */
  dismissedIds: Set<string>;
  seenIds: Set<string>;
  signalCount: number;
  /** Display labels for model values, e.g. "honda|accord" → "Honda Accord". */
  labels: Map<string, string>;
}

const FACETS = Object.keys(FACET_WEIGHTS) as Facet[];

function emptyFacets<T>(make: () => T): Record<Facet, T> {
  return Object.fromEntries(FACETS.map((f) => [f, make()])) as Record<Facet, T>;
}

export function buildAffinityProfile(
  rows: readonly SignalRow[],
  now: number = Date.now(),
): AffinityProfile {
  const facets = emptyFacets(() => new Map<string, FacetStat>());
  const positiveDealsByValue = emptyFacets(
    () => new Map<string, Set<string>>(),
  );
  const dismissedIds = new Set<string>();
  const seenIds = new Set<string>();
  const labels = new Map<string, string>();
  let signalCount = 0;
  // A reload is not a second look: one open per deal per UTC day counts.
  const openedToday = new Set<string>();

  for (const row of rows || []) {
    if (row.kind === "open" && row.deal_id) {
      const k = `${row.deal_id}|${String(row.created_at).slice(0, 10)}`;
      if (openedToday.has(k)) continue;
      openedToday.add(k);
    }
    const base = signalWeight(row);
    const id = row.deal_id || "";
    if (row.kind === "dismiss" && id) dismissedIds.add(id);
    if ((row.kind === "open" || row.kind === "dwell") && id) seenIds.add(id);
    if (!base) continue;
    const w = base * recencyFactor(row.created_at, now);
    if (!w) continue;
    signalCount += 1;
    const f = facetsOf(row);
    // A prompt answer without a deal snapshot still carries the model it answered.
    if (!f.model && row.facet && PROMPT_FACET_RE.test(row.facet)) {
      f.model = row.facet.slice("model:".length);
      f.make = f.model.split("|")[0];
    }
    if (f.model && row.make && row.model)
      labels.set(f.model, `${row.make} ${row.model}`.replace(/\s+/g, " "));
    for (const facet of FACETS) {
      const value = f[facet];
      if (!value) continue;
      const stat = facets[facet].get(value) || { score: 0, positiveDeals: 0 };
      stat.score += w;
      facets[facet].set(value, stat);
      if (base > 0 && id) {
        const set = positiveDealsByValue[facet].get(value) || new Set();
        set.add(id);
        positiveDealsByValue[facet].set(value, set);
      }
    }
  }

  const maxAbs = emptyFacets(() => 0);
  for (const facet of FACETS) {
    facets[facet].forEach((stat, value) => {
      stat.positiveDeals = positiveDealsByValue[facet].get(value)?.size || 0;
      maxAbs[facet] = Math.max(maxAbs[facet], Math.abs(stat.score));
    });
  }
  return { facets, maxAbs, dismissedIds, seenIds, signalCount, labels };
}

/** Candidate affinity in -1..1 plus the strongest honest reason (from the user's own views). */
export function scoreAffinity(
  cand: FacetSource,
  profile: AffinityProfile,
): { affinity: number; reason?: string } {
  if (!profile.signalCount) return { affinity: 0 };
  const f = facetsOf(cand);
  let total = 0;
  let best: { facet: Facet; contrib: number; deals: number } | null = null;
  for (const facet of FACETS) {
    const value = f[facet];
    const max = profile.maxAbs[facet];
    if (!value || !max) continue;
    const stat = profile.facets[facet].get(value);
    if (!stat) continue;
    const contrib = FACET_WEIGHTS[facet] * (stat.score / max);
    total += contrib;
    if (
      contrib > 0 &&
      stat.positiveDeals >= 2 &&
      (!best || contrib > best.contrib)
    )
      best = { facet, contrib, deals: stat.positiveDeals };
  }
  const affinity = Math.max(-1, Math.min(1, total));
  return { affinity, reason: best ? reasonFor(best, f, profile) : undefined };
}

function reasonFor(
  best: { facet: Facet; deals: number },
  f: Partial<Record<Facet, string>>,
  profile: AffinityProfile,
): string {
  const n = best.deals;
  switch (best.facet) {
    case "model":
      return `You looked at ${n} ${profile.labels.get(f.model!) || "listings like this"}`;
    case "make":
      return `You looked at ${n} cars from this make`;
    case "priceBand":
      return `In the price range of ${n} cars you looked at`;
    case "body":
      return `Same body style as ${n} cars you looked at`;
    case "yearBand":
      return `Same model years as ${n} cars you looked at`;
    case "state":
      return `In the state of ${n} cars you looked at`;
    default:
      return `Similar to ${n} cars you looked at`;
  }
}

// ── Ranking ─────────────────────────────────────────────────────────────────────────────────────

export interface RankCandidate extends FacetSource {
  id: string;
  firstSeenAt?: string | null;
  /** 0..100 engine quality, used only as a ranking input. Never returned to non-flip desks. */
  quality?: number | null;
}

export interface RankOptions {
  now?: number;
  homeState?: string | null;
  searchStates?: readonly string[];
  /** Share of slots given to exploration (default 0.15 → every 7th slot). 0 disables. */
  explorationRate?: number;
  limit?: number;
}

export interface RankedItem<T> {
  item: T;
  rank: number;
  affinity: number;
  slot: "match" | "explore";
  reason?: string;
}

/** Rank weights. Affinity leads; freshness, locality and quality keep the feed useful. */
export const RANK_WEIGHTS = {
  affinity: 0.55,
  freshness: 0.2,
  locality: 0.15,
  quality: 0.1,
};
/** Already-opened listings drop this much so the feed does not loop on what you saw. */
export const SEEN_PENALTY = 0.25;
/** Freshness is 1 inside 72h of first seen and fades to 0 at 14 days. */
const FRESH_FULL_HOURS = 72;
const FRESH_ZERO_DAYS = 14;

export function freshnessScore(firstSeenAt?: string | null, now = Date.now()) {
  const t = firstSeenAt ? Date.parse(firstSeenAt) : NaN;
  if (!Number.isFinite(t)) return 0;
  const ageH = Math.max(0, (now - t) / HOUR_MS);
  if (ageH <= FRESH_FULL_HOURS) return 1;
  const span = FRESH_ZERO_DAYS * 24 - FRESH_FULL_HOURS;
  return Math.max(0, 1 - (ageH - FRESH_FULL_HOURS) / span);
}

export function localityScore(
  state: string | null | undefined,
  homeState?: string | null,
  searchStates: readonly string[] = [],
) {
  const st = String(state || "").toUpperCase();
  if (!st) return 0;
  if (homeState && st === homeState.toUpperCase()) return 1;
  if (searchStates.some((s) => s.toUpperCase() === st)) return 0.7;
  return 0;
}

export function rankForYou<T extends RankCandidate>(
  candidates: readonly T[],
  profile: AffinityProfile,
  opts: RankOptions = {},
): RankedItem<T>[] {
  const now = opts.now ?? Date.now();
  const limit = Math.max(1, opts.limit ?? 24);
  const rate = Math.max(0, Math.min(0.5, opts.explorationRate ?? 0.15));
  const every = rate > 0 ? Math.max(2, Math.round(1 / rate)) : 0;

  const scored = candidates
    .filter((c) => c.id && !profile.dismissedIds.has(c.id))
    .map((item) => {
      const { affinity, reason } = scoreAffinity(item, profile);
      const fresh = freshnessScore(item.firstSeenAt, now);
      const local = localityScore(
        item.state,
        opts.homeState,
        opts.searchStates,
      );
      const quality = Math.max(0, Math.min(1, Number(item.quality) / 100 || 0));
      const base =
        RANK_WEIGHTS.affinity * affinity +
        RANK_WEIGHTS.freshness * fresh +
        RANK_WEIGHTS.locality * local +
        RANK_WEIGHTS.quality * quality;
      const rank = base - (profile.seenIds.has(item.id) ? SEEN_PENALTY : 0);
      // Explore score ignores affinity: fresh, local, decent listings outside the user's pattern.
      const explore =
        0.45 * fresh +
        0.35 * local +
        0.2 * quality -
        (profile.seenIds.has(item.id) ? SEEN_PENALTY : 0);
      // Novel = a make the user has no positive signal on. That is what exploration widens.
      const make = facetsOf(item).make;
      const novel = !make || !((profile.facets.make.get(make)?.score ?? 0) > 0);
      return { item, rank, affinity, reason, explore, novel };
    });

  const byRank = [...scored].sort((a, b) => b.rank - a.rank);
  const explorePool = scored
    .filter((s) => s.novel)
    .sort((a, b) => b.explore - a.explore);
  const used = new Set<string>();
  const out: RankedItem<T>[] = [];
  let ri = 0;
  let ei = 0;
  while (out.length < limit) {
    const wantExplore =
      every > 0 && profile.signalCount > 0 && (out.length + 1) % every === 0;
    let pick: (typeof scored)[number] | undefined;
    let slot: "match" | "explore" = "match";
    if (wantExplore) {
      while (ei < explorePool.length && used.has(explorePool[ei].item.id)) ei++;
      if (ei < explorePool.length) {
        pick = explorePool[ei++];
        slot = "explore";
      }
    }
    if (!pick) {
      while (ri < byRank.length && used.has(byRank[ri].item.id)) ri++;
      if (ri >= byRank.length) break;
      pick = byRank[ri++];
    }
    used.add(pick.item.id);
    out.push({
      item: pick.item,
      rank: Math.round(pick.rank * 1000) / 1000,
      affinity: Math.round(pick.affinity * 1000) / 1000,
      slot,
      reason:
        slot === "explore"
          ? "Something different from what you usually open"
          : pick.affinity >= 0.2
            ? pick.reason
            : undefined,
    });
  }
  return out;
}

// ── "Interested in similar?" ────────────────────────────────────────────────────────────────────

/** Meaningful views of one model inside this window trigger the prompt. */
export const PROMPT_WINDOW_HOURS = 24;
/** Distinct listings needed before we ask. */
export const PROMPT_MIN_DEALS = 3;
/** After a yes or no on a facet, do not ask about it again for this long. */
export const PROMPT_COOLDOWN_DAYS = 7;

export interface SimilarPrompt {
  facet: string;
  label: string;
  basedOnListings: number;
  message: string;
}

/** Facet keys the prompt can ask about (and that interest_yes / interest_no can answer). */
export function promptFacetKey(modelFacet: string) {
  return `model:${modelFacet}`;
}

export const PROMPT_FACET_RE = /^model:[a-z0-9]{1,40}\|[a-z0-9]{1,40}$/;

export function similarPrompt(
  rows: readonly SignalRow[],
  now: number = Date.now(),
): SimilarPrompt | null {
  const windowStart = now - PROMPT_WINDOW_HOURS * HOUR_MS;
  const cooldownStart = now - PROMPT_COOLDOWN_DAYS * DAY_MS;
  const answered = new Set<string>();
  const dismissedByModel = new Map<string, number>();
  const dealsByModel = new Map<string, Set<string>>();
  const labels = new Map<string, string>();

  for (const row of rows || []) {
    const t = Date.parse(row.created_at);
    if (!Number.isFinite(t)) continue;
    if (
      (row.kind === "interest_yes" || row.kind === "interest_no") &&
      row.facet &&
      t >= cooldownStart
    ) {
      answered.add(row.facet);
      continue;
    }
    const model = facetsOf(row).model;
    if (!model || t < windowStart) continue;
    if (row.kind === "dismiss") {
      dismissedByModel.set(model, (dismissedByModel.get(model) || 0) + 1);
      continue;
    }
    const meaningful =
      row.kind === "open" ||
      row.kind === "save" ||
      (row.kind === "dwell" && Number(row.dwell_ms) >= MEANINGFUL_DWELL_MS);
    if (!meaningful || !row.deal_id) continue;
    const set = dealsByModel.get(model) || new Set<string>();
    set.add(row.deal_id);
    dealsByModel.set(model, set);
    if (row.make && row.model)
      labels.set(model, `${row.make} ${row.model}`.replace(/\s+/g, " "));
  }

  let best: { model: string; n: number } | null = null;
  dealsByModel.forEach((deals, model) => {
    const n = deals.size;
    if (n < PROMPT_MIN_DEALS) return;
    if (answered.has(promptFacetKey(model))) return;
    if ((dismissedByModel.get(model) || 0) >= 2) return;
    if (!best || n > best.n) best = { model, n };
  });
  if (!best) return null;
  const { model, n } = best as { model: string; n: number };
  const label = labels.get(model) || "this model";
  return {
    facet: promptFacetKey(model),
    label,
    basedOnListings: n,
    message: `You looked at ${n} ${label} listings in the last day. Want more like these?`,
  };
}
