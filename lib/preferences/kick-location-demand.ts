/**
 * When a signed-in user saves home / search locations, bump Zeus priority for those states.
 *
 * scrape_demand() already reads prefs on the next idle sweep, but that can wait hours
 * (SWEEP_INTERVAL_HOURS, default 4). Buyer-scoped scrape_jobs always run first in hybrid mode,
 * so enqueueing a terms-safe job makes inventory for the new state show up much sooner.
 *
 * Never fails the prefs save: enqueue is best-effort. Guests get the prefs cookie only (no queue).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  effectiveHome,
  effectiveSearchLocations,
  type HomeLocation,
  type SearchLocation,
} from "@/lib/preferences/locations";
import { enqueueScopedScrapeJob } from "@/lib/scrapers/job-queue";
import {
  isAutomationAllowedSource,
  resolveSweepSources,
} from "@/lib/scrapers/sweep-schedule";

export const LOCATION_DEMAND_KEYS = [
  "homeLocation",
  "searchLocations",
  "carsState",
  "carsStates",
] as const;

export type LocationDemandKick = {
  states: string[];
  queued: boolean;
  deduplicated: boolean;
  jobId: string | null;
  sourceIds: string[];
  /** ISO time stamped into prefs so Discover can say "scanning…" honestly. */
  demandedAt: string;
};

type PrefsLike = {
  homeLocation?: unknown;
  searchLocations?: unknown;
  carsState?: unknown;
  carsStates?: unknown;
  buyerScope?: { state?: unknown } | null;
  locationDemandAt?: unknown;
  locationDemandStates?: unknown;
};

/** True when the PUT patch touches location keys that feed scrape_demand. */
export function locationPatchTouchesDemand(
  patch: Record<string, unknown>,
): boolean {
  return LOCATION_DEMAND_KEYS.some((k) => k in patch);
}

/** States scrape_demand would weight from these prefs (home + search, 2-letter only). */
export function demandStatesFromPrefs(
  prefs: PrefsLike | null | undefined,
): string[] {
  const home = effectiveHome(prefs)?.state;
  const search = effectiveSearchLocations(prefs).map((l) => l.state);
  const out = new Set<string>();
  if (home && /^[A-Z]{2}$/.test(home)) out.add(home);
  for (const s of search) {
    if (s && /^[A-Z]{2}$/.test(s)) out.add(s);
  }
  return Array.from(out).sort();
}

/**
 * Did location demand states change? Used so a no-op re-save of the same home state
 * still refreshes the warming stamp (user expects a scan) but we can skip when the
 * patch did not touch location keys at all.
 */
export function locationDemandStatesChanged(
  before: PrefsLike | null | undefined,
  after: PrefsLike | null | undefined,
): boolean {
  const a = demandStatesFromPrefs(before).join(",");
  const b = demandStatesFromPrefs(after).join(",");
  return a !== b;
}

/** Terms-safe Zeus sweep sources only — never opt into TOS_RESTRICTED without SCRAPE_SOURCES. */
export function locationDemandSourceIds(): string[] {
  return resolveSweepSources().filter((id) => isAutomationAllowedSource(id));
}

/**
 * Stamp + optional queue. Always returns a kick result when states are non-empty so the
 * caller can merge locationDemandAt into prefs for the UI even if the queue is down.
 */
export async function kickLocationDemand(input: {
  supabase: SupabaseClient;
  userId: string;
  prefs: PrefsLike;
  now?: Date;
}): Promise<LocationDemandKick | null> {
  const states = demandStatesFromPrefs(input.prefs);
  if (!states.length) return null;

  const demandedAt = (input.now ?? new Date()).toISOString();
  const sourceIds = locationDemandSourceIds();
  const result: LocationDemandKick = {
    states,
    queued: false,
    deduplicated: false,
    jobId: null,
    sourceIds,
    demandedAt,
  };

  if (!sourceIds.length) return result;

  try {
    const queued = await enqueueScopedScrapeJob(input.supabase, {
      requestedBy: input.userId,
      sourceIds,
      scope: {
        lane: "all",
        state: states[0],
        states: states.length > 1 ? states : undefined,
      },
      orchestrator: "priority",
      concurrency: 1,
      dryRun: false,
    });
    result.queued = true;
    result.deduplicated = queued.deduplicated;
    result.jobId = queued.job.id;
  } catch (err) {
    // Prefs already saved; Zeus will still see demand on the next sweep via scrape_demand().
    console.warn(
      "[preferences] location demand enqueue failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return result;
}

/** Prefs keys the UI reads for "scanning your state…" honesty. */
export function locationDemandPrefsStamp(kick: LocationDemandKick): {
  locationDemandAt: string;
  locationDemandStates: string[];
} {
  return {
    locationDemandAt: kick.demandedAt,
    locationDemandStates: kick.states,
  };
}

/** Warming window for Discover copy (2h — one hybrid sweep cycle + margin). */
export const LOCATION_DEMAND_WARMING_MS = 2 * 60 * 60 * 1000;

export function isLocationDemandWarming(
  prefs: PrefsLike | null | undefined,
  nowMs = Date.now(),
): {
  scanning: boolean;
  states: string[];
  demandedAt: string | null;
  ageMs: number | null;
} {
  const rawAt = prefs?.locationDemandAt;
  const at =
    typeof rawAt === "string" && rawAt.trim() ? Date.parse(rawAt) : NaN;
  const states = Array.isArray(prefs?.locationDemandStates)
    ? (prefs!.locationDemandStates as unknown[])
        .map((s) =>
          String(s || "")
            .trim()
            .toUpperCase(),
        )
        .filter((s) => /^[A-Z]{2}$/.test(s))
    : demandStatesFromPrefs(prefs);

  if (!Number.isFinite(at)) {
    return { scanning: false, states, demandedAt: null, ageMs: null };
  }
  const ageMs = nowMs - at;
  const scanning =
    ageMs >= 0 && ageMs < LOCATION_DEMAND_WARMING_MS && states.length > 0;
  return {
    scanning,
    states,
    demandedAt: new Date(at).toISOString(),
    ageMs,
  };
}

/** Re-export types used by callers / tests. */
export type { HomeLocation, SearchLocation };
