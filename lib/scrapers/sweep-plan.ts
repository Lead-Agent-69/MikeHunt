import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { SWEEP_STATE_CODES, metroZipsForState } from "@/lib/geo/metro-zips";

/**
 * Which states a broad sweep searches. Radius sources (cars.com, AutoTrader, AutoTempest,
 * Craigslist) read this to pick search centers. It steers seeds only. It never filters rows:
 * a listing just over the line keeps the state printed on the listing.
 */
export interface SweepPlan {
  states: string[];
  /** Search-center ZIPs per planned state, rotated across sweeps. */
  zipsByState: Record<string, string[]>;
}

const storage = new AsyncLocalStorage<SweepPlan>();

export function withSweepPlan<T>(
  plan: SweepPlan | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (!plan || !plan.states.length) return run();
  return storage.run(plan, run);
}

export function getSweepPlan(): SweepPlan | undefined {
  return storage.getStore();
}

/** Planned search ZIPs in state order, deduped. */
export function sweepPlanZips(
  plan: SweepPlan | undefined,
  perState = Infinity,
) {
  if (!plan) return [];
  const out: string[] = [];
  for (const state of plan.states) {
    for (const zip of (plan.zipsByState[state] || []).slice(0, perState)) {
      if (!out.includes(zip)) out.push(zip);
    }
  }
  return out;
}

export interface StateRotation {
  version: 1;
  /** ISO time each state was last planned into a sweep. */
  lastSwept: Record<string, string>;
  /** How many sweeps each state has been in. Drives metro ZIP rotation. */
  sweeps: Record<string, number>;
}

export const emptyRotation = (): StateRotation => ({
  version: 1,
  lastSwept: {},
  sweeps: {},
});

/**
 * Least-recently-swept first, so no state starves: with N states and K per sweep, every state is
 * planned at least once every ceil(N/K) sweeps. Ties (e.g. never swept) go to the state with the
 * fewest active listings, then alphabetical so the plan is deterministic.
 */
export function planSweepStates(
  rotation: StateRotation,
  options: {
    perSweep: number;
    zipsPerState: number;
    counts?: Record<string, number>;
    states?: readonly string[];
  },
): SweepPlan {
  const states = [...(options.states || SWEEP_STATE_CODES)];
  const counts = options.counts || {};
  const lastMs = (s: string) => {
    const t = Date.parse(rotation.lastSwept[s] || "");
    return Number.isFinite(t) ? t : -Infinity;
  };
  states.sort(
    (a, b) =>
      lastMs(a) - lastMs(b) ||
      (counts[a] ?? 0) - (counts[b] ?? 0) ||
      a.localeCompare(b),
  );
  const picked = states.slice(
    0,
    Math.max(1, Math.min(states.length, Math.floor(options.perSweep) || 1)),
  );
  const zipsByState: Record<string, string[]> = {};
  for (const state of picked) {
    const offset = (rotation.sweeps[state] || 0) * options.zipsPerState;
    zipsByState[state] = metroZipsForState(state, options.zipsPerState, offset);
  }
  return { states: picked, zipsByState };
}

export function recordSweepPlan(
  rotation: StateRotation,
  plan: SweepPlan,
  now = new Date(),
): StateRotation {
  const next: StateRotation = {
    version: 1,
    lastSwept: { ...rotation.lastSwept },
    sweeps: { ...rotation.sweeps },
  };
  for (const state of plan.states) {
    next.lastSwept[state] = now.toISOString();
    next.sweeps[state] = (next.sweeps[state] || 0) + 1;
  }
  return next;
}

export function resolveSweepStatesPerRun(
  raw: string | undefined = process.env.SWEEP_STATES_PER_RUN,
) {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0
    ? Math.min(n, SWEEP_STATE_CODES.length)
    : 10;
}

export function resolveSweepZipsPerState(
  raw: string | undefined = process.env.SWEEP_ZIPS_PER_STATE,
) {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 2;
}

export function rotationPath(
  dir: string = process.env.LOCAL_CACHE_PATH || "/app/cache",
) {
  return path.resolve(dir, "state-rotation.json");
}

export async function loadRotation(file = rotationPath()) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as StateRotation;
    if (parsed?.version !== 1 || typeof parsed.lastSwept !== "object")
      return emptyRotation();
    return {
      version: 1,
      lastSwept: parsed.lastSwept || {},
      sweeps: parsed.sweeps || {},
    } as StateRotation;
  } catch {
    return emptyRotation();
  }
}

export async function saveRotation(
  rotation: StateRotation,
  file = rotationPath(),
) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(rotation), { mode: 0o600 });
  await rename(tmp, file);
}
