/**
 * Mirror user_profiles.home_state into prefs.homeLocation so scrape_demand()
 * (which only reads prefs) sees Settings / onboarding profile saves.
 * Best-effort: never fails the profile write.
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
