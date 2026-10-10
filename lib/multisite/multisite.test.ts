import { describe, it, expect } from "vitest";
import {
  autolist,
  autotempest,
  autotrader,
  cargurus,
  carmax,
  carsCom,
  craigslist,
  ebayMotors,
  facebookMarketplace,
  truecar,
  EXCLUDED_SITES,
  MULTISITE_SITES,
} from "./sites";
import { buildMultiSiteLinks, normalizeFilters } from "./index";

// Kera's audit test search: used Honda Civic, 2018–2022, $10k–$25k, ZIP 60601, 50 mi.
const civic = normalizeFilters({
  make: "Honda",
  model: "Civic",
  yearMin: 2018,
  yearMax: 2022,
  priceMin: 10000,
  priceMax: 25000,
  zip: "60601",
  radiusMi: 50,
});

const params = (url: string) => new URL(url).searchParams;

describe("normalizeFilters", () => {
  it("drops UI placeholders and parses money", () => {
    expect(
      normalizeFilters({
        make: "all",
        model: "any",
        priceMax: "$25,000",
        zip: "6060",
      }),
    ).toEqual({
      make: undefined,
      model: undefined,
      yearMin: undefined,
      yearMax: undefined,
      priceMin: undefined,
      priceMax: 25000,
      milesMax: undefined,
      zip: undefined,
      radiusMi: undefined,
      title: undefined,
    });
  });

  it("swaps reversed ranges", () => {
    const f = normalizeFilters({
      yearMin: 2022,
      yearMax: 2018,
      priceMin: 9,
      priceMax: 5,
    });
    expect([f.yearMin, f.yearMax, f.priceMin, f.priceMax]).toEqual([
      2018, 2022, 5, 9,
    ]);
  });
});

describe("site builders (Kera-confirmed formats)", () => {
  it("Cars.com", () => {
    const url = carsCom.build(civic)!.url;
    expect(url.startsWith("https://www.cars.com/shopping/results/?")).toBe(
      true,
    );
    const p = params(url);
    expect(p.get("stock_type")).toBe("used");
    expect(p.getAll("makes[]")).toEqual(["honda"]);
    expect(p.getAll("models[]")).toEqual(["honda-civic"]);
    expect(p.get("year_min")).toBe("2018");
    expect(p.get("year_max")).toBe("2022");
    expect(p.get("list_price_min")).toBe("10000");
    expect(p.get("list_price_max")).toBe("25000");
    expect(p.get("zip")).toBe("60601");
    expect(p.get("maximum_distance")).toBe("50");
  });

  it("Cars.com snaps radius to an allowed value", () => {
    expect(
      params(carsCom.build({ ...civic, radiusMi: 60 })!.url).get(
        "maximum_distance",
      ),
    ).toBe("75");
    expect(
      params(carsCom.build({ ...civic, radiusMi: 900 })!.url).get(
        "maximum_distance",
      ),
    ).toBe("all");
  });

  it("CarGurus uses the documented Car Selector link with entity ids", () => {
    const l = cargurus.build(civic)!;
    expect(l.url).toBe(
      "https://www.cargurus.com/Cars/api/1.0/carselector/listingSearch.action?searchType=USED&entityId=d586&postalCode=60601&distance=50",
    );
    expect(l.dropped).toEqual(["yearMin", "yearMax", "priceMin", "priceMax"]);
  });

  it("CarGurus is skipped when we don't know the entity id", () => {
    expect(cargurus.build({ make: "Zastava" })).toBeNull();
  });

  it("Autotrader legacy search with make/model codes", () => {
    const p = params(autotrader.build(civic)!.url);
    expect(p.get("makeCodeList")).toBe("HONDA");
    expect(p.get("modelCodeList")).toBe("CIVIC");
    expect(p.get("startYear")).toBe("2018");
    expect(p.get("endYear")).toBe("2022");
    expect(p.get("zip")).toBe("60601");
    expect(p.get("searchRadius")).toBe("50");
    expect(
      params(autotrader.build({ make: "Chevrolet" })!.url).get("makeCodeList"),
    ).toBe("CHEV");
  });

  it("Autotrader leaves a multi-word model off and reports it", () => {
    const l = autotrader.build({ make: "Ford", model: "Grand Marquis" })!;
    expect(params(l.url).get("modelCodeList")).toBeNull();
    expect(l.dropped).toContain("model");
  });

  it("eBay Motors keeps years out of the URL", () => {
    const l = ebayMotors.build(civic)!;
    expect(l.url).toBe(
      "https://www.ebay.com/sch/Cars-Trucks/6001/i.html?_nkw=honda+civic&_udlo=10000&_udhi=25000&_stpos=60601&_sadis=50",
    );
    expect(l.dropped).toEqual(["yearMin", "yearMax"]);
  });

  it("eBay folds a salvage/rebuilt title into keywords", () => {
    expect(
      params(ebayMotors.build({ make: "Ford", title: "salvage" })!.url).get(
        "_nkw",
      ),
    ).toBe("ford salvage");
  });

  it("Craigslist picks the state's site from the ZIP and carries title status", () => {
    const l = craigslist.build({
      ...civic,
      title: "rebuilt",
      milesMax: 90000,
    })!;
    expect(l.url.startsWith("https://chicago.craigslist.org/search/cta?")).toBe(
      true,
    );
    const p = params(l.url);
    expect(p.get("auto_make_model")).toBe("honda civic");
    expect(p.get("min_auto_year")).toBe("2018");
    expect(p.get("max_price")).toBe("25000");
    expect(p.get("max_auto_miles")).toBe("90000");
    expect(p.get("auto_title_status")).toBe("3");
    expect(p.get("postal")).toBe("60601");
    expect(p.get("search_distance")).toBe("50");
  });

  it("Craigslist needs a ZIP", () => {
    expect(craigslist.build({ make: "Honda" })).toBeNull();
  });

  it("Facebook Marketplace uses AutoTempest's city search format", () => {
    const l = facebookMarketplace.build(civic)!;
    expect(
      l.url.startsWith("https://www.facebook.com/marketplace/chicago/search?"),
    ).toBe(true);
    const p = params(l.url);
    expect(p.get("query")).toBe('"Honda Civic" 2018 2019 2020 2021 2022');
    expect(p.get("minPrice")).toBe("10000");
    expect(p.get("category_id")).toBe("vehicles");
    expect(l.verified).toBe(true);
  });

  it("Facebook without a known city falls back to an unverified location-free search", () => {
    const l = facebookMarketplace.build({ make: "Honda", zip: "59101" })!;
    expect(
      l.url.startsWith("https://www.facebook.com/marketplace/search?"),
    ).toBe(true);
    expect(l.verified).toBe(false);
  });

  it("CarMax year/price ranges, location dropped", () => {
    const l = carmax.build(civic)!;
    expect(l.url).toBe(
      "https://www.carmax.com/cars/honda/civic?year=2018-2022&price=10000-25000",
    );
    expect(l.dropped).toEqual(["zip", "radiusMi"]);
  });

  it("Autolist puts filters in the hash", () => {
    expect(autolist.build(civic)!.url).toBe(
      "https://www.autolist.com/listings#make=Honda&model=Civic&year_min=2018&year_max=2022&price_min=10000&price_max=25000&location=60601&radius=50",
    );
  });

  it("AutoTempest lowercases make/model", () => {
    expect(autotempest.build(civic)!.url).toBe(
      "https://www.autotempest.com/results?make=honda&model=civic&zip=60601&radius=50&minyear=2018&maxyear=2022&minprice=10000&maxprice=25000",
    );
  });

  it("TrueCar is marked unverified", () => {
    expect(truecar.verified).toBe(false);
  });
});

describe("buildMultiSiteLinks", () => {
  it("returns only verified links by default, in display order", () => {
    const sites = buildMultiSiteLinks(civic).map((l) => l.site);
    expect(sites).toEqual([
      "cars_com",
      "autotrader",
      "cargurus",
      "ebay_motors",
      "facebook_marketplace",
      "craigslist",
      "carmax",
      "autolist",
      "autotempest",
      "kbb",
    ]);
  });

  it("never links to Carvana or Visor", () => {
    const all = buildMultiSiteLinks(civic, { includeUnverified: true });
    expect(all.some((l) => /carvana\.com|visor\.vin/.test(l.url))).toBe(false);
    expect(MULTISITE_SITES.map((s) => s.id)).not.toContain("carvana");
    expect(Object.keys(EXCLUDED_SITES)).toEqual(["carvana", "visor"]);
  });

  it("still gives useful links with no filters at all", () => {
    expect(buildMultiSiteLinks({}).map((l) => l.site)).toEqual([
      "cars_com",
      "autotrader",
    ]);
  });
});
