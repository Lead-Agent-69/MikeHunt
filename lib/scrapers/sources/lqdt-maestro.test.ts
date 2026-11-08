import { describe, it, expect } from "vitest";
import { maestroAssetToDeal, type MaestroAsset } from "./lqdt-maestro";
import { listingPriceEvidence } from "@/lib/deals/acquisition-price";

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

const DETAIL: MaestroAsset = {
  ...BASE,
  vinserial: "JN1AR5EF5EM270025",
  meter: "Miles",
  meterCount: 65000,
  meterAccurate: "Yes",
  assetAttributeGroups: [
    {
      name: "Details",
      assetAttributes: [
        { label: "VIN", value: "JN1AR5EF5EM270025" },
        { label: "Odometer", value: "65,000 Miles (Accurate)" },
        { label: "Title Restriction", value: "Clean Title" },
        { label: "Trim", value: "Premium" },
      ],
    },
  ],
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

  it("recovers the detail gallery, deduplicates the cover and rejects other lots or hosts", () => {
    const d = maestroAssetToDeal(
      {
        ...BASE,
        assetPhotos: [
          "/photos/31897/31897_7_abc.jpg?cb=1",
          "/photos/31897/31897_7_second.jpg?cb=2",
          "https://webassets.lqdt1.com/assets/photos/31897/31897_7_third.png",
          "/photos/31897/31897_8_other.jpg",
          "https://unrelated.example/31897_7_ad.jpg",
          "/photos/31897/../31897_7_bad.jpg",
          "/photos/31897/31897_7_document.pdf",
        ],
      },
      GD,
    )!;
    expect(d.images).toEqual(
      ["abc.jpg", "second.jpg", "third.png"].map(
        (file) =>
          `https://webassets.lqdt1.com/assets/photos/31897/31897_7_${file}`,
      ),
    );
  });

  it("retains the existing twenty-photo bound", () => {
    expect(
      maestroAssetToDeal(
        {
          ...BASE,
          assetPhotos: Array.from(
            { length: 40 },
            (_, i) => `/photos/31897/31897_7_photo${i}.jpg`,
          ),
        },
        GD,
      )!.images,
    ).toHaveLength(20);
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
    expect(ad.source_url).toBe("https://www.allsurplus.com/asset/7/31897");
  });
});

describe("maestroAssetToDeal — detail fields", () => {
  it("maps VIN, mileage, trim, title proof, and meter accuracy from detail payloads", () => {
    const d = maestroAssetToDeal(DETAIL, GD)!;

    expect(d.vin).toBe("JN1AR5EF5EM270025");
    expect(d.mileage).toBe(65000);
    expect(d.trim).toBe("Premium");
    expect(d.metadata).toMatchObject({
      titleType: "Clean Title",
      meterAccurate: "Yes",
    });
    expect(d.options).toMatchObject({
      titleType: "Clean Title",
      meterAccurate: "Yes",
      auction: { marketplace: "govdeals" },
    });
    expect(d.condition).toBe("clean_title");
    expect(d.title_source).toBe("listing");
  });

  it("rejects unknown/non-actual mileage text instead of storing fake odometer proof", () => {
    const d = maestroAssetToDeal(
      {
        ...DETAIL,
        meterCount: undefined,
        assetAttributeGroups: [
          {
            name: "Details",
            assetAttributes: [
              { label: "Odometer", value: "Not Actual / Exempt" },
            ],
          },
        ],
      },
      GD,
    )!;

    expect(d.mileage).toBeUndefined();
  });

  it("preserves real detail aliases and buyback disclosure without inventing running or clean condition", () => {
    const d = maestroAssetToDeal(
      {
        ...BASE,
        ...DETAIL,
        assetShortDesc: "2000 Toyota Avalon — seller detail",
        assetLongDesc:
          "Title is branded Buyback<br>Not salvage or rebuilt<br>Every car must be towed.<script>doNotDisplay()</script>",
        meterCount: 105637,
        meterAccurate: "Unknown",
      },
      GD,
    )!;
    expect(d.title).toBe("2000 Toyota Avalon — seller detail");
    expect(d.condition).toBeUndefined();
    expect(d.title_source).toBeUndefined();
    expect(d.mileage).toBeUndefined();
    expect(d.options).toMatchObject({
      titleType: "Buyback (seller-reported)",
      reportedOdometer: { value: 105637, accuracy: "Unknown" },
    });
    expect(d.options?.description).toContain("Every car must be towed.");
    expect(d.options?.description).not.toMatch(/<|doNotDisplay/);
    expect(listingPriceEvidence(d)?.kind).toBe("current_bid");
  });

  it("does not assume operability or a title when only the search card is available", () => {
    const d = maestroAssetToDeal(BASE, GD)!;
    expect(d.condition).toBeUndefined();
    expect(d.options?.titleType).toBeUndefined();
    expect(d.options?.priceEvidence.kind).toBe("current_bid");
  });

  it("does not normalize a negated title disclosure as clean", () => {
    const d = maestroAssetToDeal(
      { ...BASE, titleRestrictionText: "Not a clean title" },
      GD,
    )!;
    expect(d.condition).toBeUndefined();
    expect(d.options?.titleType).toBe("Not a clean title");
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

it("keeps an opening bid out of current bid and cash price presentation", () => {
  const deal = maestroAssetToDeal(
    {
      ...BASE,
      bidCount: 0,
      assetBidPrice: 750,
      currentBid: 750,
      assetLongDesc: "Sale price: $750",
    },
    AD,
  )!;
  expect(deal.options?.auction.openingBid).toBe(750);
  expect(listingPriceEvidence(deal)).toMatchObject({
    kind: "current_bid",
    currentBid: undefined,
    askingPrice: undefined,
  });
});

it("retains a kilometer odometer disclosure without treating it as miles", () => {
  const deal = maestroAssetToDeal({ ...DETAIL, meter: "Kilometers" }, GD)!;
  expect(deal.mileage).toBeUndefined();
  expect(deal.options?.reportedOdometer).toEqual({
    value: 65000,
    unit: "Kilometers",
    accuracy: "Yes",
  });
});

it("keeps a reported meter count separate when accuracy is missing", () => {
  const deal = maestroAssetToDeal(
    {
      ...DETAIL,
      meterAccurate: undefined,
      assetAttributeGroups: undefined,
    },
    GD,
  )!;
  expect(deal.mileage).toBeUndefined();
  expect(deal.options?.reportedOdometer).toMatchObject({
    value: 65000,
    accuracy: "Not reported",
  });
});
