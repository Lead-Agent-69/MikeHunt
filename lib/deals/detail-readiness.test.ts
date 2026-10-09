import { describe, expect, it } from "vitest";
import { gradeDataQuality } from "@/lib/data-quality";
import {
  detailValuationConfidence,
  listingChecklistFields,
  sourceReadinessFallback,
} from "./detail-readiness";

describe("detail readiness", () => {
  it.each([
    undefined,
    { source: "asking_price", confidence: "high" },
    { source: "historical_estimate", confidence: "high" },
    { source: "comparables", confidence: "low", compCount: 30 },
  ])(
    "does not inflate confidence from a modeled price or thin evidence %j",
    (valuation) => {
      expect(detailValuationConfidence(valuation)).toBe("Low");
    },
  );
  it("recognizes supported listing evidence without calling it completed-sale proof", () => {
    expect(
      detailValuationConfidence({
        source: "comparables",
        confidence: "high",
        sampleCount: 9,
      }),
    ).toBe("Medium");
    expect(
      detailValuationConfidence({
        source: "comparables",
        confidence: "high",
        compCount: 9,
        soldCount: 4,
        soldAnchored: true,
      }),
    ).toBe("High");
  });
  it("shows each relevant field once with identity first and no auction date for dealer stock", () => {
    const quality = gradeDataQuality({
      sellerType: "dealer",
      condition: "clean_title",
    });
    const fields = listingChecklistFields(quality);
    expect(fields[0]).toBe("vin");
    expect(fields).not.toContain("auction");
    expect(new Set(fields).size).toBe(fields.length);
    expect(fields).toContain("location");
    expect(
      listingChecklistFields(gradeDataQuality({ sellerType: "auction" })),
    ).toContain("auction");
  });
  it("has distinct loading, failed and untracked source states", () => {
    expect(sourceReadinessFallback(true, false).label).toBe("Checking");
    expect(sourceReadinessFallback(false, true).label).toBe("Unavailable");
    expect(sourceReadinessFallback(false, false)).toMatchObject({
      label: "Not tracked",
      detail: expect.stringContaining(
        "does not mean the vehicle is unavailable",
      ),
    });
    expect(sourceReadinessFallback(false, false).summary).not.toContain(
      "loading",
    );
  });
});
