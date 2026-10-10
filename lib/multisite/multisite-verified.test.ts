import { describe, expect, it } from "vitest";
import { buildMultiSiteLinks } from "./index";

// URL formats confirmed in a real browser on 2026-10-10 (Kera, deeplink_verification.md):
// search = used Honda Civic, 2016-2022, $5k-$30k, ZIP 60601, 50 mi, plus one extra filter at a time.
// Each case below was loaded and the site's own filter chip, canonical URL or result count changed.
const base = {
  make: "Honda",
  model: "Civic",
  yearMin: 2016,
  yearMax: 2022,
  priceMin: 5000,
  priceMax: 30000,
  zip: "60601",
  radiusMi: 50,
};
const linkFor = (site: string, extra: Record<string, unknown> = {}) => {
  const l = buildMultiSiteLinks(
    { ...base, ...extra },
    { includeUnverified: true },
  ).find((x) => x.site === site);
  if (!l) throw new Error(`no ${site} link`);
  return { ...l, params: new URL(l.url).searchParams };
};

describe("Autotrader (browser-verified)", () => {
  it("base search uses the legacy searchresults.xhtml params Autotrader redirects to its canonical page", () => {
    const l = linkFor("autotrader");
    expect(
      l.url.startsWith(
        "https://www.autotrader.com/cars-for-sale/searchresults.xhtml?",
      ),
    ).toBe(true);
    expect(Object.fromEntries(l.params)).toMatchObject({
      makeCodeList: "HONDA",
      modelCodeList: "CIVIC",
      startYear: "2016",
      endYear: "2022",
      minPrice: "5000",
      maxPrice: "30000",
      zip: "60601",
      searchRadius: "50",
    });
  });

  it.each([
    ["body", "coupe", "vehicleStyleCodes", "COUPE"],
    ["drivetrain", "fwd", "driveGroup", "FWD"],
    ["drivetrain", "awd", "driveGroup", "AWD4WD"],
    ["fuel", "hybrid", "fuelTypeGroup", "HYB"],
    ["transmission", "manual", "transmissionCodes", "MAN"],
    ["milesMax", 50000, "maxMileage", "50000"],
    ["trim", "Sport", "trimCodeList", "CIVIC|Sport"],
  ])("%s=%s is sent as %s=%s", (key, value, param, expected) => {
    expect(linkFor("autotrader", { [key]: value }).params.get(param)).toBe(
      expected,
    );
  });

  it("verified filters are reported as carried, not unconfirmed", () => {
    const l = linkFor("autotrader", {
      trim: "Sport",
      body: "coupe",
      drivetrain: "fwd",
      fuel: "hybrid",
      transmission: "manual",
      milesMax: 50000,
    });
    expect(l.unconfirmed).toBeUndefined();
    expect(l.dropped).toEqual([]);
  });
});

describe("Craigslist (browser-verified)", () => {
  it("base search carries make/model, years, price, postal and distance", () => {
    const l = linkFor("craigslist");
    expect(l.url.startsWith("https://chicago.craigslist.org/search/cta?")).toBe(
      true,
    );
    expect(Object.fromEntries(l.params)).toMatchObject({
      auto_make_model: "honda civic",
      min_auto_year: "2016",
      max_auto_year: "2022",
      min_price: "5000",
      max_price: "30000",
      postal: "60601",
      search_distance: "50",
    });
  });

  it.each([
    ["body", "coupe", "auto_bodytype", "3"],
    ["drivetrain", "fwd", "auto_drivetrain", "1"],
    ["fuel", "hybrid", "auto_fuel_type", "3"],
    ["transmission", "manual", "auto_transmission", "1"],
    ["title", "salvage", "auto_title_status", "2"],
    ["milesMax", 50000, "max_auto_miles", "50000"],
    ["trim", "Sport", "query", "Sport"],
  ])("%s=%s is sent as %s=%s", (key, value, param, expected) => {
    expect(linkFor("craigslist", { [key]: value }).params.get(param)).toBe(
      expected,
    );
  });

  it("all browser-verified filters are reported as carried", () => {
    const l = linkFor("craigslist", {
      body: "coupe",
      drivetrain: "fwd",
      fuel: "hybrid",
      transmission: "manual",
      trim: "Sport",
    });
    expect(l.unconfirmed).toBeUndefined();
    expect(l.dropped).toEqual([]);
  });
});

describe("eBay Motors (browser-verified)", () => {
  it("keyword, price, ZIP and distance; trim and salvage ride in the keyword", () => {
    expect(Object.fromEntries(linkFor("ebay_motors").params)).toEqual({
      _nkw: "honda civic",
      _udlo: "5000",
      _udhi: "30000",
      _stpos: "60601",
      _sadis: "50",
    });
    expect(linkFor("ebay_motors", { trim: "Sport" }).params.get("_nkw")).toBe(
      "honda civic sport",
    );
    expect(
      linkFor("ebay_motors", { title: "salvage" }).params.get("_nkw"),
    ).toBe("honda civic salvage");
  });

  it("never sends the Model Year aspect (it breaks eBay's results page)", () => {
    expect(linkFor("ebay_motors").url).not.toMatch(
      /Model%2520Year|Model%20Year/,
    );
  });
});

describe("Facebook Marketplace (page loads; filters not checkable signed out)", () => {
  it("uses the city search with a quoted make/model, years as words, price and the vehicles category", () => {
    const l = linkFor("facebook_marketplace");
    expect(
      l.url.startsWith("https://www.facebook.com/marketplace/chicago/search?"),
    ).toBe(true);
    expect(l.params.get("query")).toBe(
      '"Honda Civic" 2016 2017 2018 2019 2020 2021 2022',
    );
    expect(l.params.get("minPrice")).toBe("5000");
    expect(l.params.get("maxPrice")).toBe("30000");
    expect(l.params.get("category_id")).toBe("vehicles");
  });
});

describe("Kelley Blue Book (base + body verified; other filters blocked by bot wall)", () => {
  it("base path and body style code", () => {
    const l = linkFor("kbb");
    expect(
      l.url.startsWith("https://www.kbb.com/cars-for-sale/used/honda/civic?"),
    ).toBe(true);
    expect(
      linkFor("kbb", { body: "coupe" }).params.get("vehicleStyleCodes"),
    ).toBe("COUPE");
  });

  it("is shown by default (verified) and carries only base + body", () => {
    const l = buildMultiSiteLinks({
      ...base,
      body: "coupe",
      fuel: "hybrid",
    }).find((x) => x.site === "kbb");
    expect(l?.verified).toBe(true);
    expect(new URL(l!.url).searchParams.get("fuelTypeGroup")).toBeNull();
    expect(l!.dropped).toEqual(["fuel"]);
  });
});

describe("Copart and IAA (keyword search verified; hidden pending a terms check)", () => {
  it("Copart sends make model trim as the free-text query", () => {
    const l = linkFor("copart", { trim: "Sport" });
    expect(l.url.startsWith("https://www.copart.com/lotSearchResults/?")).toBe(
      true,
    );
    expect(l.params.get("free")).toBe("true");
    expect(l.params.get("query")).toBe("honda civic sport");
  });

  it("IAA sends make model trim as Keyword", () => {
    const l = linkFor("iaai", { trim: "Sport" });
    expect(l.url.startsWith("https://www.iaai.com/Search?")).toBe(true);
    expect(l.params.get("Keyword")).toBe("Honda Civic Sport");
  });
});

describe("Edmunds (bot wall in a real browser)", () => {
  it("stays hidden by default", () => {
    expect(buildMultiSiteLinks(base).some((l) => l.site === "edmunds")).toBe(
      false,
    );
  });
});
