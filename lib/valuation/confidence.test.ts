import { describe, expect, it } from "vitest";
import { CONFIDENCE_META, valueConfidence } from "./confidence";

describe("value confidence copy", () => {
  it("does not call ask-based comps live retail or real sold prices", () => {
    expect(valueConfidence("comps", false)).toBe("good");
    expect(valueConfidence("comps", true)).toBe("high");
    expect(CONFIDENCE_META.good.blurb).toBe("Ask-based comps");
    expect(CONFIDENCE_META.high.blurb).toBe(
      "Partly blended with completed sales",
    );
    expect(CONFIDENCE_META.good.blurb.toLowerCase()).not.toContain("live retail");
    expect(CONFIDENCE_META.high.blurb.toLowerCase()).not.toContain("real sold");
  });
});
