import { describe, expect, it } from "vitest";
import { marketValuation } from "./valuation";

const asking = {
  source: "comparables",
  resaleEvidence: true,
  compCount: 8,
  confidence: "medium",
  compKind: "ask",
};

describe("Market valuation evidence", () => {
  it("does not attach comparison-based value to a blank reported model", () => {
    expect(
      marketValuation(asking, 18000, {
        year: 2009,
        make: "Freightliner",
        model: " ",
      }),
    ).toEqual({
      label: "Vehicle identity needs verification",
      supported: false,
    });
  });
  it("withholds even otherwise supported estimates when the listing identity conflicts", () => {
    expect(
      marketValuation(asking, 15000, {
        title: "2024 Buick Allure Sport Touring",
        year: 2024,
        make: "Buick",
        model: "Envista",
      }),
    ).toEqual({
      label: "Vehicle identity needs verification",
      supported: false,
    });
  });
  it.each([
    undefined,
    { source: "baseline" },
    { ...asking, resaleEvidence: false },
    { ...asking, compCount: 2 },
    { ...asking, compCount: 3.5 },
    { ...asking, confidence: "none" },
    { ...asking, source: "asking_price" },
  ])("withholds unsupported resale claims: %j", (value) => {
    expect(marketValuation(value, 15000).supported).toBe(false);
  });
  it.each([null, 0, -1, Infinity, NaN, "15000"])(
    "rejects invalid estimate %s",
    (estimate) => {
      expect(marketValuation(asking, estimate).supported).toBe(false);
    },
  );
  it("describes seller asks as asking comparisons", () => {
    expect(marketValuation(asking, 15000)).toEqual({
      label: "8 asking-price comparisons · medium confidence",
      supported: true,
    });
  });
  it("requires dated recent sales before describing sold evidence", () => {
    const sold = {
      ...asking,
      compKind: "sold",
      soldAnchored: true,
      soldCount: 3,
    };
    expect(marketValuation(sold, 15000).supported).toBe(false);
    expect(
      marketValuation(
        { ...sold, soldAt: new Date(Date.now() - 86400000).toISOString() },
        15000,
      ).label,
    ).toContain("dated sale comparisons");
    expect(
      marketValuation(
        {
          ...sold,
          soldAt: new Date(Date.now() - 181 * 86400000).toISOString(),
        },
        15000,
      ).supported,
    ).toBe(false);
  });
  it("requires an actual attached guide value", () => {
    const guide = { resaleEvidence: true, source: "third_party" };
    expect(marketValuation(guide, 15000).supported).toBe(false);
    expect(
      marketValuation({ ...guide, kbbValue: 16000 }, 15000).supported,
    ).toBe(true);
  });
});
