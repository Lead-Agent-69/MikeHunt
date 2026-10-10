import { describe, it, expect, vi } from "vitest";
import {
  soldCaptureLqdtEnabled,
  fetchMaestroPage,
  fetchMaestroDetail,
  MAESTRO_SEARCH_MAX_BYTES,
  MAESTRO_DETAIL_MAX_BYTES,
  maestroAssetToDeal,
  maestroAssetToSoldComp,
  type MaestroAsset,
} from "./lqdt-maestro";

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

describe("maestroAssetToSoldComp — sold lots kept as comps (were discarded)", () => {
  const NOW = new Date("2026-10-10T12:00:00Z");
  const SOLD: MaestroAsset = {
    ...DETAIL,
    isSoldAuction: true,
    currentBid: 4250,
    assetAuctionEndDateUtc: "2026-10-01T18:00:00Z",
  };

  it("still keeps sold lots out of live deals", () => {
    expect(maestroAssetToDeal(SOLD, GD)).toBeNull();
  });

  it("maps a GovDeals sold lot to a labelled sold comp", () => {
    const c = maestroAssetToSoldComp(SOLD, GD, NOW)!;
    expect(c).toMatchObject({
      source: "govdeals",
      source_item_id: "gd-7-31897",
      source_url: "https://www.govdeals.com/asset/7/31897",
      basis: "sold",
      sale_channel: "gov_surplus_auction",
      sold_price: 4250,
      sold_at: "2026-10-01T18:00:00.000Z",
      year: 2000,
      make: "Toyota",
      model: "Avalon",
      vin: "JN1AR5EF5EM270025",
      mileage: 65000,
      location_state: "CA",
    });
    expect(c.title).toMatch(
      /GovDeals sold lot, winning bid before buyer's premium/,
    );
    expect(c.attribution).toMatch(/GovDeals/);
  });

  it("labels AllSurplus separately", () => {
    const c = maestroAssetToSoldComp(SOLD, AD, NOW)!;
    expect(c.source).toBe("allsurplus");
    expect(c.source_item_id).toBe("as-7-31897");
  });

  it("ignores live lots, future end dates, scrap prices and non-vehicles", () => {
    expect(
      maestroAssetToSoldComp({ ...SOLD, isSoldAuction: false }, GD, NOW),
    ).toBeNull();
    expect(
      maestroAssetToSoldComp(
        { ...SOLD, assetAuctionEndDateUtc: "2026-11-01T00:00:00Z" },
        GD,
        NOW,
      ),
    ).toBeNull();
    expect(
      maestroAssetToSoldComp({ ...SOLD, currentBid: 40 }, GD, NOW),
    ).toBeNull();
    expect(
      maestroAssetToSoldComp(
        {
          ...SOLD,
          assetShortDescription: "2015 Big Tex Utility Trailer",
          makebrand: "Big Tex",
          model: "Trailer",
        },
        GD,
        NOW,
      ),
    ).toBeNull();
  });
});

describe("SOLD_CAPTURE_LQDT (default ON, accepted risk 2026-10-10)", () => {
  it("is on when unset or empty", () => {
    expect(soldCaptureLqdtEnabled({})).toBe(true);
    expect(soldCaptureLqdtEnabled({ SOLD_CAPTURE_LQDT: "" })).toBe(true);
    expect(soldCaptureLqdtEnabled({ SOLD_CAPTURE_LQDT: "1" })).toBe(true);
  });
  it("turns off with 0 / false / off / no", () => {
    for (const v of ["0", "false", "OFF", " no "])
      expect(soldCaptureLqdtEnabled({ SOLD_CAPTURE_LQDT: v })).toBe(false);
  });
});

describe("maestro fetch bounds (Ren #316)", () => {
  const big = (n: number) =>
    new Response("x", {
      status: 200,
      headers: { "content-length": String(n) },
    });

  it("search: timeout signal on every call; oversize page throws (caught by the page loop)", async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return big(MAESTRO_SEARCH_MAX_BYTES + 1);
    });
    await expect(
      fetchMaestroPage("12", ["94A"], 1, 120, f as unknown as typeof fetch),
    ).rejects.toThrow(/exceeds cap/);
  });

  it("search: a normal page parses", async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ assetSearchResults: [{ assetId: 1 }] }), {
          status: 200,
        }),
    );
    expect(
      await fetchMaestroPage(
        "12",
        ["94A"],
        1,
        120,
        f as unknown as typeof fetch,
      ),
    ).toEqual([{ assetId: 1 }]);
  });

  it("detail: timeout signal + 1 MB cap", async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return big(MAESTRO_DETAIL_MAX_BYTES + 1);
    });
    await expect(
      fetchMaestroDetail(
        { assetId: 1, accountId: 2 } as any,
        "12",
        f as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/exceeds cap/);
  });
});
