import { describe, expect, it } from "vitest";
import { buildMultiSiteLinks, normalizeFilters, MULTISITE_SITES } from "./index";

const full = {
  make: "Ford",
  model: "F-150",
  trim: "Lariat",
  yearMin: 2018,
  yearMax: 2021,
  priceMin: 15000,
  priceMax: 30000,
  milesMax: 90000,
  zip: "60601",
  radiusMi: 100,
  title: "salvage",
  body: "Pickup",
  drivetrain: "4x4",
  fuel: "Gasoline",
  transmission: "auto",
};

const byId = (opts = {}) =>
  Object.fromEntries(buildMultiSiteLinks(full, opts).map((l) => [l.site, l]));

describe("multisite full filters", () => {
  it("normalizes body / drivetrain / fuel / transmission aliases", () => {
    expect(normalizeFilters(full)).toMatchObject({
      trim: "Lariat",
      body: "truck",
      drivetrain: "4wd",
      fuel: "gas",
      transmission: "automatic",
    });
    expect(normalizeFilters({ body: "spaceship", fuel: "" })).toMatchObject({
      body: undefined,
      fuel: undefined,
    });
  });

  it("Cars.com carries trim, body, drivetrain, fuel and transmission (flagged unconfirmed)", () => {
    const l = byId().cars_com;
    const u = new URL(l.url);
    expect(u.searchParams.get("keyword")).toBe("Lariat");
    expect(u.searchParams.getAll("body_style_slugs[]")).toEqual(["pickup_truck"]);
    expect(u.searchParams.getAll("drivetrain_slugs[]")).toEqual(["four_wheel_drive"]);
    expect(u.searchParams.getAll("fuel_slugs[]")).toEqual(["gasoline"]);
    expect(u.searchParams.getAll("transmission_slugs[]")).toEqual(["automatic"]);
    expect(l.unconfirmed).toEqual(["trim", "body", "drivetrain", "fuel", "transmission"]);
    expect(l.dropped).toEqual(["title"]);
  });

  it("Autotrader uses Cox codes; trim is reported as dropped", () => {
    const l = byId().autotrader;
    const u = new URL(l.url);
    expect(u.searchParams.get("vehicleStyleCodes")).toBe("TRUCKS");
    expect(u.searchParams.get("driveGroup")).toBe("AWD4WD");
    expect(u.searchParams.get("fuelTypeGroup")).toBe("GSL");
    expect(u.searchParams.get("transmissionCodes")).toBe("AUT");
    expect(l.dropped).toContain("trim");
  });

  it("Craigslist maps its auto_* codes and the trim query", () => {
    const u = new URL(byId().craigslist.url);
    expect(u.searchParams.get("auto_bodytype")).toBe("7");
    expect(u.searchParams.get("auto_drivetrain")).toBe("3");
    expect(u.searchParams.get("auto_fuel_type")).toBe("1");
    expect(u.searchParams.get("auto_transmission")).toBe("2");
    expect(u.searchParams.get("auto_title_status")).toBe("2");
    expect(u.searchParams.get("query")).toBe("Lariat");
  });

  it("keyword sites put the trim in the search words", () => {
    expect(new URL(byId().ebay_motors.url).searchParams.get("_nkw")).toBe("ford f-150 lariat salvage");
    expect(new URL(byId().facebook_marketplace.url).searchParams.get("query")).toContain("Lariat");
  });

  it("every link reports the filters it could not carry", () => {
    for (const l of buildMultiSiteLinks(full, { includeUnverified: true })) {
      const carried = new Set([...l.dropped, ...(l.unconfirmed || [])]);
      for (const k of ["body", "drivetrain", "fuel", "transmission"] as const) {
        const inUrl = /body|style|drive|fuel|transmission|auto_/i.test(l.url);
        if (!inUrl) expect(carried.has(k), `${l.site} ${k}`).toBe(true);
      }
    }
  });

  it("new big sites are link-only and stay hidden until a browser confirms their format", () => {
    const shown = byId();
    for (const id of ["kbb", "edmunds", "copart", "iaai"]) expect(shown[id]).toBeUndefined();
    const all = byId({ includeUnverified: true });
    expect(all.kbb.url).toContain("https://www.kbb.com/cars-for-sale/used/ford/f-150?");
    expect(all.edmunds.url).toContain("year=2018-2021");
    expect(all.copart.url).toContain("query=ford+f-150+lariat");
    expect(all.iaai.url).toContain("Keyword=Ford+F-150+Lariat");
  });

  it("never links Carvana or Visor", () => {
    const ids = MULTISITE_SITES.map((s) => s.id as string);
    expect(ids).not.toContain("carvana");
    expect(ids).not.toContain("visor");
  });
});
