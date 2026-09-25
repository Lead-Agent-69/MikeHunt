import { describe, it, expect } from "vitest";
import { maestroAssetToDeal, type MaestroAsset } from "./lqdt-maestro";

const GD = {
  source: "gov_auction",
  idPrefix: "gd",
  defaultSeller: "GovDeals (gov surplus)",
  requireUS: false,
};
const AD = {
  source: "gov_auction",
  idPrefix: "as",
  defaultSeller: "AllSurplus",
  requireUS: true,
};

const BASE: MaestroAsset = {
  accountId: 31897,
  assetId: 7,
  assetShortDescription: "2000 Toyota Avalon XL",
  makebrand: "Toyota",
  model: "Avalon",
  modelYear: "2000",
  currentBid: 10,
  locationState: "CA",
  country: "USA",
  photo: "31897_7_abc.jpg?cb=260623195503",
  isSoldAuction: false,
};

describe("maestroAssetToDeal — images (A7)", () => {
  it("builds the full image URL and strips the cache-buster", () => {
    const d = maestroAssetToDeal(BASE, GD)!;
    expect(d.images).toEqual([
      "https://webassets.lqdt1.com/assets/photos/31897/31897_7_abc.jpg",
    ]);
  });

  it("yields no image when photo is absent", () => {
    const d = maestroAssetToDeal({ ...BASE, photo: undefined }, GD)!;
    expect(d.images).toEqual([]);
  });
});

describe("maestroAssetToDeal — idPrefix + marketplace", () => {
  it("namespaces source_deal_id and tags marketplace per source", () => {
    const gd = maestroAssetToDeal(BASE, GD)!;
    expect(gd.source_deal_id).toBe("gd-7-31897");
    expect((gd.metadata as Record<string, unknown>).marketplace).toBe(
      "govdeals",
    );

    const ad = maestroAssetToDeal(BASE, AD)!;
    expect(ad.source_deal_id).toBe("as-7-31897");
    expect((ad.metadata as Record<string, unknown>).marketplace).toBe(
      "allsurplus",
    );
  });
});

describe("maestroAssetToDeal — requireUS filter (AllSurplus is international)", () => {
  it("keeps US lots", () => {
    expect(maestroAssetToDeal({ ...BASE, country: "USA" }, AD)).not.toBeNull();
  });

  it("drops non-US lots (e.g. South Africa)", () => {
    const za = { ...BASE, country: "ZAF", locationState: "ZA-GT" };
    expect(maestroAssetToDeal(za, AD)).toBeNull();
    // ...but GovDeals (requireUS:false) wouldn't filter on country at all.
    expect(maestroAssetToDeal(za, GD)).not.toBeNull();
  });

  it("falls back to a 2-letter US state when country is missing", () => {
    const noCountry = { ...BASE, country: undefined };
    expect(
      maestroAssetToDeal({ ...noCountry, locationState: "TX" }, AD),
    ).not.toBeNull();
    expect(
      maestroAssetToDeal({ ...noCountry, locationState: "ZA-GT" }, AD),
    ).toBeNull();
  });
});
