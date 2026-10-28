import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PreferencePersistenceError,
  savePreferencesAtomically,
  stampConfirmedPreferences,
} from "./atomic-save";
import { mergePreferencePatch } from "./merge-patch";

function fixture(reads: any[], writes: any[]) {
  const read = vi.fn(async () => reads.shift());
  const rpc = vi.fn(
    (
      _name: string,
      _input: {
        p_expected_prefs: object | null;
        p_next_prefs: object;
        p_user_id: string;
      },
    ) => ({ abortSignal: async () => writes.shift() }),
  );
  const from = vi.fn(() => ({
    select: () => ({
      eq: (_key: string, owner: string) => {
        expect(owner).toBe("owner");
        return { abortSignal: () => ({ maybeSingle: read }) };
      },
    }),
  }));
  return {
    read,
    rpc,
    from,
    client: { from, rpc } as unknown as SupabaseClient,
  };
}
const row = (prefs: object) => ({
  data: { user_id: "owner", prefs },
  error: null,
});
const saved = (prefs: object) => ({
  data: [{ user_id: "owner", prefs }],
  error: null,
});

describe("atomic preference persistence", () => {
  it("reapplies the original nested patch against the latest row after a conflict", async () => {
    const latest = {
      theme: "dark",
      buyerScope: { make: "Honda" },
      privateNotes: ["keep"],
    };
    const final = { ...latest, buyerScope: { make: "Honda", model: "Accord" } };
    const f = fixture(
      [row({ theme: "light" }), row(latest)],
      [{ data: [], error: null }, saved(final)],
    );
    expect(
      (
        await savePreferencesAtomically(f.client, "owner", (prefs) =>
          mergePreferencePatch(prefs, { buyerScope: { model: "Accord" } }),
        )
      ).prefs,
    ).toEqual(final);
    expect(f.rpc.mock.calls[1]).toEqual([
      "compare_and_set_user_preferences",
      { p_user_id: "owner", p_expected_prefs: latest, p_next_prefs: final },
    ]);
  });
  it("uses a missing-row expectation for first saves", async () => {
    const f = fixture(
      [{ data: null, error: null }],
      [saved({ theme: "dark" })],
    );
    await savePreferencesAtomically(f.client, "owner", () => ({
      theme: "dark",
    }));
    expect(f.rpc.mock.calls[0][1].p_expected_prefs).toBeNull();
  });
  it("bounds conflicts and leaves the draft retryable", async () => {
    const f = fixture(
      [row({}), row({}), row({})],
      Array.from({ length: 3 }, () => ({ data: [], error: null })),
    );
    await expect(
      savePreferencesAtomically(f.client, "owner", (p) => ({
        ...p,
        theme: "dark",
      })),
    ).rejects.toMatchObject({ stage: "conflict" });
    expect(f.rpc).toHaveBeenCalledTimes(3);
  });
  it.each([
    { data: null, error: {} },
    { data: { user_id: "other", prefs: {} }, error: null },
    row([]),
  ])("refuses failed, wrong-owner or malformed reads", async (response) => {
    const f = fixture([response], []);
    await expect(
      savePreferencesAtomically(f.client, "owner", () => ({})),
    ).rejects.toMatchObject({ stage: "read" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: {} },
    { data: [{ user_id: "other", prefs: {} }], error: null },
    { data: [{ user_id: "owner", prefs: [] }], error: null },
  ])("rejects unconfirmed writes", async (response) => {
    const f = fixture([row({})], [response]);
    await expect(
      savePreferencesAtomically(f.client, "owner", () => ({})),
    ).rejects.toBeInstanceOf(PreferencePersistenceError);
  });
  it("does not let a transform mutate the comparison snapshot", async () => {
    const f = fixture([row({ theme: "light" })], [saved({ theme: "dark" })]);
    await savePreferencesAtomically(f.client, "owner", (prefs) => {
      prefs.theme = "dark";
      return prefs;
    });
    expect(f.rpc.mock.calls[0][1].p_expected_prefs).toEqual({ theme: "light" });
  });
  it("does not queue or write when the transform declines an obsolete guest merge", async () => {
    const f = fixture([row({ homeLocation: { state: "TX" } })], []);
    expect(
      (await savePreferencesAtomically(f.client, "owner", () => null)).changed,
    ).toBe(false);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("does not retry or overwrite a newer location with a late queue stamp", async () => {
    const f = fixture([], [{ data: [], error: null }]);
    const confirmed = { homeLocation: { state: "MO" } };
    expect(
      await stampConfirmedPreferences(f.client, "owner", confirmed, {
        locationDemandAt: "now",
      }),
    ).toEqual(confirmed);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.read).not.toHaveBeenCalled();
  });
});
