import { describe, it, expect } from "vitest";
import { govDealsAssetToDeal } from "./govdeals";

// Mirrors a real maestro.lqdt1.com/search/list assetSearchResults row.
const ASSET = {
  accountId: 31897,
  assetId: 7,
  assetShortDescription: "2000 Toyota Avalon XL",
  makebrand: "Toyota",
  model: "Avalon",
  modelYear: "2000",
  currentBid: 10.0,
  bidCount: 3,
  locationCity: "Santa Ana",
  locationState: "CA",
  locationZip: "92701",
  companyName: "Alberto's Towing LLC",
  assetAuctionEndDateUtc: "2026-07-01T17:00:00Z",
  lotNumber: "7",
  photo: "31897_7_fd55d055-3be8-480c-b13c-b4548aa0af98.jpg",
  isSoldAuction: false,
};

describe("govDealsAssetToDeal", () => {
  it("maps a vehicle asset to a gov_auction deal", () => {
    const d = govDealsAssetToDeal(ASSET)!;
    expect(d).not.toBeNull();
    expect(d.source).toBe("gov_auction");
    expect(d.source_deal_id).toBe("gd-7-31897");
    expect(d.source_url).toBe("https://www.govdeals.com/asset/7/31897");
    expect(d.year).toBe(2000);
    expect(d.make).toBe("Toyota");
    expect(d.model).toBe("Avalon");
    expect(d.ask_price).toBe(10);
    expect(d.location_state).toBe("CA");
    expect(d.seller_type).toBe("auction");
    expect(d.auction_end).toBe("2026-07-01T17:00:00Z");
    // A7: full image URL built from accountId + photo filename (cache-buster stripped).
    expect(d.images).toEqual([
      "https://webassets.lqdt1.com/assets/photos/31897/31897_7_fd55d055-3be8-480c-b13c-b4548aa0af98.jpg",
    ]);
  });

  it("rejects sold lots", () => {
    expect(govDealsAssetToDeal({ ...ASSET, isSoldAuction: true })).toBeNull();
  });

  it("rejects rows with no model year (non-vehicle)", () => {
    expect(govDealsAssetToDeal({ ...ASSET, modelYear: undefined })).toBeNull();
  });

  it("rejects rows with no live bid", () => {
    expect(
      govDealsAssetToDeal({ ...ASSET, currentBid: 0, assetBidPrice: 0 }),
    ).toBeNull();
  });
});
