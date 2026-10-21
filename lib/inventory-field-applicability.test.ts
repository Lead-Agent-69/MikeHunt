import { describe, expect, it } from "vitest";
import { auctionDateApplies } from "./inventory-field-applicability";

describe("inventory field applicability", () => {
  it("requires auction dates for auction and government inventory", () => {
    expect(auctionDateApplies({ source: "copart" })).toBe(true);
    expect(auctionDateApplies({ source: "gov_auction" })).toBe(true);
    expect(auctionDateApplies({ adapterId: "govdeals" })).toBe(true);
    expect(auctionDateApplies({ sellerType: "wholesale" })).toBe(true);
  });

  it("does not grade fixed-price and private inventory on auction timing", () => {
    expect(auctionDateApplies({ source: "carvana" })).toBe(false);
    expect(auctionDateApplies({ source: "independent_dealer" })).toBe(false);
    expect(auctionDateApplies({ sourceType: "dealer" })).toBe(false);
    expect(auctionDateApplies({ sellerType: "private_party" })).toBe(false);
  });

  it("prefers explicit seller evidence over a conflicting source hint", () => {
    expect(auctionDateApplies({ source: "copart", sellerType: "dealer" })).toBe(
      false,
    );
    expect(
      auctionDateApplies({ source: "carvana", sellerType: "auction" }),
    ).toBe(true);
  });
});
