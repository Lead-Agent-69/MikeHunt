/**
 * Bidirectional home mirror between user_profiles.home_state and prefs.homeLocation.
 * Profile → prefs: scrape_demand() only reads prefs.
 * Prefs → profile: Arbitrage / Dealer Defaults still read home_state.
 * Best-effort: never fails the caller write.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeHomeLocation } from "@/lib/preferences/locations";
import {
  kickLocationDemand,
  locationDemandPrefsStamp,
  locationPatchTouchesDemand,
} from "@/lib/preferences/kick-location-demand";

function cleanState(value: unknown): string | null {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== "NA" && code !== "XX"
    ? code
    : null;
}

/**
 * If home_state is a real US state, upsert prefs.homeLocation.state (keep city/zip/radius)
 * and kick Zeus demand for that state.
 */
export async function syncProfileHomeStateToPrefs(input: {
  supabase: SupabaseClient;
  userId: string;
  homeState: unknown;
  homeZip?: unknown;
}): Promise<{ synced: boolean; kicked: boolean }> {
  const state = cleanState(input.homeState);
  if (!state) return { synced: false, kicked: false };

  try {
    const { data: existing } = await input.supabase
      .from("user_preferences")
      .select("prefs")
      .eq("user_id", input.userId)
      .maybeSingle();
    const prev = {
      ...((existing?.prefs as Record<string, unknown>) || {}),
    };
    const priorHome =
      prev.homeLocation && typeof prev.homeLocation === "object"
        ? (prev.homeLocation as Record<string, unknown>)
        : {};
    const zip =
      typeof input.homeZip === "string" && /^\d{5}$/.test(input.homeZip.trim())
        ? input.homeZip.trim()
        : typeof priorHome.zip === "string"
          ? priorHome.zip
          : undefined;
    const home = sanitizeHomeLocation({
      ...priorHome,
      state,
      ...(zip ? { zip } : {}),
    });
    if (!home) return { synced: false, kicked: false };

    const patch = {
      homeLocation: home,
      carsState: state, // legacy mirror
    };
    // Re-sanitize through the same path prefs PUT uses.
    if (!locationPatchTouchesDemand(patch)) {
      return { synced: false, kicked: false };
    }

    let merged: Record<string, unknown> = { ...prev, ...patch };
    let kicked = false;
    const kick = await kickLocationDemand({
      supabase: input.supabase,
      userId: input.userId,
      prefs: merged,
    });
    if (kick) {
      merged = { ...merged, ...locationDemandPrefsStamp(kick) };
      kicked = Boolean(kick.queued || kick.demandedAt);
    }

    const { error } = await input.supabase.from("user_preferences").upsert(
      {
        user_id: input.userId,
        prefs: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.warn("[profile] prefs homeLocation sync failed:", error.message);
      return { synced: false, kicked: false };
    }
    return { synced: true, kicked };
  } catch (err) {
    console.warn(
      "[profile] prefs homeLocation sync error:",
      err instanceof Error ? err.message : err,
    );
    return { synced: false, kicked: false };
  }
}

/**
 * Mirror prefs.homeLocation into user_profiles.home_state so readers that still use the
 * legacy column (Arbitrage until discoverHomeState, Settings Dealer Defaults) stay honest.
 * Pass null homeLocation to clear the column. Best-effort.
 */
export async function syncPrefsHomeLocationToProfile(input: {
  supabase: SupabaseClient;
  userId: string;
  /** Sanitized HomeLocation, or null when the user cleared home. */
  homeLocation: unknown;
}): Promise<boolean> {
  const home = sanitizeHomeLocation(input.homeLocation);
  const state = home?.state ?? null;
  try {
    const { error } = await input.supabase.from("user_profiles").upsert(
      {
        id: input.userId,
        home_state: state,
        home_zip: home?.zip ?? null,
        home_lat: null,
        home_lng: null,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn(
        "[preferences] profile home_state sync failed:",
        error.message,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      "[preferences] profile home_state sync error:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
