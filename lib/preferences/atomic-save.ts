import type { SupabaseClient } from "@supabase/supabase-js";

export type PreferenceObject = Record<string, unknown>;
const isObject = (value: unknown): value is PreferenceObject =>
  !!value && typeof value === "object" && !Array.isArray(value);

export class PreferencePersistenceError extends Error {
  constructor(public readonly stage: "read" | "write" | "conflict") {
    super("Your preferences could not be confirmed. Try saving again.");
  }
}

/** The owner must come from verified server authentication, never a request body. */
async function compareAndSet(
  supabase: SupabaseClient,
  userId: string,
  expected: PreferenceObject | null,
  next: PreferenceObject,
  signal = AbortSignal.timeout(10_000),
): Promise<PreferenceObject | null> {
  const { data, error } = await supabase
    .rpc("compare_and_set_user_preferences", {
      p_user_id: userId,
      p_expected_prefs: expected,
      p_next_prefs: next,
    })
    .abortSignal(signal);
  if (error || !Array.isArray(data) || data.length > 1)
    throw new PreferencePersistenceError("write");
  if (data.length === 0) return null;
  if (data[0]?.user_id !== userId || !isObject(data[0]?.prefs))
    throw new PreferencePersistenceError("write");
  return data[0].prefs;
}

/** Reapply only the original patch on conflict. Transforms must have no side effects. */
export async function savePreferencesAtomically(
  supabase: SupabaseClient,
  userId: string,
  transform: (existing: PreferenceObject) => PreferenceObject | null,
): Promise<{ prefs: PreferenceObject; changed: boolean }> {
  if (!userId) throw new PreferencePersistenceError("read");
  const deadline = AbortSignal.timeout(15_000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("user_id,prefs")
      .eq("user_id", userId)
      .abortSignal(deadline)
      .maybeSingle();
    if (error || (data && (data.user_id !== userId || !isObject(data.prefs))))
      throw new PreferencePersistenceError("read");
    const expected = data ? (data.prefs as PreferenceObject) : null;
    const next = transform(structuredClone(expected || {}));
    if (next === null) return { prefs: expected || {}, changed: false };
    if (!isObject(next)) throw new PreferencePersistenceError("write");
    const saved = await compareAndSet(
      supabase,
      userId,
      expected,
      next,
      deadline,
    );
    if (saved) return { prefs: saved, changed: true };
  }
  throw new PreferencePersistenceError("conflict");
}

/** A slow queue response must never stamp over newer preferences or a newer location. */
export async function stampConfirmedPreferences(
  supabase: SupabaseClient,
  userId: string,
  confirmed: PreferenceObject,
  stamp: PreferenceObject,
): Promise<PreferenceObject> {
  try {
    return (
      (await compareAndSet(supabase, userId, confirmed, {
        ...confirmed,
        ...stamp,
      })) || confirmed
    );
  } catch {
    // The preferences are already committed; queue bookkeeping cannot turn that into a failed save.
    return confirmed;
  }
}
