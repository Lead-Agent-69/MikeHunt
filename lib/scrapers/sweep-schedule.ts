import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { TOS_RESTRICTED_SOURCES } from "./terms-restricted";

/**
 * Broad inventory sweeps for the Docker scraper.
 *
 * Queue mode only serves buyer-scoped jobs, so with no buyer clicks nothing refreshes and every
 * state goes stale. Hybrid mode serves buyer jobs first and, while the queue is idle, walks a sweep
 * one source at a time. A buyer job waits at most one source, never a whole sweep.
 */
export type ScraperExecutionMode = "direct" | "queue" | "hybrid";

export function resolveScraperExecutionMode(
  raw: string | undefined = process.env.SCRAPER_EXECUTION_MODE,
): ScraperExecutionMode {
  const mode = String(raw || "")
    .trim()
    .toLowerCase();
  if (mode === "queue") return "queue";
  if (mode === "hybrid") return "hybrid";
  return "direct";
}

/**
 * Free, unauthenticated sources a broad sweep could walk, in order. The default sweep drops
 * TOS_RESTRICTED_SOURCES (below). The order is kept so that an explicit opt-in still runs in this order. Retail sources with a VIN and a
 * listing location go first because the daily insert budget is spent in this order. Auction and
 * surplus feeds take what is left.
 */
/**
 * Scheduler tiers (Jonah 2026-10-06). Among sources already allowed by resolveSweepSources
 * (terms-safe defaults, plus any SCRAPE_SOURCES opt-in), run PRIMARY before SECONDARY so
 * idle ticks fill retail/private density for demanded rings before auction/surplus.
 *
 * Restricted aggregators (craigslist, carvana, autotempest, cars_com, …) stay off unless the
 * operator opted in — listing them here only orders them when present.
 */
export type SweepSourceTier = "primary" | "secondary";

export const SWEEP_SOURCE_TIER: Record<string, SweepSourceTier> = {
  // PRIMARY — aggregators / retail / private inventory
  craigslist: "primary",
  curated_dealers: "primary",
  independent_dealer: "primary",
  carvana: "primary",
  autotempest: "primary",
  cars_com: "primary",
  autotrader: "primary",
  ebay_motors: "primary",
  cargurus: "primary",
  // SECONDARY — auctions / surplus / sold comps
  gsa_auctions: "secondary",
  publicsurplus: "secondary",
  govdeals: "secondary",
  allsurplus: "secondary",
  ebay_sold: "secondary",
  copart: "secondary",
  municibid: "secondary",
};

/**
 * PRIMARY-tier values of the `deals.source` enum (deal_source). Scraper ids like `curated_dealers`
 * or `autotempest` are not enum values (curated rows land as `independent_dealer`), so DB filters
 * must use this list, never SWEEP_SOURCE_TIER keys.
 */
export const PRIMARY_DEAL_SOURCES = [
  "independent_dealer",
  "craigslist",
  "carvana",
  "cars_com",
  "autotrader",
  "ebay_motors",
  "cargurus",
] as const;

export function sourceTier(id: string): SweepSourceTier {
  return (
    SWEEP_SOURCE_TIER[
      String(id || "")
        .trim()
        .toLowerCase()
    ] || "secondary"
  );
}

/** Stable primary-then-secondary order. Unknown ids sort as secondary, preserving input order. */
export function orderSourcesByTier(sources: readonly string[]): string[] {
  const primary: string[] = [];
  const secondary: string[] = [];
  for (const id of sources) {
    (sourceTier(id) === "primary" ? primary : secondary).push(id);
  }
  return [...primary, ...secondary];
}

export const DEFAULT_SWEEP_SOURCES = [
  "cars_com",
  "autotrader",
  "autotempest",
  "carvana",
  "craigslist",
  "ebay_motors",
  "curated_dealers",
  "ebay_sold",
  "cargurus",
  "independent_dealer",
  "publicsurplus",
  "govdeals",
  "gsa_auctions",
  "copart",
] as const;

export { TOS_RESTRICTED_SOURCES } from "./terms-restricted";

export function resolveSweepSources(
  raw: string | undefined = process.env.SCRAPE_SOURCES,
): string[] {
  const explicit = String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const list = explicit.length
    ? Array.from(new Set(explicit))
    : DEFAULT_SWEEP_SOURCES.filter((id) => !TOS_RESTRICTED_SOURCES[id]);
  return orderSourcesByTier(list);
}

/**
 * May this process make automated requests to `sourceId`? Unrestricted sources: yes. A source in
 * TOS_RESTRICTED_SOURCES only when the operator named it in SCRAPE_SOURCES. Public preview routes
 * use this so an anonymous request can never trigger a fetch the default sweep would refuse.
 */
export function isAutomationAllowedSource(
  sourceId: string,
  raw: string | undefined = process.env.SCRAPE_SOURCES,
): boolean {
  const id = String(sourceId || "")
    .trim()
    .toLowerCase();
  if (!TOS_RESTRICTED_SOURCES[id]) return true;
  return String(raw || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .includes(id);
}

/** Restricted sources the operator opted into through SCRAPE_SOURCES. */
export function optedInRestrictedSources(sources: readonly string[]) {
  return sources.filter((id) => TOS_RESTRICTED_SOURCES[id]);
}

/**
 * Hours between the end of one sweep and the start of the next. Default 4h, floor 1h.
 * When `hasRing0Gaps` and SWEEP_GAP_INTERVAL_HOURS is set (>0), use the shorter of the two
 * (gap floor 0.5h) so Zeus fills want-hit gaps faster without changing the default cadence.
 */
export function resolveSweepIntervalMs(
  raw: string | undefined = process.env.SWEEP_INTERVAL_HOURS,
  options: { hasRing0Gaps?: boolean } = {},
): number {
  const hours = Number(raw);
  const safe = Number.isFinite(hours) && hours > 0 ? hours : 4;
  const normalMs = Math.max(1, safe) * 60 * 60 * 1000;
  if (!options.hasRing0Gaps) return normalMs;
  const gapHours = Number(process.env.SWEEP_GAP_INTERVAL_HOURS);
  if (!Number.isFinite(gapHours) || gapHours <= 0) return normalMs;
  const gapMs = Math.max(0.5, gapHours) * 60 * 60 * 1000;
  return Math.min(normalMs, gapMs);
}

export interface SweepState {
  version: 1;
  /** Set while a sweep is in progress. */
  startedAt?: string;
  sources: string[];
  /** Index of the next source to run in `sources`. */
  index: number;
  /** States and search ZIPs this sweep covers. Fixed at sweep start so a resume keeps them. */
  plan?: { states: string[]; zipsByState: Record<string, string[]> };
  lastCompletedAt?: string;
}

export const emptySweepState = (): SweepState => ({
  version: 1,
  sources: [],
  index: 0,
});

export type SweepStep =
  | { kind: "idle"; nextAt: string }
  | { kind: "run"; source: string; state: SweepState };

/**
 * Decide what an idle queue tick should do. Pure: callers persist the returned state.
 * A sweep in progress resumes where it stopped (container restarts do not restart it).
 */
export function nextSweepStep(
  prior: SweepState,
  sources: string[],
  intervalMs: number,
  now = new Date(),
): SweepStep {
  const inProgress =
    Boolean(prior.startedAt) &&
    prior.sources.length > 0 &&
    prior.index < prior.sources.length;
  if (inProgress) {
    return {
      kind: "run",
      source: prior.sources[prior.index],
      state: prior,
    };
  }
  const last = prior.lastCompletedAt ? Date.parse(prior.lastCompletedAt) : NaN;
  const dueAt = Number.isFinite(last) ? last + intervalMs : 0;
  if (now.getTime() < dueAt || !sources.length) {
    return {
      kind: "idle",
      nextAt: new Date(Math.max(dueAt, now.getTime())).toISOString(),
    };
  }
  const state: SweepState = {
    version: 1,
    startedAt: now.toISOString(),
    sources: [...sources],
    index: 0,
    lastCompletedAt: prior.lastCompletedAt,
  };
  return { kind: "run", source: state.sources[0], state };
}

/** Mark the current source done. Closes the sweep after the last source. */
export function advanceSweep(state: SweepState, now = new Date()): SweepState {
  const index = state.index + 1;
  if (index >= state.sources.length) {
    return {
      version: 1,
      sources: [],
      index: 0,
      lastCompletedAt: now.toISOString(),
    };
  }
  return { ...state, index };
}

/** Exponential backoff for queue-claim failures: 5s, 10s, 20s … capped at 5 minutes. */
export function claimBackoffMs(consecutiveFailures: number, baseMs = 5_000) {
  const n = Math.max(0, Math.min(10, consecutiveFailures - 1));
  return Math.min(5 * 60 * 1000, baseMs * 2 ** n);
}

export function sweepStatePath(
  dir: string = process.env.LOCAL_CACHE_PATH || "/app/cache",
) {
  return path.resolve(dir, "sweep-state.json");
}

export async function loadSweepState(file = sweepStatePath()) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as SweepState;
    if (parsed?.version !== 1 || !Array.isArray(parsed.sources))
      return emptySweepState();
    return {
      ...parsed,
      index: Math.max(0, Number(parsed.index) || 0),
    } as SweepState;
  } catch {
    return emptySweepState();
  }
}

export async function saveSweepState(
  state: SweepState,
  file = sweepStatePath(),
) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
  await rename(tmp, file);
}
