import { STATE_SEED_ZIPS } from "@/lib/geo";
import {
  buildMultiSiteLinks,
  normalizeFilters,
  type MultiSiteFilters,
} from "@/lib/multisite";
import { parseZipRadius } from "./zip-radius-scope";

const RANGE_FIELDS = {
  minPrice: ["minprice", "Minimum price"],
  maxPrice: ["maxprice", "Maximum price"],
  minYear: ["minyear", "Minimum year"],
  maxYear: ["maxyear", "Maximum year"],
  minMileage: ["minmiles", "Minimum mileage"],
  maxMileage: ["maxmiles", "Maximum mileage"],
} as const;

const INTERNAL_KEYS = new Set([
  "sort",
  "limit",
  "offset",
  "scope",
  "buyerMode",
  "buyingFor",
]);
const LABELS: Record<string, string> = {
  source: "Sources",
  sources: "Sources",
  makes: "Multiple makes",
  sellerType: "Seller type",
  titleType: "Title",
  lane: "Inventory lane",
  damage: "Damage",
  fuelType: "Fuel",
  drivetrain: "Drivetrain",
  keys: "Keys",
  runDrive: "Run & drive",
  buyNow: "Buy now",
  dealers: "Dealers",
  dealerSourceIds: "Dealer sources",
  minProfit: "Minimum profit",
  verdict: "Verdict",
  availability: "Availability",
  category: "Category",
  madeInUsa: "Made in USA",
  pricePolicy: "Price availability",
  mileagePolicy: "Mileage availability",
  state: "State",
  states: "States",
  zip: "ZIP code",
  radius: "Radius (mi)",
  q: "Keywords",
  make: "Make",
  model: "Model",
  trim: "Trim",
  body: "Body style",
  transmission: "Transmission",
  minPrice: "Minimum price",
  maxPrice: "Maximum price",
  minYear: "Minimum year",
  maxYear: "Maximum year",
  minMileage: "Minimum mileage",
  maxMileage: "Maximum mileage",
  color: "Exterior color",
  engine: "Engine",
  city: "City",
  hasVin: "VIN availability",
  hasPhotos: "Photo availability",
  seenWithin: "Last observed",
  auctionFrom: "Auction date from",
  auctionTo: "Auction date to",
  minBuyNow: "Minimum buy now price",
  maxBuyNow: "Maximum buy now price",
  includeRepairable: "Repairable vehicles",
};

function active(value: string | null): value is string {
  return Boolean(
    value?.trim() &&
    !["all", "any", "nationwide"].includes(value.trim().toLowerCase()),
  );
}

function selected(params: URLSearchParams) {
  return Array.from(params.entries()).filter(
    ([key, value]) =>
      Object.prototype.hasOwnProperty.call(LABELS, key) &&
      active(value) &&
      !INTERNAL_KEYS.has(key),
  );
}
function describe(key: string, value: string) {
  const display =
    key === "includeRepairable"
      ? value === "1"
        ? "included"
        : value === "0"
          ? "excluded"
          : value
      : value;
  return `${LABELS[key]}: ${display.slice(0, 160)}`;
}

export function marketHandoff(params: URLSearchParams) {
  const target = new URL("https://www.autotempest.com/results");
  const carried: string[] = [];
  const consumed = new Set<string>();
  const add = (
    key: string,
    targetKey: string,
    label: string,
    value: string,
  ) => {
    target.searchParams.set(targetKey, value);
    consumed.add(key);
    carried.push(`${label}: ${value}`);
  };

  // Use the destination's explicit custom make/model fields, not guessed model slugs.
  for (const key of ["make", "model"] as const) {
    const value = params.get(key);
    if (!active(value)) continue;
    add(key, `${key}_kw`, key === "make" ? "Make words" : "Model words", value);
  }
  for (const [key, [targetKey, label]] of Object.entries(RANGE_FIELDS)) {
    const value = params.get(key);
    if (active(value) && /^\d+$/.test(value)) add(key, targetKey, label, value);
  }
  for (const [key, targetKey, label] of [
    ["q", "keywords", "Keywords"],
    ["trim", "trim_kw", "Trim words"],
  ]) {
    const value = params.get(key);
    if (active(value)) add(key, targetKey, label, value);
  }
  const transmission = params.get("transmission");
  const seller = params.get("sellerType")?.toLowerCase();
  if (seller === "private" || seller === "dealer") {
    add("sellerType", "saleby", "Seller type", seller);
  }
  const transmissionValue = transmission?.toLowerCase();
  if (transmissionValue === "automatic" || transmissionValue === "manual") {
    add(
      "transmission",
      "transmission",
      "Transmission",
      transmissionValue === "manual" ? "man" : "auto",
    );
  }
  const body = params.get("body");
  const bodyValue = body?.toLowerCase();
  const supportedBodies = [
    "sedan",
    "suv",
    "coupe",
    "convertible",
    "wagon",
    "hatchback",
    "minivan",
    "van",
    "truck",
    "pickup",
  ];
  if (bodyValue && supportedBodies.includes(bodyValue)) {
    add(
      "body",
      "bodystyle",
      "Body style",
      bodyValue === "pickup" ? "truck" : bodyValue,
    );
  }

  const state = params.get("state")?.trim().toUpperCase();
  const stateZip = state && STATE_SEED_ZIPS[state];
  const nearby = parseZipRadius(params);
  // Nationwide searches still require a reference ZIP on AutoTempest; it is not the user's location.
  if (nearby) {
    add("zip", "zip", "ZIP code", nearby.zip);
    add("radius", "radius", "Radius (mi)", String(nearby.radius));
  } else {
    target.searchParams.set("zip", stateZip || "66601");
    target.searchParams.set("localization", stateZip ? "state" : "country");
    target.searchParams.set("radius", "any");
    if (stateZip) consumed.add("state");
  }

  const reapply = selected(params)
    .filter(([key]) => !consumed.has(key))
    .map(([key, value]) => describe(key, value));

  return {
    href: target.toString(),
    carried,
    reapply,
    location: nearby
      ? `Within ${nearby.radius} mi of ZIP ${nearby.zip}`
      : stateZip
        ? `Statewide: ${state}`
        : "Nationwide: US",
  };
}

const MULTISITE_KEYS: Partial<Record<string, keyof MultiSiteFilters>> = {
  make: "make",
  model: "model",
  trim: "trim",
  minYear: "yearMin",
  maxYear: "yearMax",
  minPrice: "priceMin",
  maxPrice: "priceMax",
  maxMileage: "milesMax",
  zip: "zip",
  radius: "radiusMi",
  body: "body",
  drivetrain: "drivetrain",
  fuelType: "fuel",
  transmission: "transmission",
  titleType: "title",
};
const OUTBOUND_MARKETS = new Set([
  "cars_com",
  "autotrader",
  "cargurus",
  "ebay_motors",
  "craigslist",
  "carmax",
  "autolist",
  "truecar",
  "kbb",
  "edmunds",
]);

/** Search reach only: no scraping, source activation, provider call or inventory-count claim. */
export function marketHandoffs(params: URLSearchParams) {
  const primary = {
    id: "autotempest",
    label: "AutoTempest",
    ...marketHandoff(params),
    unconfirmed: [] as string[],
  };
  const raw: Record<string, unknown> = {};
  const mapped = new Set<string>();
  for (const [key, target] of Object.entries(MULTISITE_KEYS)) {
    const value = params.get(key);
    if (!target || !active(value)) continue;
    if (
      ["minYear", "maxYear", "minPrice", "maxPrice", "maxMileage"].includes(
        key,
      ) &&
      !/^\d+$/.test(value)
    )
      continue;
    if (key === "titleType" && !["clean", "salvage", "rebuilt"].includes(value))
      continue;
    raw[target] = value;
    mapped.add(key);
  }
  const nearby = parseZipRadius(params);
  if (nearby) {
    raw.zip = nearby.zip;
    raw.radiusMi = nearby.radius;
  } else {
    delete raw.zip;
    delete raw.radiusMi;
    mapped.delete("zip");
    mapped.delete("radius");
  }
  // Deal-category chips are not vehicle types. Only explicit incompatible types suppress car sites.
  const nonCar = /^(motorcycles?|atv|utv|boats?|trailers?|equipment|rv)$/i;
  if (
    nonCar.test(params.get("body") || "") ||
    nonCar.test(params.get("category") || "")
  )
    return [];
  if (!raw.make || params.get("makes")) return [primary];
  const normalized = normalizeFilters(raw);
  for (const key of Array.from(mapped))
    if (normalized[MULTISITE_KEYS[key]!] === undefined) mapped.delete(key);
  // Do not silently swap reversed ranges when moving a search to another site.
  if (
    Number(raw.yearMin) > Number(raw.yearMax) ||
    Number(raw.priceMin) > Number(raw.priceMax)
  )
    return [primary];
  const seller = params.get("sellerType")?.trim().toLowerCase();
  const extras = buildMultiSiteLinks(raw).filter(
    (l) =>
      OUTBOUND_MARKETS.has(l.site) &&
      (seller !== "private" || l.site === "craigslist") &&
      (seller !== "auction" || l.site === "ebay_motors"),
  );
  return [
    primary,
    ...extras.map((link) => {
      const dropped = new Set(link.dropped);
      const unconfirmed = new Set(link.unconfirmed || []);
      const criteria = selected(params).map(
        ([key, value]) =>
          [key, key === "radius" && nearby ? String(nearby.radius) : value] as [
            string,
            string,
          ],
      );
      const reapply = criteria
        .filter(
          ([key]) => !mapped.has(key) || dropped.has(MULTISITE_KEYS[key]!),
        )
        .map(([key, value]) => describe(key, value));
      // Destinations can round radius values or apply keyword matching; make those differences visible.
      const reviewRadius =
        nearby &&
        link.site === "cars_com" &&
        new URL(link.url).searchParams.get("maximum_distance") !==
          String(nearby.radius);
      if (reviewRadius)
        reapply.push(
          `Radius (mi): ${nearby.radius} (destination distance options differ)`,
        );
      const carried = criteria
        .filter(
          ([key]) =>
            mapped.has(key) &&
            !(key === "radius" && reviewRadius) &&
            !dropped.has(MULTISITE_KEYS[key]!) &&
            !unconfirmed.has(MULTISITE_KEYS[key]!),
        )
        .map(([key, value]) => describe(key, value));
      return {
        id: link.site,
        label: link.label,
        href: link.url,
        carried,
        reapply: Array.from(new Set(reapply)),
        unconfirmed: criteria
          .filter(([key]) => unconfirmed.has(MULTISITE_KEYS[key]!))
          .map(([key, value]) => describe(key, value)),
        location:
          nearby && !dropped.has("zip") && !dropped.has("radiusMi")
            ? `ZIP ${nearby.zip} · review distance`
            : "Set location at destination",
      };
    }),
  ];
}
