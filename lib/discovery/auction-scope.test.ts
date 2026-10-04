import { describe, expect, it } from "vitest";
import { wantsAuctionInventory } from "./auction-scope";

describe("auction browsing requires intent", () => {
  it("does not mix auctions into ordinary or repairable browsing", () => {
    expect(wantsAuctionInventory({})).toBe(false);
    expect(wantsAuctionInventory({ lane: "all" })).toBe(false);
    expect(wantsAuctionInventory({ lane: "damaged" })).toBe(false);
    expect(wantsAuctionInventory({ sources: ["ae-of-miami"] })).toBe(false);
  });
  it("preserves explicit auction and government searches", () => {
    expect(wantsAuctionInventory({ lane: "auction" })).toBe(true);
    expect(wantsAuctionInventory({ lane: "government" })).toBe(true);
    expect(wantsAuctionInventory({ sellerType: "auction" })).toBe(true);
    expect(wantsAuctionInventory({ sources: ["copart"] })).toBe(true);
    expect(wantsAuctionInventory({ sources: ["govdeals"] })).toBe(true);
  });
});
