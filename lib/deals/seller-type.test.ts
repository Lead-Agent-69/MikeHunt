import { describe, expect, it } from "vitest";
import { reportedSellerType, sellerTypeEvidence } from "./seller-type";

describe("sellerTypeEvidence", () => {
  it("keeps mixed marketplaces unknown until the listing reports a seller type", () => {
    for (const source of [
      "cars_com",
      "cargurus",
      "autotrader",
      "truecar",
      "ebay_motors",
      "craigslist",
      "facebook_marketplace",
      "offerup",
    ]) {
      expect(sellerTypeEvidence({ source })).toBeUndefined();
    }
    expect(
      sellerTypeEvidence({
        source: "facebook_marketplace",
        options: { sellerType: "private" },
      }),
    ).toBe("private");
  });

  it("uses dedicated dealer and auction sources as evidence", () => {
    expect(sellerTypeEvidence({ source: "independent_dealer" })).toBe("dealer");
    expect(sellerTypeEvidence({ source: "carvana" })).toBe("dealer");
    expect(sellerTypeEvidence({ source: "gov_auction" })).toBe("auction");
    expect(sellerTypeEvidence({ source: "copart" })).toBe("auction");
  });

  it("does not let stale seller fields contradict a dedicated source", () => {
    expect(
      sellerTypeEvidence({
        source: "independent_dealer",
        options: { sellerType: "private" },
      }),
    ).toBe("dealer");
    expect(
      sellerTypeEvidence({
        source: "copart",
        options: { sellerType: "dealer" },
      }),
    ).toBe("auction");
  });

  it("separates reported evidence from source defaults", () => {
    expect(reportedSellerType({ source: "carvana" })).toBeUndefined();
    expect(
      reportedSellerType({
        source: "ebay_motors",
        options: { sellerType: " Dealer " },
      }),
    ).toBe("dealer");
  });

  it("recognizes a curated dealer URL without treating its condition as seller proof", () => {
    expect(
      sellerTypeEvidence({
        source: "independent_dealer",
        source_url: "https://aeofmiami.com/inventory/example",
        options: { sellerType: "private" },
      }),
    ).toBe("dealer");
  });
});
