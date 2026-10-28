import type { SupabaseClient } from "@supabase/supabase-js";
import {
  stampConfirmedPreferences,
  type PreferenceObject,
} from "./atomic-save";
import {
  demandStatesFromPrefs,
  kickLocationDemand,
  locationDemandPrefsStamp,
} from "./kick-location-demand";

/** Persist this with the user's location before attempting to queue anything. */
export function clearLocationDemand(prefs: PreferenceObject): PreferenceObject {
  return {
    ...prefs,
    locationDemandAt: null,
    locationDemandStates: demandStatesFromPrefs(prefs),
  };
}

/** Call only after persistence was confirmed; a queue failure cannot undo that save. */
export async function queueConfirmedLocationDemand(input: {
  supabase: SupabaseClient;
  userId: string;
  prefs: PreferenceObject;
}) {
  let kick;
  try {
    kick = await kickLocationDemand(input);
  } catch {
    kick = null;
  }
  if (!kick) return { prefs: input.prefs, locationDemand: null };
  const prefs = await stampConfirmedPreferences(
    input.supabase,
    input.userId,
    input.prefs,
    locationDemandPrefsStamp(kick),
  );
  return {
    prefs,
    locationDemand: {
      states: kick.states,
      queued: kick.queued,
      deduplicated: kick.deduplicated,
      jobId: kick.jobId,
    },
  };
}
