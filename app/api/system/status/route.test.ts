import { describe, expect, it } from "vitest";
import { mergeStatusSources, summarizeSourceHealth } from "./route";

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
      userStatus: "Working",
      activeRows: 1094,
      rowsWithPhotos: 1094,
      photoCoveragePct: 100,
      runs_7d: 3,
    });
    expect(sources[1]).toMatchObject({
      source: "publicsurplus",
      readiness: "ready",
      activeRows: 142,
      rowsWithPhotos: 125,
    });
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
