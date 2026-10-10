import { describe, expect, it } from "vitest";
import { splitStateFreshness, summarizeFreshness } from "./freshness-rollups";

const NOW = Date.parse("2026-10-10T02:13:00Z");
const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString();

describe("splitStateFreshness", () => {
  it("splits each state into live / frozen / stale / ended", () => {
    const split = splitStateFreshness(
      [
        {
          location_state: "mo",
          source: "independent_dealer",
          last_seen_at: h(1),
        },
        { location_state: "MO", source: "copart", last_seen_at: h(200) },
        {
          location_state: "MO",
          source: "independent_dealer",
          last_seen_at: h(100),
        },
        {
          location_state: "TX",
          source: "acv",
          last_seen_at: h(1),
          auction_end_at: h(2),
        },
        { location_state: "", source: "copart" },
      ],
      NOW,
    );
    expect(split.MO).toEqual({ live: 1, frozen: 1, stale: 1, ended: 0 });
    expect(split.TX).toEqual({ live: 0, frozen: 0, stale: 0, ended: 1 });
    expect(Object.keys(split)).toEqual(["MO", "TX"]);
  });
});

describe("summarizeFreshness", () => {
  it("rolls up live share and lists frozen / stale sources", () => {
    const out = summarizeFreshness([
      {
        source: "copart",
        status: "frozen",
        active: 900,
        live: 0,
        frozen: 900,
        ageHours: 190,
      },
      {
        source: "dealers",
        status: "fresh",
        active: 1100,
        live: 1000,
        stale: 100,
        ageHours: 1,
      },
    ]);
    expect(out.liveDeals).toBe(1000);
    expect(out.notLiveDeals).toBe(1000);
    expect(out.liveShare).toBe(0.5);
    expect(out.staleSources.map((s) => s.source)).toEqual(["copart"]);
  });
  it("handles an empty breakdown", () => {
    expect(summarizeFreshness([]).liveShare).toBe(0);
  });
});
