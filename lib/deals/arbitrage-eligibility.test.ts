import { describe, expect, it } from "vitest";
import {
  arbitrageExclusion,
  hasVerifiedComps,
  isPlaceholderBid,
} from "./arbitrage-eligibility";

const comps = { soldAnchored: true, sellBasis: "comps" };

describe("arbitrage eligibility", () => {
  it("flags a $100 salvage opening bid with no bids as placeholder", () => {
    expect(
      isPlaceholderBid({
        askPrice: 100,
        source: "copart",
        sellEstimate: 30000,
      }),
    ).toBe(true);
    expect(
      isPlaceholderBid({ askPrice: 100, sellerType: "auction", bidCount: 0 }),
    ).toBe(true);
  });

  it("a real current bid on an auction is not a placeholder", () => {
    expect(
      isPlaceholderBid({
        askPrice: 450,
        source: "copart",
        bidCount: 7,
        sellEstimate: 6000,
      }),
    ).toBe(false);
    expect(
      isPlaceholderBid({
        askPrice: 8000,
        source: "copart",
        sellEstimate: 14000,
      }),
    ).toBe(false);
  });

  it("token ask far under resale with no bids is a placeholder; missing ask too", () => {
    expect(isPlaceholderBid({ askPrice: 900, sellEstimate: 40000 })).toBe(true);
    expect(isPlaceholderBid({ askPrice: 0, sellEstimate: 40000 })).toBe(true);
  });

  it("verified comps only when the analysis is sold-anchored", () => {
    expect(hasVerifiedComps({ dealAnalysis: comps })).toBe(true);
    expect(hasVerifiedComps({ dealAnalysis: { sellBasis: "market" } })).toBe(
      false,
    );
    expect(
      hasVerifiedComps({
        dealAnalysis: {
          soldAnchored: true,
          valuation: { source: "asking_price" },
        },
      }),
    ).toBe(false);
    expect(hasVerifiedComps({})).toBe(false);
  });

  it("returns the reason, placeholder first, then comps, then outlier margin", () => {
    expect(
      arbitrageExclusion({
        askPrice: 100,
        source: "iaai",
        dealAnalysis: comps,
      }),
    ).toBe("placeholder_bid");
    expect(
      arbitrageExclusion({ askPrice: 9000, sellEstimate: 15000 }, 30),
    ).toBe("unverified_comps");
    expect(
      arbitrageExclusion(
        { askPrice: 2000, sellEstimate: 15000, dealAnalysis: comps },
        414,
      ),
    ).toBe("outlier_margin");
    expect(
      arbitrageExclusion(
        { askPrice: 9000, sellEstimate: 15000, dealAnalysis: comps },
        30,
      ),
    ).toBeNull();
  });
});
