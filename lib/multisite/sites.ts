/**
 * "Search on X" deep links. We never fetch, frame or proxy these pages: the buyer's own browser
 * opens the site's public search with their filters already applied (AutoTempest's model).
 *
 * URL formats follow Kera's parity audit (/workspace/mikehunt-audit/competitor_parity.md §3,
 * confirmed in a real browser 2026-10-09). Excluded on purpose:
 *  - Carvana: terms forbid hyperlinking to the service without written permission.
 *  - Visor: terms bar unauthorized linking and use "as part of any effort to compete".
 */
import { zipToState } from "@/lib/geo/zip-state";
import { CRAIGSLIST_SITE_BY_STATE, FACEBOOK_CITY_BY_STATE } from "./places";
import { present, qs, slug, snapRadius, yearsList } from "./normalize";
import type { MultiSiteFilters, MultiSiteLink, MultiSiteSite } from "./types";

/** Sites we will not link to (terms), with the reason. */
export const EXCLUDED_SITES: Record<string, string> = {
  carvana:
    "Carvana terms: users may not hyperlink to the Service without written permission.",
  visor:
    "Visor terms bar unauthorized linking and use as part of an effort to compete.",
};

const makeModel = (f: MultiSiteFilters) =>
  [f.make, f.model].filter(Boolean).join(" ");

const link = (
  site: MultiSiteSite,
  url: string,
  f: MultiSiteFilters,
  dropped: (keyof MultiSiteFilters)[],
  verified = site.verified,
): MultiSiteLink => ({
  site: site.id,
  label: site.label,
  url,
  dropped: present(f, dropped),
  verified,
});

export const autotempest: MultiSiteSite = {
  id: "autotempest",
  label: "AutoTempest",
  verified: true,
  build(f) {
    if (!f.make) return null;
    const url = `https://www.autotempest.com/results?${qs({
      make: f.make.toLowerCase(),
      model: f.model?.toLowerCase(),
      zip: f.zip,
      radius: f.zip ? f.radiusMi : undefined,
      minyear: f.yearMin,
      maxyear: f.yearMax,
      minprice: f.priceMin,
      maxprice: f.priceMax,
      maxmiles: f.milesMax,
    })}`;
    return link(this, url, f, ["title"]);
  },
};

const CARS_COM_RADII = [10, 20, 30, 40, 50, 75, 100, 150, 200, 250, 500];
export const carsCom: MultiSiteSite = {
  id: "cars_com",
  label: "Cars.com",
  verified: true,
  build(f) {
    const make = f.make ? slug(f.make) : undefined;
    const url = `https://www.cars.com/shopping/results/?${qs({
      stock_type: "used",
      "makes[]": make ? [make] : undefined,
      "models[]": make && f.model ? [`${make}-${slug(f.model)}`] : undefined,
      year_min: f.yearMin,
      year_max: f.yearMax,
      list_price_min: f.priceMin,
      list_price_max: f.priceMax,
      mileage_max: f.milesMax,
      zip: f.zip,
      maximum_distance: f.zip
        ? f.radiusMi && f.radiusMi > 500
          ? "all"
          : snapRadius(f.radiusMi, CARS_COM_RADII)
        : undefined,
    })}`;
    return link(this, url, f, ["title"]);
  },
};

/**
 * CarGurus: their documented Car Selector link (developer docs) is the sanctioned way to send users
 * to results, and needs CarGurus' own entity id. We only link when we know it.
 * Ids come from CarGurus' documented listModels endpoint; extend as confirmed.
 */
export const CARGURUS_ENTITY_IDS: Record<string, string> = {
  honda: "m6",
  "honda civic": "d586",
};
export const cargurus: MultiSiteSite = {
  id: "cargurus",
  label: "CarGurus",
  verified: true,
  build(f) {
    if (!f.make) return null;
    const key = makeModel(f).toLowerCase();
    const entity =
      (f.model && CARGURUS_ENTITY_IDS[key]) ||
      CARGURUS_ENTITY_IDS[f.make.toLowerCase()];
    if (!entity) return null;
    const modelMissed = Boolean(f.model && !CARGURUS_ENTITY_IDS[key]);
    const url = `https://www.cargurus.com/Cars/api/1.0/carselector/listingSearch.action?${qs(
      {
        searchType: "USED",
        entityId: entity,
        postalCode: f.zip,
        distance: f.zip ? f.radiusMi : undefined,
      },
    )}`;
    return link(this, url, f, [
      ...(modelMissed ? (["model"] as const) : []),
      "yearMin",
      "yearMax",
      "priceMin",
      "priceMax",
      "milesMax",
      "title",
    ]);
  },
};

/** Autotrader make codes that differ from the plain uppercase name. */
const AUTOTRADER_MAKE_CODES: Record<string, string> = {
  chevrolet: "CHEV",
  chevy: "CHEV",
  "mercedes-benz": "MB",
  mercedes: "MB",
  volkswagen: "VOLKS",
  "land rover": "ROV",
  cadillac: "CAD",
  lincoln: "LINC",
  chrysler: "CHRY",
  mitsubishi: "MIT",
  infiniti: "INFIN",
  hyundai: "HYUND",
  porsche: "POR",
  jaguar: "JAG",
  subaru: "SUB",
};
export const autotrader: MultiSiteSite = {
  id: "autotrader",
  label: "Autotrader",
  verified: true,
  build(f) {
    const make = f.make
      ? AUTOTRADER_MAKE_CODES[f.make.toLowerCase()] ||
        f.make.toUpperCase().replace(/[^A-Z0-9]/g, "")
      : undefined;
    // Single-word models map to their code (CIVIC, CAMRY). Multi-word codes vary, so we leave the
    // model off rather than send a wrong code.
    const modelCode =
      make && f.model && /^[a-z0-9]+$/i.test(f.model)
        ? f.model.toUpperCase()
        : undefined;
    const url = `https://www.autotrader.com/cars-for-sale/searchresults.xhtml?${qs(
      {
        makeCodeList: make,
        modelCodeList: modelCode,
        startYear: f.yearMin,
        endYear: f.yearMax,
        minPrice: f.priceMin,
        maxPrice: f.priceMax,
        maxMileage: f.milesMax,
        zip: f.zip,
        searchRadius: f.zip ? f.radiusMi : undefined,
      },
    )}`;
    return link(this, url, f, [
      ...(f.model && !modelCode ? (["model"] as const) : []),
      "title",
    ]);
  },
};

export const ebayMotors: MultiSiteSite = {
  id: "ebay_motors",
  label: "eBay Motors",
  verified: true,
  build(f) {
    const words = [
      f.make,
      f.model,
      f.title === "salvage" || f.title === "rebuilt" ? f.title : "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!words) return null;
    // Year filters break eBay's search page (audit), so years stay off.
    const url = `https://www.ebay.com/sch/Cars-Trucks/6001/i.html?${qs({
      _nkw: words,
      _udlo: f.priceMin,
      _udhi: f.priceMax,
      _stpos: f.zip,
      _sadis: f.zip ? f.radiusMi : undefined,
    })}`;
    return link(this, url, f, [
      "yearMin",
      "yearMax",
      "milesMax",
      ...(f.title === "clean" ? (["title"] as const) : []),
    ]);
  },
};

const CL_TITLE: Record<string, number> = { clean: 1, salvage: 2, rebuilt: 3 };
export const craigslist: MultiSiteSite = {
  id: "craigslist",
  label: "Craigslist",
  verified: true,
  build(f) {
    const state = f.zip ? zipToState(f.zip) : null;
    const site = state ? CRAIGSLIST_SITE_BY_STATE[state] : undefined;
    if (!site) return null; // Craigslist search is per-city; without a ZIP we can't pick one.
    const url = `https://${site}.craigslist.org/search/cta?${qs({
      auto_make_model: makeModel(f).toLowerCase() || undefined,
      min_auto_year: f.yearMin,
      max_auto_year: f.yearMax,
      min_price: f.priceMin,
      max_price: f.priceMax,
      max_auto_miles: f.milesMax,
      auto_title_status: f.title ? CL_TITLE[f.title] : undefined,
      postal: f.zip,
      search_distance: f.radiusMi,
    })}`;
    return link(this, url, f, []);
  },
};

export const facebookMarketplace: MultiSiteSite = {
  id: "facebook_marketplace",
  label: "Facebook Marketplace",
  verified: true,
  build(f) {
    const mm = makeModel(f);
    if (!mm) return null;
    const years = yearsList(f.yearMin, f.yearMax);
    const query = [`"${mm}"`, ...years].join(" ");
    const state = f.zip ? zipToState(f.zip) : null;
    const city = state ? FACEBOOK_CITY_BY_STATE[state] : undefined;
    const params = qs({
      query,
      minPrice: f.priceMin,
      maxPrice: f.priceMax,
      category_id: "vehicles",
    });
    if (city)
      return link(
        this,
        `https://www.facebook.com/marketplace/${city}/search?${params}`,
        f,
        ["milesMax", "radiusMi", "title"],
      );
    // No confident city slug: Facebook centers the search on the viewer's own location.
    return link(
      this,
      `https://www.facebook.com/marketplace/search?${params}`,
      f,
      ["milesMax", "zip", "radiusMi", "title"],
      false,
    );
  },
};

export const carmax: MultiSiteSite = {
  id: "carmax",
  label: "CarMax",
  verified: true,
  build(f) {
    if (!f.make) return null;
    const path = [slug(f.make), f.model ? slug(f.model) : ""]
      .filter(Boolean)
      .join("/");
    const year =
      f.yearMin || f.yearMax
        ? `${f.yearMin ?? ""}-${f.yearMax ?? ""}`
        : undefined;
    const price =
      f.priceMin || f.priceMax
        ? `${f.priceMin ?? ""}-${f.priceMax ?? ""}`
        : undefined;
    const url = `https://www.carmax.com/cars/${path}${year || price ? `?${qs({ year, price })}` : ""}`;
    // Location comes from the shopper's CarMax store, so ZIP/radius can't be carried.
    return link(this, url, f, ["zip", "radiusMi", "milesMax", "title"]);
  },
};

export const autolist: MultiSiteSite = {
  id: "autolist",
  label: "Autolist",
  verified: true,
  build(f) {
    if (!f.make) return null;
    const hash = qs({
      make: f.make,
      model: f.model,
      year_min: f.yearMin,
      year_max: f.yearMax,
      price_min: f.priceMin,
      price_max: f.priceMax,
      location: f.zip,
      radius: f.zip ? f.radiusMi : undefined,
    });
    return link(this, `https://www.autolist.com/listings#${hash}`, f, [
      "milesMax",
      "title",
    ]);
  },
};

/** TrueCar's format could not be confirmed (bot wall even in a real browser), so it is not shown. */
export const truecar: MultiSiteSite = {
  id: "truecar",
  label: "TrueCar",
  verified: false,
  build(f) {
    if (!f.make) return null;
    const path = [slug(f.make), f.model ? slug(f.model) : ""]
      .filter(Boolean)
      .join("/");
    const year =
      f.yearMin && f.yearMax ? `${f.yearMin}-${f.yearMax}` : undefined;
    const url = `https://www.truecar.com/used-cars-for-sale/listings/${path}/?${qs({ year })}`;
    return link(this, url, f, [
      "priceMin",
      "priceMax",
      "milesMax",
      "zip",
      "radiusMi",
      "title",
    ]);
  },
};

/** Display order: broad aggregators first, then the big marketplaces, then local classifieds. */
export const MULTISITE_SITES: MultiSiteSite[] = [
  carsCom,
  autotrader,
  cargurus,
  ebayMotors,
  facebookMarketplace,
  craigslist,
  carmax,
  autolist,
  autotempest,
  truecar,
];
