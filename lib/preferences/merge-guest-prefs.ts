/**
 * On first sign-in, copy mh_guest_prefs cookie locations into user_preferences
 * so scrape_demand and Discover see the state the guest already picked.
 * Never overwrites an existing homeLocation. Best-effort.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeLocationPatch } from "@/lib/preferences/locations";
import { locationPatchTouchesDemand } from "@/lib/preferences/kick-location-demand";

import { savePreferencesAtomically } from "./atomic-save";
import {
  clearLocationDemand,
  queueConfirmedLocationDemand,
} from "./confirmed-location-demand";

export const GUEST_PREFS_COOKIE = "mh_guest_prefs";

export function parseGuestPrefsCookie(
  raw: string | undefined | null,
): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Location-only keys we promote from the guest cookie. */
function locationSlice(
  guest: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of [
    "homeLocation",
    "searchLocations",
    "carsState",
    "carsStates",
  ]) {
    if (k in guest) out[k] = guest[k];
  }
  return out;
}

export async function mergeGuestPrefsOnSignup(input: {
  supabase: SupabaseClient;
  userId: string;
  guestCookieRaw?: string | null;
}): Promise<{ merged: boolean; kicked: boolean }> {
  const guest = locationSlice(parseGuestPrefsCookie(input.guestCookieRaw));
  if (!Object.keys(guest).length) return { merged: false, kicked: false };

  const located = sanitizeLocationPatch(guest);
  if ("error" in located) return { merged: false, kicked: false };
  const patch = located.patch;
  if (!locationPatchTouchesDemand(patch) && !("homeLocation" in patch)) {
    return { merged: false, kicked: false };
  }

  try {
    const affectsDemand = locationPatchTouchesDemand(patch);
    const saved = await savePreferencesAtomically(
      input.supabase,
      input.userId,
      (prev) => {
        // Recheck on every conflict: a concurrent real home always wins over this guest cookie.
        if (prev.homeLocation && typeof prev.homeLocation === "object") {
          const st = (prev.homeLocation as { state?: string }).state;
          if (st && /^[A-Z]{2}$/i.test(st)) return null;
        }
        const next = { ...prev, ...patch };
        return affectsDemand ? clearLocationDemand(next) : next;
      },
    );
    if (!saved.changed) return { merged: false, kicked: false };
    const queued = affectsDemand
      ? await queueConfirmedLocationDemand({
          supabase: input.supabase,
          userId: input.userId,
          prefs: saved.prefs,
        })
      : null;
    return { merged: true, kicked: queued?.locationDemand?.queued === true };
  } catch (err) {
    console.warn(
      "[auth] guest prefs merge error:",
      err instanceof Error ? err.message : err,
    );
    return { merged: false, kicked: false };
  }
}
