import { describe, expect, it } from "vitest";
import {
  buildSourceBreakdownFromRollups,
  lastSeenLabel,
  mergeStatusSources,
  shouldCacheFullStatus,
  sourceListingStatus,
  summarizeSourceHealth,
} from "./route";

describe("shouldCacheFullStatus", () => {
  it("keeps setup responses cacheable but retries incomplete production reads", () => {
    expect(shouldCacheFullStatus({ configured: false })).toBe(true);
    expect(
      shouldCacheFullStatus({
        configured: true,
        activeDeals: 0,
        sources: [],
      }),
    ).toBe(false);
    expect(
      shouldCacheFullStatus({
        configured: true,
        activeDeals: 10,
        sources: [],
      }),
    ).toBe(false);
    expect(
      shouldCacheFullStatus({
        configured: true,
        activeDeals: 10,
        sources: [{ id: "carvana" }],
      }),
    ).toBe(true);
  });
});

describe("buildSourceBreakdownFromRollups", () => {
  it("keeps exact weighted totals and attributes shared dealer hosts", () => {
    const now = new Date("2026-10-19T12:00:00.000Z").getTime();
    const rows = buildSourceBreakdownFromRollups(
      [
        {
          source: "independent_dealer",
          source_host: "recar.com",
          active_rows: "3",
          rows_with_photos: "2",
          newest_seen: "2026-10-19T11:00:00.000Z",
        },
        {
          source: "independent_dealer",
          source_host: "recar.com",
          active_rows: 2,
          rows_with_photos: 2,
          newest_seen: "2026-10-19T10:00:00.000Z",
        },
        {
          source: "carvana",
          source_host: "carvana.com",
          active_rows: 10,
          rows_with_photos: 10,
          newest_seen: "2026-10-19T11:30:00.000Z",
        },
      ],
      now,
    );

    expect(rows).toEqual([
      {
        source: "carvana",
        active: 10,
        photoPct: 100,
        ageHours: 1,
        status: "stored",
      },
      {
        source: "recar",
        active: 5,
        photoPct: 80,
        ageHours: 1,
        status: "stored",
      },
    ]);
  });

  it("drops empty groups and keeps unknown freshness explicit", () => {
    expect(
      buildSourceBreakdownFromRollups([
        {
          source: "offerup",
          active_rows: 0,
          rows_with_photos: 0,
          newest_seen: null,
        },
        {
          source: "craigslist",
          active_rows: 4,
          rows_with_photos: 1,
          newest_seen: null,
        },
      ]),
    ).toEqual([
      {
        source: "craigslist",
        active: 4,
        photoPct: 25,
        ageHours: null,
        status: "stored",
      },
    ]);
  });
});

describe("mergeStatusSources", () => {
  it("adds buyer-facing readiness and row proof from live source breakdown", () => {
    const sources = mergeStatusSources(
      [
        {
          source: "govdeals",
          runs_7d: 3,
          ok_7d: 3,
          last_run: "2026-10-02T10:00:00Z",
        },
      ],
      [
        {
          source: "govdeals",
          active: 1094,
          photoPct: 100,
          ageHours: 0,
          status: "live",
        },
        {
          source: "publicsurplus",
          active: 142,
          photoPct: 88,
          ageHours: 1,
          status: "live",
        },
      ],
    );

    expect(sources[0]).toMatchObject({
      source: "govdeals",
      id: "govdeals",
      readiness: "ready",
      userStatus: "Seen just now",
      activeRows: 1094,
      rowsWithPhotos: 1094,
      photoCoveragePct: 100,
      runs_7d: 3,
    });
    expect(sources[1]).toMatchObject({
      source: "publicsurplus",
      readiness: "ready",
      userStatus: "Seen 1h ago",
      activeRows: 142,
      rowsWithPhotos: 125,
    });
    expect(sources.every((source) => source.userStatus !== "Working")).toBe(
      true,
    );
  });

  it("does not treat a 72h window or status live as a working scrape", () => {
    const sources = mergeStatusSources(
      [],
      [
        {
          source: "cars",
          active: 12,
          photoPct: 50,
          ageHours: 72,
          status: "live",
        },
        {
          source: "empty",
          active: 0,
          photoPct: 0,
          ageHours: 1,
          status: "live",
        },
      ],
    );
    expect(sources.find((source) => source.source === "cars")).toMatchObject({
      readiness: "ready",
      userStatus: "Seen 3d ago",
    });
    expect(sources.find((source) => source.source === "empty")).toMatchObject({
      readiness: "no_rows",
      userStatus: "No rows",
    });
  });
});

describe("sourceListingStatus", () => {
  it("never marks stored rows live just because they are younger than 72h", () => {
    expect(sourceListingStatus(10, 1)).toBe("stored");
    expect(sourceListingStatus(10, 72)).toBe("stored");
    expect(sourceListingStatus(10, 73)).toBe("stale");
    expect(sourceListingStatus(0, 1)).toBe("idle");
    expect(sourceListingStatus(10, null)).toBe("stored");
    expect(
      ["stored", "stale", "idle"].includes(sourceListingStatus(10, 0)),
    ).toBe(true);
    expect(sourceListingStatus(10, 0)).not.toBe("live");
    expect(lastSeenLabel(0)).toBe("Seen just now");
    expect(lastSeenLabel(5)).toBe("Seen 5h ago");
    expect(lastSeenLabel(48)).toBe("Seen 2d ago");
    expect(lastSeenLabel(null)).toBe("Last seen unknown");
  });
});

describe("summarizeSourceHealth", () => {
  it("exposes buyer-facing source totals and top ready sources", () => {
    const summary = summarizeSourceHealth(
      [
        {
          id: "govdeals",
          readiness: "ready",
          activeRows: 1094,
          rowsWithPhotos: 1094,
        },
        {
          id: "publicsurplus",
          readiness: "ready",
          activeRows: 142,
          rowsWithPhotos: 125,
        },
        {
          id: "copart",
          readiness: "needs_login",
          activeRows: 0,
          rowsWithPhotos: 0,
        },
      ],
      { activeDeals: 1236, buyerReady: true },
    );

    expect(summary).toMatchObject({
      readySources: 2,
      needsLoginSources: 1,
      totalSources: 3,
      activeRows: 1236,
      activeDeals: 1236,
      rowsWithPhotos: 1219,
      photoCoveragePct: 99,
      buyerReady: true,
    });
    expect(summary.topSources.map((source) => source.id)).toEqual([
      "govdeals",
      "publicsurplus",
    ]);
  });
});
