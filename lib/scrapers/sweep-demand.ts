import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  STATE_METRO_ZIPS,
  SWEEP_STATE_CODES,
  metroZipsForState,
} from "@/lib/geo/metro-zips";
import { nearbyStates } from "@/lib/geo/us-states";
import {
  type StateRotation,
  type SweepPlan,
  planSweepStates,
} from "./sweep-plan";
import { orderSourcesByTier, sourceTier } from "./sweep-schedule";

/**
 * Demand-weighted sweep planning. Deterministic heuristics only (no LLM in the hot path).
 * See docs/USER-DRIVEN-SCRAPING.md §5.
 *
 *   score(state) = 10·ln(1 + D) + 2·min(H/24, 4) + 1/(1 + A/100)
 *     D = demand weight from scrape_demand (home 3·r, search 2·r, recent 1·e^(−age/3)),
 *         expanded through nearbyStates rings with weight · 1/(1+ring)
 *     H = hours since the state was last planned into a sweep (never = capped term)
 *     A = active listings in the state (thin states get a small bump)
 *
 * Every sweep keeps F = max(3, ceil(0.4·K)) least-recently-swept "baseline" slots, so no state starves
 * (each state is still planned at least every ceil(51/F) sweeps). The other K−F slots go to the
 * highest-scoring states with demand. With no demand the plan is exactly the plain rotation.
 */

export interface DemandRow {
  state: string;
  zip3?: string | null;
  kind?: string;
  weight: number;
  users?: number;
}

export interface DemandSummary {
  /** Total demand weight per state (includes ring expansion when applied). */
  weights: Record<string, number>;
  /** Demanded 3-digit ZIP prefixes per state, heaviest first (ring-0 anchors only). */
  zip3s: Record<string, string[]>;
  /** Ring distance from the nearest user home/search anchor (0 = demanded state itself). */
  rings?: Record<string, number>;
  /** Ring-0 anchor states from scrape_demand (before neighbor expansion). */
  anchors?: string[];
}

const KNOWN_STATES = new Set(SWEEP_STATE_CODES);

export function summarizeDemand(
  rows: readonly DemandRow[] | null | undefined,
): DemandSummary {
  const weights: Record<string, number> = {};
  const zipWeights: Record<string, Record<string, number>> = {};
  for (const row of rows || []) {
    const state = String(row?.state || "")
      .trim()
      .toUpperCase();
    const weight = Number(row?.weight);
    if (!KNOWN_STATES.has(state) || !Number.isFinite(weight) || weight <= 0)
      continue;
    weights[state] = (weights[state] || 0) + weight;
    const zip3 = String(row.zip3 || "");
    if (/^\d{3}$/.test(zip3)) {
      zipWeights[state] ||= {};
      zipWeights[state][zip3] = (zipWeights[state][zip3] || 0) + weight;
    }
  }
  const zip3s: Record<string, string[]> = {};
  for (const [state, byZip] of Object.entries(zipWeights)) {
    zip3s[state] = Object.entries(byZip)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([zip3]) => zip3);
  }
  const anchors = Object.keys(weights).sort(
    (a, b) => (weights[b] || 0) - (weights[a] || 0) || a.localeCompare(b),
  );
  return {
    weights,
    zip3s,
    rings: Object.fromEntries(anchors.map((s) => [s, 0])),
    anchors,
  };
}

/**
 * Expand ring-0 demand outward through nearbyStates. Ring r gets weight · 1/(1+r).
 * ZIP3 preference stays on anchors only. Caps at maxRing (default 3).
 */
export function expandDemandRings(
  demand: DemandSummary,
  maxRing = 3,
): DemandSummary {
  const cap = Math.max(0, Math.min(8, Math.floor(maxRing)));
  const weights: Record<string, number> = { ...demand.weights };
  const rings: Record<string, number> = {
    ...(demand.rings ||
      Object.fromEntries(Object.keys(demand.weights).map((s) => [s, 0]))),
  };
  const anchors = demand.anchors || Object.keys(demand.weights);
  for (const anchor of anchors) {
    const base = demand.weights[anchor] || 0;
    if (base <= 0 || !KNOWN_STATES.has(anchor)) continue;
    for (let r = 1; r <= cap; r++) {
      // nearbyStates(n) is inclusive of self; take n = r+1 closest then drop nearer rings.
      const near = Array.from(nearbyStates(anchor, r + 1)).filter(
        (s) => s !== anchor,
      );
      // States whose closest ring to this anchor is exactly r: in nearby(r+1) but not nearby(r).
      const closer =
        r === 1
          ? new Set<string>()
          : new Set(
              Array.from(nearbyStates(anchor, r)).filter((s) => s !== anchor),
            );
      for (const st of near) {
        if (!KNOWN_STATES.has(st) || closer.has(st)) continue;
        const add = base / (1 + r);
        weights[st] = (weights[st] || 0) + add;
        const prev = rings[st];
        if (prev === undefined || r < prev) rings[st] = r;
      }
    }
  }
  return {
    weights,
    zip3s: demand.zip3s,
    rings,
    anchors: [...anchors],
  };
}

/**
 * Want-hit / demand coverage: fraction of ring-0 anchor states that have at least
 * `minRows` fresh-enough active listings from PRIMARY sources.
 * Target ~0.9 once density is healthy.
 */
export function wantHitRatio(input: {
  anchors: readonly string[];
  /** Active listing counts per state from PRIMARY sources only. */
  primaryCounts: Record<string, number>;
  minRows?: number;
}): { wantHit: number; covered: number; demanded: number; gaps: string[] } {
  const minRows = Math.max(1, Math.floor(input.minRows ?? 5));
  const anchors = Array.from(
    new Set(input.anchors.map((s) => s.toUpperCase())),
  ).filter((s) => KNOWN_STATES.has(s));
  if (!anchors.length) return { wantHit: 1, covered: 0, demanded: 0, gaps: [] };
  const gaps: string[] = [];
  let covered = 0;
  for (const st of anchors) {
    if ((input.primaryCounts[st] || 0) >= minRows) covered += 1;
    else gaps.push(st);
  }
  return {
    wantHit: covered / anchors.length,
    covered,
    demanded: anchors.length,
    gaps,
  };
}

/** Want-hit target (Jonah 2026-10-06): ~90% of demanded anchor states well covered by primary sources. */
export const WANT_HIT_TARGET = 0.9;

/**
 * Gap anchors the planner should chase first. Empty once want-hit reaches the target, so a healthy
 * demand map goes back to plain score order (rings + staleness).
 */
export function wantHitGapStates(input: {
  anchors: readonly string[];
  primaryCounts: Record<string, number>;
  minRows?: number;
  target?: number;
}): string[] {
  const hit = wantHitRatio(input);
  const target = input.target ?? WANT_HIT_TARGET;
  return hit.demanded && hit.wantHit < target ? hit.gaps : [];
}

export function isPrimarySource(id: string) {
  return sourceTier(id) === "primary";
}

export function stateScore(input: {
  demand: number;
  hoursSinceSwept: number;
  active: number;
}) {
  const d = Math.max(0, input.demand || 0);
  const h = Number.isFinite(input.hoursSinceSwept)
    ? Math.max(0, input.hoursSinceSwept)
    : Infinity;
  const a = Math.max(0, input.active || 0);
  return 10 * Math.log1p(d) + 2 * Math.min(h / 24, 4) + 1 / (1 + a / 100);
}

export function baselineSlots(
  perSweep: number,
  options: { gapMode?: boolean } = {},
) {
  const k = Math.max(1, Math.floor(perSweep) || 1);
  if (k === 1) return 1;
  // While want-hit is under target, keep a thinner nationwide baseline so more slots chase
  // gap anchors — but never drop below F≥3 when the sweep is large enough (Jonah/Eva 2026-10-07).
  // free-tier safe: same perSweep cap, just redistributed.
  if (options.gapMode) return Math.min(k - 1, Math.max(3, Math.ceil(0.2 * k)));
  return Math.min(k - 1, Math.max(3, Math.ceil(0.4 * k)));
}

/** Metro ZIPs for a state, demanded ZIP3 areas first, then the normal rotation. */
export function demandZipsForState(
  state: string,
  count: number,
  offset: number,
  zip3s: readonly string[] = [],
) {
  const all = STATE_METRO_ZIPS[state] || [];
  const preferred = zip3s.flatMap((p) =>
    all.filter((zip) => zip.startsWith(p)),
  );
  const rotated = metroZipsForState(state, all.length || count, offset);
  const out: string[] = [];
  for (const zip of [...preferred, ...rotated]) {
    if (!out.includes(zip)) out.push(zip);
    if (out.length >= count) break;
  }
  return out;
}

export interface DemandSweepPlan extends SweepPlan {
  /** States picked for demand (subset of `states`, listed first). */
  demandStates: string[];
  /** Want-hit gap anchors in this plan (lead the plan). Empty when want-hit is at target. */
  gapStates?: string[];
}

export function planDemandSweep(
  rotation: StateRotation,
  options: {
    perSweep: number;
    zipsPerState: number;
    counts?: Record<string, number>;
    demand?: DemandSummary;
    /** Expand home/search anchors through nearbyStates. Default 3. Set 0 to disable. */
    maxRing?: number;
    /**
     * Want-hit gap anchors (see wantHitGapStates). While want-hit is under target these take the
     * demand slots first and get extra ZIP depth; the baseline floor is unchanged.
     */
    gaps?: readonly string[];
    states?: readonly string[];
    now?: Date;
  },
): DemandSweepPlan {
  const pool = [...(options.states || SWEEP_STATE_CODES)];
  const k = Math.max(
    1,
    Math.min(pool.length, Math.floor(options.perSweep) || 1),
  );
  const maxRing =
    options.maxRing === undefined ? 3 : Math.max(0, options.maxRing);
  const demand =
    options.demand && maxRing > 0
      ? expandDemandRings(options.demand, maxRing)
      : options.demand;
  const weights = demand?.weights || {};
  const zip3s = demand?.zip3s || {};
  const anchors = new Set(demand?.anchors || []);
  const demanded = pool.filter((s) => (weights[s] || 0) > 0);
  if (!demanded.length) {
    const plain = planSweepStates(rotation, { ...options, perSweep: k });
    return { ...plain, demandStates: [] };
  }

  // Least-recently-swept order (same tie-breaks as the plain rotation).
  const order = planSweepStates(rotation, {
    perSweep: pool.length,
    zipsPerState: 1,
    counts: options.counts,
    states: pool,
  }).states;
  const gapSet = new Set(
    (options.gaps || [])
      .map((s) => String(s || "").toUpperCase())
      .filter((s) => pool.includes(s)),
  );
  const baseline = order.slice(
    0,
    baselineSlots(k, { gapMode: gapSet.size > 0 }),
  );

  const nowMs = (options.now || new Date()).getTime();
  const counts = options.counts || {};
  const hours = (s: string) => {
    const t = Date.parse(rotation.lastSwept[s] || "");
    return Number.isFinite(t) ? (nowMs - t) / 3_600_000 : Infinity;
  };
  const score = (s: string) =>
    stateScore({
      demand: weights[s] || 0,
      hoursSinceSwept: hours(s),
      active: counts[s] ?? 0,
    });
  const demandStates = demanded
    .filter((s) => !baseline.includes(s))
    .sort(
      (a, b) =>
        Number(gapSet.has(b)) - Number(gapSet.has(a)) ||
        score(b) - score(a) ||
        a.localeCompare(b),
    )
    .slice(0, k - baseline.length);
  // A gap state that landed in the baseline still leads the plan (crawl order follows plan order).
  const gapFirst = baseline.filter((s) => gapSet.has(s));
  // Demand-tagged baseline states still count as demand for ZIP depth.
  const demandSet = new Set([
    ...demandStates,
    ...baseline.filter((s) => weights[s] > 0),
  ]);
  const filler = order.filter(
    (s) => !baseline.includes(s) && !demandStates.includes(s),
  );
  const leading = [
    ...demandStates.filter((s) => gapSet.has(s)),
    ...gapFirst,
    ...demandStates.filter((s) => !gapSet.has(s)),
  ];
  const states = [
    ...leading,
    ...baseline.filter((s) => !gapFirst.includes(s)),
    ...filler,
  ].slice(0, k);

  const zipsByState: Record<string, string[]> = {};
  for (const state of states) {
    const offset = (rotation.sweeps[state] || 0) * options.zipsPerState;
    // Extra ZIP depth + zip3 preference only for ring-0 anchors (real user homes/searches).
    const anchor = anchors.has(state);
    // Gap anchors spread one metro wider still, so more dealer markets get seeded.
    const depth = options.zipsPerState + (gapSet.has(state) ? 2 : 1);
    zipsByState[state] =
      anchor || gapSet.has(state)
        ? demandZipsForState(state, depth, offset, zip3s[state])
        : demandSet.has(state)
          ? metroZipsForState(state, options.zipsPerState + 1, offset)
          : metroZipsForState(state, options.zipsPerState, offset);
  }
  return {
    states,
    zipsByState,
    demandStates: states.filter((s) => demandSet.has(s) || gapSet.has(s)),
    gapStates: states.filter((s) => gapSet.has(s)),
  };
}

/* ---------------- source health / backoff ---------------- */

export interface SourceHealth {
  version: 1;
  /** Sweeps started so far. */
  sweeps: number;
  /** Consecutive sweep runs with zero rows (or a failure) per source. */
  zeroStreak: Record<string, number>;
}

export const emptySourceHealth = (): SourceHealth => ({
  version: 1,
  sweeps: 0,
  zeroStreak: {},
});

/**
 * A source that keeps returning nothing backs off: after n ≥ 2 empty runs it only runs every
 * 2^min(n−1, 3) sweeps (2, 4, then 8). One productive run resets it.
 */
export function shouldRunSource(zeroStreak: number, sweepNumber: number) {
  const n = Math.max(0, Math.floor(zeroStreak) || 0);
  if (n < 2) return true;
  return sweepNumber % 2 ** Math.min(n - 1, 3) === 0;
}

/** Sources for the next sweep. Never returns an empty list when sources exist. */
export function sourcesForSweep(
  sources: readonly string[],
  health: SourceHealth,
) {
  const sweepNumber = health.sweeps + 1;
  const kept = sources.filter((s) =>
    shouldRunSource(health.zeroStreak[s] || 0, sweepNumber),
  );
  const list = kept.length ? kept : [...sources];
  return orderSourcesByTier(list);
}

export function startSweep(health: SourceHealth): SourceHealth {
  return {
    ...health,
    zeroStreak: { ...health.zeroStreak },
    sweeps: health.sweeps + 1,
  };
}

export function recordSourceYield(
  health: SourceHealth,
  source: string,
  rows: number,
  ok = true,
): SourceHealth {
  const zeroStreak = { ...health.zeroStreak };
  zeroStreak[source] = ok && rows > 0 ? 0 : (zeroStreak[source] || 0) + 1;
  return { ...health, zeroStreak };
}

export function sourceHealthPath(
  dir: string = process.env.LOCAL_CACHE_PATH || "/app/cache",
) {
  return path.resolve(dir, "source-health.json");
}

export async function loadSourceHealth(
  file = sourceHealthPath(),
): Promise<SourceHealth> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as SourceHealth;
    if (parsed?.version !== 1) return emptySourceHealth();
    return {
      version: 1,
      sweeps: Math.max(0, Number(parsed.sweeps) || 0),
      zeroStreak:
        parsed.zeroStreak && typeof parsed.zeroStreak === "object"
          ? parsed.zeroStreak
          : {},
    };
  } catch {
    return emptySourceHealth();
  }
}

export async function saveSourceHealth(
  health: SourceHealth,
  file = sourceHealthPath(),
) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(health), { mode: 0o600 });
  await rename(tmp, file);
}
