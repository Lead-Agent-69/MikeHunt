import { describe, expect, it } from "vitest";
import { CONFIDENCE_META, valueConfidence } from "./confidence";

const ask = {
  source: "comparables",
  confidence: "low",
  compKind: "ask",
  compCount: 5,
  soldCount: 0,
  resaleEvidence: true,
};
describe("evidence-based valuation confidence", () => {
  it("does not upgrade the live five-asking-comparison example to good confidence", () => {
    expect(valueConfidence("comps", false, ask)).toBe("low");
    expect(CONFIDENCE_META.low.label).toBe("Low");
  });
  it.each(["none", undefined, "invalid"])(
    "leaves %s recorded confidence unrated",
    (confidence) => {
      expect(valueConfidence("comps", true, { ...ask, confidence })).toBe(
        "estimate",
      );
    },
  );
  it("does not manufacture confidence from a basis or sold flag", () => {
    expect(valueConfidence("comps", true)).toBe("estimate");
    expect(valueConfidence("market", false)).toBe("estimate");
    expect(valueConfidence("baseline", false)).toBe("estimate");
  });
  it("caps even recorded high confidence when only asking evidence exists", () => {
    expect(
      valueConfidence("comps", false, { ...ask, confidence: "high" }),
    ).toBe("good");
    expect(CONFIDENCE_META.good.label).toBe("Medium");
    expect(valueConfidence("comps", true, { ...ask, confidence: "high" })).toBe(
      "good",
    );
  });
  it("keeps low and medium evidence levels even with completed sales", () => {
    expect(
      valueConfidence("comps", true, {
        ...ask,
        compKind: "sold",
        soldCount: 5,
      }),
    ).toBe("low");
    expect(
      valueConfidence("comps", true, {
        ...ask,
        confidence: "medium",
        soldCount: 5,
      }),
    ).toBe("good");
  });
  it("requires actual recorded sale counts before displaying high confidence", () => {
    expect(
      valueConfidence("comps", true, {
        ...ask,
        confidence: "high",
        soldCount: 3,
      }),
    ).toBe("high");
    expect(
      valueConfidence("comps", false, {
        ...ask,
        confidence: "high",
        compKind: "sold",
      }),
    ).toBe("high");
  });
  it.each([undefined, 0, 2, NaN, Infinity, "5"])(
    "does not upgrade missing or unusable samples (%s)",
    (compCount) => {
      expect(valueConfidence("comps", false, { ...ask, compCount })).toBe(
        "estimate",
      );
    },
  );
  it("respects a recorded insufficient-evidence gate", () => {
    expect(
      valueConfidence("comps", true, {
        ...ask,
        confidence: "high",
        soldCount: 20,
        resaleEvidence: false,
      }),
    ).toBe("estimate");
  });
  it.each(["asking_price", "baseline", "historical_estimate", undefined])(
    "does not relabel %s as comparable evidence",
    (source) =>
      expect(
        valueConfidence("comps", false, { ...ask, source, confidence: "high" }),
      ).toBe("estimate"),
  );
  it("supports an explicitly recorded guide without inventing sold evidence", () => {
    expect(
      valueConfidence("market", false, {
        source: "third_party",
        confidence: "high",
        resaleEvidence: true,
      }),
    ).toBe("good");
  });
});
