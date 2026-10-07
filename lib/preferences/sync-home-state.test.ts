import { describe, expect, it, vi, beforeEach } from "vitest";

const kick = vi.fn();
vi.mock("@/lib/preferences/kick-location-demand", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/preferences/kick-location-demand")
  >("@/lib/preferences/kick-location-demand");
  return {
    ...actual,
    kickLocationDemand: (...args: unknown[]) => kick(...args),
  };
});

import {
  syncProfileHomeStateToPrefs,
  syncPrefsHomeLocationToProfile,
} from "./sync-home-state";

describe("syncProfileHomeStateToPrefs", () => {
  beforeEach(() => {
    kick.mockReset();
    kick.mockResolvedValue({
      states: ["MO"],
      queued: true,
      deduplicated: false,
      jobId: "j1",
      sourceIds: ["curated_dealers"],
      demandedAt: "2026-10-07T12:00:00.000Z",
    });
  });

  it("no-ops on empty / XX state", async () => {
    const sb = { from: vi.fn() } as any;
    expect(
      await syncProfileHomeStateToPrefs({
        supabase: sb,
        userId: "u1",
        homeState: "XX",
      }),
    ).toEqual({ synced: false, kicked: false });
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("upserts prefs.homeLocation and kicks demand", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "user_preferences") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { prefs: {} }, error: null }),
              }),
            }),
            upsert,
          };
        }
        throw new Error(table);
      }),
    } as any;
    const out = await syncProfileHomeStateToPrefs({
      supabase: sb,
      userId: "u1",
      homeState: "mo",
      homeZip: "63101",
    });
    expect(out.synced).toBe(true);
    expect(out.kicked).toBe(true);
    expect(kick).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        prefs: expect.objectContaining({
          homeLocation: expect.objectContaining({ state: "MO", zip: "63101" }),
          carsState: "MO",
          locationDemandStates: ["MO"],
        }),
      }),
      { onConflict: "user_id" },
    );
  });
});

describe("syncPrefsHomeLocationToProfile", () => {
  it("updates user_profiles.home_state from prefs.homeLocation", async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "user_profiles") return { update };
        throw new Error(table);
      }),
    } as any;
    expect(
      await syncPrefsHomeLocationToProfile({
        supabase: sb,
        userId: "u1",
        homeLocation: { state: "mo", zip: "63101" },
      }),
    ).toBe(true);
    expect(update).toHaveBeenCalledWith({ home_state: "MO" });
  });

  it("clears home_state when homeLocation is null", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const sb = {
      from: vi.fn(() => ({ update })),
    } as any;
    expect(
      await syncPrefsHomeLocationToProfile({
        supabase: sb,
        userId: "u1",
        homeLocation: null,
      }),
    ).toBe(true);
    expect(update).toHaveBeenCalledWith({ home_state: null });
  });
});
