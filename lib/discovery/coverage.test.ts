import { describe, expect, it } from "vitest";
import {
  COVERAGE_THIN_MIN_ROWS,
  buildDiscoverCoverage,
  unavailableCoverage,
} from "./coverage";

const now = new Date("2026-10-06T04:00:00.000Z");
const hoursAgo = (h: number) =>
  new Date(now.getTime() - h * 3_600_000).toISOString();
const row = (source: string, state: string, h: number) => ({
  source,
  location_state: state,
  last_seen_at: hoursAgo(h),
});

describe("buildDiscoverCoverage", () => {
  it("reports none when nothing was seen in the window", () => {
    const c = buildDiscoverCoverage({
      marketRows: [row("govdeals", "MO", 24 * 9)],
      feedRows: [],
      states: ["mo"],
      rowCap: 10000,
      now,
    });
    expect(c).toMatchObject({
      status: "none",
      freshRows: 0,
      sourceCount: 0,
      bySource: [],
      byState: [{ state: "MO", rows: 0 }],
      newestSeenAt: null,
      capped: false,
    });
  });

  it("counts by source and state, drops stale and undated rows, and flags thin", () => {
    const rows = [
      row("curated_dealers", "MO", 1),
      row("curated_dealers", "MO", 5),
      row("govdeals", "IL", 40),
      row("govdeals", "IL", 24 * 8),
      { source: "govdeals", location_state: "IL", last_seen_at: null },
    ];
    const c = buildDiscoverCoverage({
      marketRows: rows,
      feedRows: rows.slice(0, 2),
      states: ["MO", "IL", "KS", "bogus"],
      maxPrice: 15000,
      rowCap: 10000,
      now,
    });
    expect(c.status).toBe("thin");
    expect(c.freshRows).toBe(3);
    expect(c.freshRowsInFeed).toBe(2);
    expect(c.maxPrice).toBe(15000);
    expect(c.bySource).toEqual([
      { source: "curated_dealers", rows: 2, newestSeenAt: hoursAgo(1) },
      { source: "govdeals", rows: 1, newestSeenAt: hoursAgo(40) },
    ]);
    expect(c.byState).toEqual([
      { state: "MO", rows: 2 },
      { state: "IL", rows: 1 },
      { state: "KS", rows: 0 },
    ]);
    expect(c.newestSeenAt).toBe(hoursAgo(1));
    expect(c.since).toBe(hoursAgo(24 * 7));
  });

  it("is ok only with enough rows from at least two sources", () => {
    const many = Array.from({ length: COVERAGE_THIN_MIN_ROWS }, (_, i) =>
      row(i % 2 ? "govdeals" : "curated_dealers", "TX", i % 100),
    );
    expect(
      buildDiscoverCoverage({
        marketRows: many,
        feedRows: many,
        states: ["TX"],
        rowCap: 10000,
        now,
      }).status,
    ).toBe("ok");
    const oneSource = many.map((r) => ({ ...r, source: "curated_dealers" }));
    expect(
      buildDiscoverCoverage({
        marketRows: oneSource,
        feedRows: oneSource,
        states: ["TX"],
        rowCap: 10000,
        now,
      }).status,
    ).toBe("thin");
  });

  it("marks counts as a floor when the RPC cap is hit inside the window", () => {
    const rows = [row("govdeals", "TX", 1), row("curated_dealers", "TX", 2)];
    const c = buildDiscoverCoverage({
      marketRows: rows,
      feedRows: rows,
      states: ["TX"],
      rowCap: 2,
      now,
    });
    expect(c.capped).toBe(true);
    expect(c.status).toBe("ok");
    const notCapped = buildDiscoverCoverage({
      marketRows: [row("govdeals", "TX", 1), row("govdeals", "TX", 24 * 9)],
      feedRows: [],
      states: ["TX"],
      rowCap: 2,
      now,
    });
    expect(notCapped.capped).toBe(false);
  });

  it("nationwide requests report no states", () => {
    const c = buildDiscoverCoverage({
      marketRows: [row("govdeals", "TX", 1)],
      feedRows: [],
      states: [],
      rowCap: 10000,
      now,
    });
    expect(c.states).toEqual([]);
    expect(c.byState).toEqual([]);
  });

  it("unavailable block carries a reason and no counts", () => {
    expect(unavailableCoverage("db off")).toMatchObject({
      status: "unavailable",
      freshRows: 0,
      reason: "db off",
    });
  });
});
