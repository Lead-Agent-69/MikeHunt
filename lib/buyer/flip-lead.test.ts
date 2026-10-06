import { describe, expect, it } from "vitest";
import { isFlipBuyerMode, isSoldCompAnchored } from "./flip-lead";

describe("flip lead gate", () => {
  it("treats only reseller and dealer as flip desks", () => {
    expect(isFlipBuyerMode("dealer")).toBe(true);
    expect(isFlipBuyerMode("reseller")).toBe(true);
    expect(isFlipBuyerMode("personal")).toBe(false);
    expect(isFlipBuyerMode("diy")).toBe(false);
    expect(isFlipBuyerMode("parts")).toBe(false);
    expect(isFlipBuyerMode("enthusiast")).toBe(false);
    expect(isFlipBuyerMode(undefined)).toBe(false);
  });

  it("accepts a real sold anchor and rejects an ask haircut", () => {
    expect(isSoldCompAnchored({ soldAnchored: true, sellBasis: "comps" })).toBe(
      true,
    );
    expect(
      isSoldCompAnchored({
        valuation: { soldAnchored: true, source: "comparables" },
      }),
    ).toBe(true);
    expect(
      isSoldCompAnchored({
        soldAnchored: true,
        valuation: { source: "asking_price" },
      }),
    ).toBe(false);
    expect(
      isSoldCompAnchored({
        sellBasis: "market",
        valuation: { source: "asking_price", basis: "market" },
      }),
    ).toBe(false);
    expect(isSoldCompAnchored({ sellBasis: "market" })).toBe(false);
    expect(isSoldCompAnchored(null)).toBe(false);
  });
});
