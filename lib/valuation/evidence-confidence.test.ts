import { describe, expect, it } from "vitest";
import { evidenceConfidence } from "./evidence-confidence";

describe("valuation evidence confidence", () => {
  it("keeps thin, unknown, and dispersed evidence low even with many rows", () => {
    for (const confidence of ["low", "none", undefined, "unexpected"])
      for (const source of ["comparables", "third_party"])
        expect(evidenceConfidence({ source, confidence, compCount: 20 })).toBe(
          "Low",
        );
  });
  it("does not promote asking-price or model estimates even with claimed high confidence", () => {
    for (const source of [
      "asking_price",
      "baseline",
      "historical_estimate",
      undefined,
    ]) {
      expect(
        evidenceConfidence({
          source,
          confidence: "high",
          compCount: 20,
          soldCount: 20,
          soldAnchored: true,
        }),
      ).toBe("Low");
    }
  });
  it("requires completed sales and a supported confidence for high confidence", () => {
    expect(
      evidenceConfidence({
        source: "comparables",
        confidence: "high",
        compCount: 5,
        soldCount: 3,
        soldAnchored: true,
      }),
    ).toBe("High");
    expect(
      evidenceConfidence({
        source: "comparables",
        confidence: "high",
        compCount: 5,
        soldCount: 0,
      }),
    ).toBe("Medium");
    expect(
      evidenceConfidence({
        source: "comparables",
        confidence: "high",
        compCount: 1,
        soldCount: 1,
        soldAnchored: true,
      }),
    ).toBe("Low");
  });
});
