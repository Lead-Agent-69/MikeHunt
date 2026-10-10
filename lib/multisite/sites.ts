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

type Key = keyof MultiSiteFilters;

/** Filters added after the first audit. A site lists the ones it carries; the rest are dropped. */
const EXTRA: Key[] = ["trim", "body", "drivetrain", "fuel", "transmission"];
const notCarried = (carried: Key[] = []) =>
  EXTRA.filter((k) => !carried.includes(k));

const link = (
  site: MultiSiteSite,
  url: string,
  f: MultiSiteFilters,
  dropped: Key[],
  verified = site.verified,
  carried: { confirmed?: Key[]; unconfirmed?: Key[] } = {},
): MultiSiteLink => {
  const extrasDropped = notCarried([
    ...(carried.confirmed || []),
    ...(carried.unconfirmed || []),
  ]);
  const unconfirmed = present(f, carried.unconfirmed || []);
  return {
    site: site.id,
    label: site.label,
    url,
    dropped: present(f, Array.from(new Set([...dropped, ...extrasDropped]))),
    verified,
    ...(unconfirmed.length ? { unconfirmed } : {}),
  };
};

/** Keyword text for sites that only take free text: make model trim. */
const words = (f: MultiSiteFilters, extra: (string | undefined)[] = []) =>
  [f.make, f.model, f.trim, ...extra].filter(Boolean).join(" ");

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

const CARS_COM_BODY: Record<NonNullable<MultiSiteFilters["body"]>, string> = {
  sedan: "sedan",
  suv: "suv",
  truck: "pickup_truck",
  coupe: "coupe",
  hatchback: "hatchback",
  minivan: "minivan",
  van: "van",
  wagon: "wagon",
  convertible: "convertible",
};
const CARS_COM_DRIVE: Record<NonNullable<MultiSiteFilters["drivetrain"]>, string> = {
  awd: "all_wheel_drive",
  "4wd": "four_wheel_drive",
  fwd: "front_wheel_drive",
  rwd: "rear_wheel_drive",
};
const CARS_COM_FUEL: Record<NonNullable<MultiSiteFilters["fuel"]>, string> = {
  gas: "gasoline",
  diesel: "diesel",
  hybrid: "hybrid",
  electric: "electric",
  plugin_hybrid: "plug_in_hybrid",
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
      keyword: f.trim,
      "body_style_slugs[]": f.body ? [CARS_COM_BODY[f.body]] : undefined,
      "drivetrain_slugs[]": f.drivetrain
        ? [CARS_COM_DRIVE[f.drivetrain]]
        : undefined,
      "fuel_slugs[]": f.fuel ? [CARS_COM_FUEL[f.fuel]] : undefined,
      "transmission_slugs[]": f.transmission ? [f.transmission] : undefined,
    })}`;
    return link(this, url, f, ["title"], this.verified, {
      unconfirmed: ["trim", "body", "drivetrain", "fuel", "transmission"],
    });
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
/** Autotrader / KBB (both Cox Automotive) style, drive, fuel and transmission codes. */
const COX_STYLE: Record<NonNullable<MultiSiteFilters["body"]>, string> = {
  sedan: "SEDAN",
  suv: "SUVCROSS",
  truck: "TRUCKS",
  coupe: "COUPE",
  hatchback: "HATCH",
  minivan: "VANMV",
  van: "VANMV",
  wagon: "WAGON",
  convertible: "CONVERT",
};
const COX_DRIVE: Record<NonNullable<MultiSiteFilters["drivetrain"]>, string> = {
  awd: "AWD4WD",
  "4wd": "AWD4WD",
  fwd: "FWD",
  rwd: "RWD",
};
const COX_FUEL: Record<NonNullable<MultiSiteFilters["fuel"]>, string> = {
  gas: "GSL",
  diesel: "DSL",
  hybrid: "HYB",
  electric: "ELE",
  plugin_hybrid: "PIH",
};
const coxExtras = (f: MultiSiteFilters) => ({
  vehicleStyleCodes: f.body ? COX_STYLE[f.body] : undefined,
  driveGroup: f.drivetrain ? COX_DRIVE[f.drivetrain] : undefined,
  fuelTypeGroup: f.fuel ? COX_FUEL[f.fuel] : undefined,
  transmissionCodes: f.transmission
    ? f.transmission === "manual"
      ? "MAN"
      : "AUT"
    : undefined,
});

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
        ...coxExtras(f),
      },
    )}`;
    return link(
      this,
      url,
      f,
      [...(f.model && !modelCode ? (["model"] as const) : []), "title"],
      this.verified,
      { unconfirmed: ["body", "drivetrain", "fuel", "transmission"] },
    );
  },
};

export const ebayMotors: MultiSiteSite = {
  id: "ebay_motors",
  label: "eBay Motors",
  verified: true,
  build(f) {
    const kw = words(f, [
      f.title === "salvage" || f.title === "rebuilt" ? f.title : "",
    ]).toLowerCase();
    if (!kw) return null;
    // Year filters break eBay's search page (audit), so years stay off.
    const url = `https://www.ebay.com/sch/Cars-Trucks/6001/i.html?${qs({
      _nkw: kw,
      _udlo: f.priceMin,
      _udhi: f.priceMax,
      _stpos: f.zip,
      _sadis: f.zip ? f.radiusMi : undefined,
    })}`;
    return link(
      this,
      url,
      f,
      [
        "yearMin",
        "yearMax",
        "milesMax",
        ...(f.title === "clean" ? (["title"] as const) : []),
      ],
      this.verified,
      { confirmed: ["trim"] },
    );
  },
};

const CL_TITLE: Record<string, number> = { clean: 1, salvage: 2, rebuilt: 3 };
/** Craigslist auto_* codes as its own search form submits them. */
const CL_BODY: Record<NonNullable<MultiSiteFilters["body"]>, number> = {
  convertible: 2,
  coupe: 3,
  hatchback: 4,
  minivan: 5,
  truck: 7,
  sedan: 8,
  suv: 10,
  wagon: 11,
  van: 12,
};
const CL_DRIVE: Partial<Record<NonNullable<MultiSiteFilters["drivetrain"]>, number>> = {
  fwd: 1,
  rwd: 2,
  "4wd": 3,
};
const CL_FUEL: Record<NonNullable<MultiSiteFilters["fuel"]>, number> = {
  gas: 1,
  diesel: 2,
  hybrid: 3,
  plugin_hybrid: 3,
  electric: 4,
};
const CL_TRANS: Record<NonNullable<MultiSiteFilters["transmission"]>, number> = {
  manual: 1,
  automatic: 2,
};
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
      auto_bodytype: f.body ? CL_BODY[f.body] : undefined,
      auto_drivetrain: f.drivetrain ? CL_DRIVE[f.drivetrain] : undefined,
      auto_fuel_type: f.fuel ? CL_FUEL[f.fuel] : undefined,
      auto_transmission: f.transmission ? CL_TRANS[f.transmission] : undefined,
      query: f.trim,
      postal: f.zip,
      search_distance: f.radiusMi,
    })}`;
    return link(
      this,
      url,
      f,
      // Craigslist has no AWD bucket; 4wd is the closest it offers.
      f.drivetrain === "awd" ? ["drivetrain"] : [],
      this.verified,
      {
        confirmed: ["trim"],
        unconfirmed: ["body", "fuel", "transmission", ...(f.drivetrain === "awd" ? [] : (["drivetrain"] as Key[]))],
      },
    );
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
    const query = [`"${mm}"`, f.trim, ...years].filter(Boolean).join(" ");
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
        this.verified,
        { confirmed: ["trim"] },
      );
    // No confident city slug: Facebook centers the search on the viewer's own location.
    return link(
      this,
      `https://www.facebook.com/marketplace/search?${params}`,
      f,
      ["milesMax", "zip", "radiusMi", "title"],
      false,
      { confirmed: ["trim"] },
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

/**
 * Kelley Blue Book listings (Cox Automotive, same search stack as Autotrader). KBB's terms allow
 * hypertext links under its Linking Policy (no framing). Format not yet browser-confirmed.
 */
export const kbb: MultiSiteSite = {
  id: "kbb",
  label: "Kelley Blue Book",
  verified: false,
  build(f) {
    if (!f.make) return null;
    const path = [slug(f.make), f.model ? slug(f.model) : ""]
      .filter(Boolean)
      .join("/");
    const url = `https://www.kbb.com/cars-for-sale/used/${path}?${qs({
      zip: f.zip,
      searchRadius: f.zip ? f.radiusMi : undefined,
      startYear: f.yearMin,
      endYear: f.yearMax,
      minPrice: f.priceMin,
      maxPrice: f.priceMax,
      maxMileage: f.milesMax,
      ...coxExtras(f),
    })}`;
    return link(this, url, f, ["title"], false, {
      unconfirmed: ["body", "drivetrain", "fuel", "transmission"],
    });
  },
};

/** Edmunds used inventory. Public search page; format not yet browser-confirmed. */
export const edmunds: MultiSiteSite = {
  id: "edmunds",
  label: "Edmunds",
  verified: false,
  build(f) {
    if (!f.make) return null;
    const range = (a?: number, b?: number) =>
      a || b ? `${a ?? "*"}-${b ?? "*"}` : undefined;
    const url = `https://www.edmunds.com/inventory/srp.html?${qs({
      inventorytype: "used",
      make: slug(f.make),
      model: f.model ? slug(f.model) : undefined,
      year: range(f.yearMin, f.yearMax),
      price: range(f.priceMin, f.priceMax),
      mileage: f.milesMax ? `*-${f.milesMax}` : undefined,
      zip: f.zip,
      radius: f.zip ? f.radiusMi : undefined,
    })}`;
    return link(this, url, f, ["title"], false);
  },
};

/**
 * Salvage auctions (public lot search; bidding needs the buyer's own membership or a broker). We
 * link only. MikeHunt does not scrape either site. Formats not yet browser-confirmed.
 */
export const copart: MultiSiteSite = {
  id: "copart",
  label: "Copart",
  verified: false,
  build(f) {
    const q = words(f);
    if (!q) return null;
    const url = `https://www.copart.com/lotSearchResults/?${qs({ free: "true", query: q.toLowerCase() })}`;
    return link(
      this,
      url,
      f,
      ["yearMin", "yearMax", "priceMin", "priceMax", "milesMax", "zip", "radiusMi", "title"],
      false,
      { confirmed: ["trim"] },
    );
  },
};

export const iaai: MultiSiteSite = {
  id: "iaai",
  label: "IAA",
  verified: false,
  build(f) {
    const q = words(f);
    if (!q) return null;
    const url = `https://www.iaai.com/Search?${qs({ Keyword: q })}`;
    return link(
      this,
      url,
      f,
      ["yearMin", "yearMax", "priceMin", "priceMax", "milesMax", "zip", "radiusMi", "title"],
      false,
      { confirmed: ["trim"] },
    );
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
  kbb,
  edmunds,
  copart,
  iaai,
];
