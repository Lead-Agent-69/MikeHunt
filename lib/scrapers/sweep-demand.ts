import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  STATE_METRO_ZIPS,
  SWEEP_STATE_CODES,
  metroZipsForState,
} from "@/lib/geo/metro-zips";
import {
  type StateRotation,
  type SweepPlan,
  planSweepStates,
} from "./sweep-plan";

/**
 * Demand-weighted sweep planning. Deterministic heuristics only (no LLM in the hot path).
 * See docs/USER-DRIVEN-SCRAPING.md §5.
 *
 *   score(state) = 10·ln(1 + D) + 2·min(H/24, 4) + 1/(1 + A/100)
 *     D = demand weight from scrape_demand (home 3·r, search 2·r, recent 1·e^(−age/3))
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
  /** Total demand weight per state. */
  weights: Record<string, number>;
  /** Demanded 3-digit ZIP prefixes per state, heaviest first. */
  zip3s: Record<string, string[]>;
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
  return { weights, zip3s };
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

export function baselineSlots(perSweep: number) {
  const k = Math.max(1, Math.floor(perSweep) || 1);
  if (k === 1) return 1;
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
}

export function planDemandSweep(
  rotation: StateRotation,
  options: {
    perSweep: number;
    zipsPerState: number;
    counts?: Record<string, number>;
    demand?: DemandSummary;
    states?: readonly string[];
    now?: Date;
  },
): DemandSweepPlan {
  const pool = [...(options.states || SWEEP_STATE_CODES)];
  const k = Math.max(
    1,
    Math.min(pool.length, Math.floor(options.perSweep) || 1),
  );
  const weights = options.demand?.weights || {};
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
  const baseline = order.slice(0, baselineSlots(k));

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
    .sort((a, b) => score(b) - score(a) || a.localeCompare(b))
    .slice(0, k - baseline.length);
  // Demand-tagged baseline states still count as demand for ZIP depth.
  const demandSet = new Set([
    ...demandStates,
    ...baseline.filter((s) => weights[s] > 0),
  ]);
  const filler = order.filter(
    (s) => !baseline.includes(s) && !demandStates.includes(s),
  );
  const states = [...demandStates, ...baseline, ...filler].slice(0, k);

  const zipsByState: Record<string, string[]> = {};
  for (const state of states) {
    const offset = (rotation.sweeps[state] || 0) * options.zipsPerState;
    zipsByState[state] = demandSet.has(state)
      ? demandZipsForState(
          state,
          options.zipsPerState + 1,
          offset,
          options.demand?.zip3s[state],
        )
      : metroZipsForState(state, options.zipsPerState, offset);
  }
  return {
    states,
    zipsByState,
    demandStates: states.filter((s) => demandSet.has(s)),
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
  return kept.length ? kept : [...sources];
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
