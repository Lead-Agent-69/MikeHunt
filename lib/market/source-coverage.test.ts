import { describe, expect, it } from "vitest";
import { marketSourceCoverage } from "./source-coverage";
import { sourceMatchLabel } from "@/lib/search/source-coverage";

describe("search-scoped source coverage", () => {
  it("counts dealer identities separately from their stored umbrella channel", () => {
    const coverage = marketSourceCoverage(
      [
        {
          source: "independent_dealer",
          sourceUrl: "https://dgautollc.com/vehicle/1",
        },
        {
          source: "independent_dealer",
          sourceUrl: "https://www.dgautollc.com/vehicle/2",
        },
        {
          source: "independent_dealer",
          sourceUrl: "https://aeofmiami.com/product/3",
        },
        { source: "gov_auction", sourceUrl: "https://www.govdeals.com/item/4" },
        {
          source: "cargurus",
          sourceUrl: "https://www.cargurus.com/Cars/listing/5",
        },
      ],
      false,
    );
    expect(coverage.counts["dg-auto"]).toBe(2);
    expect(coverage.counts["ae-of-miami"]).toBe(1);
    expect(coverage.counts.independent_dealer).toBe(3);
    expect(coverage.counts.govdeals).toBe(1);
    expect(coverage.counts.gov_auction).toBe(1);
    expect(coverage.counts.cargurus).toBe(1);
    expect(coverage.accessReviewIds).toContain("ae-of-miami");
    expect(coverage.accessReviewIds).not.toContain("dg-auto");
    expect(Object.keys(coverage).sort()).toEqual([
      "accessReviewIds",
      "complete",
      "counts",
    ]);
    expect(JSON.stringify(coverage)).not.toMatch(
      /SCRAPE_|reason|robot|quota|cookie/,
    );
  });
  it("does not count a trusted domain embedded in an unrelated URL", () => {
    const coverage = marketSourceCoverage(
      [
        {
          source: "independent_dealer",
          sourceUrl: "https://example.test/?site=dgautollc.com",
        },
        {
          source: "independent_dealer",
          sourceUrl: "https://dgautollc.com.evil.test/car",
        },
        { source: "cargurus", sourceUrl: "https://dgautollc.com/car" },
      ],
      false,
    );
    expect(coverage.counts["dg-auto"]).toBeUndefined();
  });
  it("never turns incomplete or failed evidence into a definitive zero", () => {
    const partial = marketSourceCoverage([], true);
    expect(sourceMatchLabel("dg-auto", partial)).toBe("Count incomplete");
    expect(sourceMatchLabel("dg-auto", undefined)).toBe("Count not verified");
    expect(sourceMatchLabel("dg-auto", partial, { busy: true })).toBe(
      "Updating matches",
    );
    expect(
      sourceMatchLabel("dg-auto", marketSourceCoverage([], false), {
        error: true,
      }),
    ).toBe("Count not verified");
    expect(sourceMatchLabel("dg-auto", marketSourceCoverage([], false))).toBe(
      "No matches in this search",
    );
    partial.counts["dg-auto"] = 2;
    expect(sourceMatchLabel("dg-auto", partial)).toBe(
      "At least 2 indexed matches",
    );
    partial.complete = true;
    partial.counts["dg-auto"] = 1;
    expect(sourceMatchLabel("dg-auto", partial)).toBe("1 indexed match");
  });
});
