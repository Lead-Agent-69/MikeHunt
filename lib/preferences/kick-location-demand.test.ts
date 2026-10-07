import { describe, expect, it, vi, beforeEach } from "vitest";

const enqueue = vi.fn();
vi.mock("@/lib/scrapers/job-queue", () => ({
  enqueueScopedScrapeJob: (...args: unknown[]) => enqueue(...args),
}));
vi.mock("@/lib/scrapers/sweep-schedule", () => ({
  resolveSweepSources: () => ["curated_dealers", "gsa_auctions", "craigslist"],
  isAutomationAllowedSource: (id: string) => id !== "craigslist",
}));

import {
  demandStatesFromPrefs,
  isLocationDemandWarming,
  kickLocationDemand,
  locationDemandPrefsStamp,
  locationPatchTouchesDemand,
  locationDemandStatesChanged,
  LOCATION_DEMAND_WARMING_MS,
} from "./kick-location-demand";

describe("locationPatchTouchesDemand", () => {
  it("detects home / search location keys only", () => {
    expect(locationPatchTouchesDemand({ theme: "dark" })).toBe(false);
    expect(locationPatchTouchesDemand({ homeLocation: { state: "MO" } })).toBe(
      true,
    );
    expect(locationPatchTouchesDemand({ searchLocations: [] })).toBe(true);
    expect(locationPatchTouchesDemand({ carsState: "TX" })).toBe(true);
  });
});

describe("demandStatesFromPrefs", () => {
  it("unions home + search, sorted, 2-letter only", () => {
    expect(
      demandStatesFromPrefs({
        homeLocation: { state: "mo" },
        searchLocations: [{ state: "IL" }, { state: "MO" }, { state: "xx" }],
      }),
    ).toEqual(["IL", "MO"]);
    expect(demandStatesFromPrefs({ carsState: "TX" })).toEqual(["TX"]);
    expect(demandStatesFromPrefs({})).toEqual([]);
  });
});

describe("locationDemandStatesChanged", () => {
  it("compares demand state sets", () => {
    expect(
      locationDemandStatesChanged(
        { homeLocation: { state: "MO" } },
        { homeLocation: { state: "MO" } },
      ),
    ).toBe(false);
    expect(
      locationDemandStatesChanged(
        { homeLocation: { state: "MO" } },
        { homeLocation: { state: "TX" } },
      ),
    ).toBe(true);
  });
});

describe("kickLocationDemand", () => {
  beforeEach(() => {
    enqueue.mockReset();
    enqueue.mockResolvedValue({
      job: { id: "job-1" },
      deduplicated: false,
    });
  });

  it("returns null when no states", async () => {
    expect(
      await kickLocationDemand({
        supabase: {} as any,
        userId: "u1",
        prefs: {},
      }),
    ).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enqueues terms-safe sources and stamps demand", async () => {
    const kick = await kickLocationDemand({
      supabase: {} as any,
      userId: "u1",
      prefs: { homeLocation: { state: "IA" } },
      now: new Date("2026-10-07T12:00:00Z"),
    });
    expect(kick).toEqual(
      expect.objectContaining({
        states: ["IA"],
        queued: true,
        deduplicated: false,
        jobId: "job-1",
        sourceIds: ["curated_dealers", "gsa_auctions"],
        demandedAt: "2026-10-07T12:00:00.000Z",
      }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        requestedBy: "u1",
        sourceIds: ["curated_dealers", "gsa_auctions"],
        scope: { lane: "all", state: "IA", states: undefined },
        orchestrator: "priority",
      }),
    );
    expect(locationDemandPrefsStamp(kick!)).toEqual({
      locationDemandAt: "2026-10-07T12:00:00.000Z",
      locationDemandStates: ["IA"],
    });
  });

  it("still returns a stamp when enqueue fails", async () => {
    enqueue.mockRejectedValue(new Error("queue down"));
    const kick = await kickLocationDemand({
      supabase: {} as any,
      userId: "u1",
      prefs: { homeLocation: { state: "KY" } },
      now: new Date("2026-10-07T12:00:00Z"),
    });
    expect(kick?.queued).toBe(false);
    expect(kick?.jobId).toBeNull();
    expect(kick?.states).toEqual(["KY"]);
    expect(kick?.demandedAt).toBe("2026-10-07T12:00:00.000Z");
  });
});

describe("isLocationDemandWarming", () => {
  const now = Date.parse("2026-10-07T14:00:00Z");

  it("is scanning within the warming window", () => {
    const w = isLocationDemandWarming(
      {
        locationDemandAt: "2026-10-07T13:00:00Z",
        locationDemandStates: ["MO", "IL"],
      },
      now,
    );
    expect(w.scanning).toBe(true);
    expect(w.states).toEqual(["MO", "IL"]);
    expect(w.ageMs).toBe(60 * 60 * 1000);
  });

  it("stops after the warming window", () => {
    const w = isLocationDemandWarming(
      {
        locationDemandAt: new Date(
          now - LOCATION_DEMAND_WARMING_MS - 1,
        ).toISOString(),
        locationDemandStates: ["MO"],
      },
      now,
    );
    expect(w.scanning).toBe(false);
  });

  it("ignores a missing stamp", () => {
    expect(
      isLocationDemandWarming({ homeLocation: { state: "MO" } }, now).scanning,
    ).toBe(false);
  });
});
