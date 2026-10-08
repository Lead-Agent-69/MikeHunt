import { describe, expect, it } from "vitest";
import {
  publicScopedScrapeSummary,
  summarizeScopedScrapeResults,
} from "./job-result";

describe("scoped collection result truth", () => {
  it("keeps raw diagnostics out of customer status", () => {
    const result = publicScopedScrapeSummary({
      total: 1,
      successful: 0,
      failed: 1,
      totalDeals: 0,
      secret: "private-key",
      results: [
        {
          source: "dealer",
          success: false,
          error: "Docker RPC service_role private-key",
          metadata: { secret: "private-key" },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /Docker|RPC|private-key|metadata/,
    );
    expect(result?.results[0].error).toContain("could not be checked");
    expect(publicScopedScrapeSummary(null)).toBeNull();
  });
  it("separates found rows from actual saved rows", () => {
    const summary = summarizeScopedScrapeResults([
      {
        source: "dealer",
        success: true,
        dealsFound: 30,
        dealsSaved: 4,
        duration: 10,
      },
      { source: "auction", success: false, dealsFound: 2, duration: 5 },
    ]);
    expect(summary).toMatchObject({
      successful: 1,
      failed: 1,
      totalDeals: 32,
      totalSaved: 4,
    });
  });

  it("does not treat no results or all failed sources as success", () => {
    expect(summarizeScopedScrapeResults([]).successful).toBe(0);
    expect(
      summarizeScopedScrapeResults([
        { source: "dealer", success: false, dealsFound: 0, duration: 0 },
      ]).successful,
    ).toBe(0);
  });

  it("preserves a genuine empty successful search without invented inventory", () => {
    expect(
      summarizeScopedScrapeResults([
        { source: "dealer", success: true, dealsFound: 0, duration: 5 },
      ]),
    ).toMatchObject({ successful: 1, totalSaved: 0, totalDeals: 0 });
  });

  it("does not persist malformed counts", () => {
    expect(
      summarizeScopedScrapeResults([
        {
          source: "dealer",
          success: true,
          dealsFound: NaN,
          dealsSaved: -1,
          duration: Infinity,
        },
      ]),
    ).toMatchObject({ totalDeals: 0, totalSaved: 0, totalDuration: 0 });
  });
});
