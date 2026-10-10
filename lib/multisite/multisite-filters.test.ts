import { describe, expect, it } from "vitest";
import {
  buildMultiSiteLinks,
  normalizeFilters,
  MULTISITE_SITES,
} from "./index";

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

  it("Cars.com carries trim, fuel, transmission and miles (flagged); body and drivetrain are not sent", () => {
    const l = byId().cars_com;
    const u = new URL(l.url);
    expect(u.searchParams.get("keyword")).toBe("Lariat");
    expect(u.searchParams.get("mileage_max")).toBe("90000");
    // Unconfirmed slugs (Cloudflare blocked the browser check): hidden rather than possibly wrong.
    expect(u.searchParams.getAll("body_style_slugs[]")).toEqual([]);
    expect(u.searchParams.getAll("drivetrain_slugs[]")).toEqual([]);
    expect(l.url).not.toMatch(
      /pickup_truck|four_wheel_drive|front_wheel_drive/,
    );
    expect(u.searchParams.getAll("fuel_slugs[]")).toEqual(["gasoline"]);
    expect(u.searchParams.getAll("transmission_slugs[]")).toEqual([
      "automatic",
    ]);
    expect(l.unconfirmed).toEqual(["trim", "fuel", "transmission", "milesMax"]);
    expect([...l.dropped].sort()).toEqual(["body", "drivetrain", "title"]);
  });

  it("Autotrader uses Cox codes, all confirmed; trim needs a model code", () => {
    const l = byId().autotrader;
    const u = new URL(l.url);
    expect(u.searchParams.get("vehicleStyleCodes")).toBe("TRUCKS");
    expect(u.searchParams.get("driveGroup")).toBe("AWD4WD");
    expect(u.searchParams.get("fuelTypeGroup")).toBe("GSL");
    expect(u.searchParams.get("transmissionCodes")).toBe("AUT");
    expect(u.searchParams.get("maxMileage")).toBe("90000");
    expect(l.unconfirmed).toBeUndefined();
    // "F-150" has no single-token model code, so there is nothing to hang the trim on.
    expect(u.searchParams.get("trimCodeList")).toBeNull();
    expect(l.dropped).toContain("trim");
  });

  it("Autotrader sends trim as trimCodeList=MODEL|Trim; non-plain trims are flagged", () => {
    const civic = { make: "Honda", model: "Civic", zip: "60601" };
    const sport = buildMultiSiteLinks({ ...civic, trim: "Sport" }).find(
      (l) => l.site === "autotrader",
    )!;
    expect(new URL(sport.url).searchParams.get("trimCodeList")).toBe(
      "CIVIC|Sport",
    );
    expect(sport.url).toContain("trimCodeList=CIVIC%7CSport");
    expect(sport.dropped).not.toContain("trim");
    expect(sport.unconfirmed).toBeUndefined();
    const exl = buildMultiSiteLinks({
      make: "Honda",
      model: "Accord",
      trim: "EX-L",
    }).find((l) => l.site === "autotrader")!;
    expect(new URL(exl.url).searchParams.get("trimCodeList")).toBe(
      "ACCORD|EX-L",
    );
    expect(exl.unconfirmed).toEqual(["trim"]);
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
    expect(new URL(byId().ebay_motors.url).searchParams.get("_nkw")).toBe(
      "ford f-150 lariat salvage",
    );
    expect(
      new URL(byId().facebook_marketplace.url).searchParams.get("query"),
    ).toContain("Lariat");
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

  it("KBB is shown with base search + body only; Edmunds, Copart and IAA stay hidden", () => {
    const shown = byId();
    for (const id of ["edmunds", "copart", "iaai"])
      expect(shown[id]).toBeUndefined();
    const kbb = shown.kbb;
    expect(kbb.verified).toBe(true);
    const u = new URL(kbb.url);
    expect(kbb.url).toContain(
      "https://www.kbb.com/cars-for-sale/used/ford/f-150?",
    );
    expect(u.searchParams.get("vehicleStyleCodes")).toBe("TRUCKS");
    for (const p of [
      "driveGroup",
      "fuelTypeGroup",
      "transmissionCodes",
      "maxMileage",
    ])
      expect(u.searchParams.get(p), p).toBeNull();
    expect([...kbb.dropped].sort()).toEqual(
      [
        "drivetrain",
        "fuel",
        "milesMax",
        "title",
        "transmission",
        "trim",
      ].sort(),
    );
    expect(kbb.unconfirmed).toBeUndefined();
    const all = byId({ includeUnverified: true });
    expect(all.edmunds.url).toContain("year=2018-2021");
    expect(all.copart.url).toContain("query=ford+f-150+lariat");
    expect(all.iaai.url).toContain("Keyword=Ford+F-150+Lariat");
    // Copart / IAA stay keyword-only: nothing but the free-text query.
    expect(Array.from(new URL(all.copart.url).searchParams.keys())).toEqual([
      "free",
      "query",
    ]);
    expect(Array.from(new URL(all.iaai.url).searchParams.keys())).toEqual([
      "Keyword",
    ]);
  });

  it("never links Carvana or Visor", () => {
    const ids = MULTISITE_SITES.map((s) => s.id as string);
    expect(ids).not.toContain("carvana");
    expect(ids).not.toContain("visor");
  });
});
