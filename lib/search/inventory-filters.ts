import {
  applyExtendedFilters,
  validateExtendedFilters,
} from "./extended-inventory-filters";
import { ALL_VEHICLE_SOURCES } from "@/lib/utils/sources";
import { sourceMeta } from "@/lib/sources/source-meta";
import type { Database } from "@/types/supabase";

const STORED_SOURCE_IDS = [
  "copart",
  "iaa",
  "adesa",
  "manheim",
  "facebook_marketplace",
  "craigslist",
  "ebay_motors",
  "autotrader",
  "cars_com",
  "gov_auction",
  "repo_network",
  "independent_dealer",
  "cargurus",
  "craigslist_dealer",
  "carvana",
  "truecar",
  "vroom",
  "offerup",
  "acv",
] satisfies Database["public"]["Enums"]["deal_source"][];
import { NO_DAMAGE_VALUES } from "@/lib/intelligence/repair-risk";

export function applyRepairEligibility(
  query: any,
  includeRepairable: string | null,
) {
  if (includeRepairable !== "0") return query;
  // Apply before pagination and counts; filtering a downloaded page hides totals and loses matches.
  const damage = NO_DAMAGE_VALUES.map(
    (value) => `damage_type.ilike.${value === "" ? '""' : value}`,
  ).join(",");
  return query
    .or("condition.is.null,condition.in.(clean_title,run_drive)")
    .or(`damage_type.is.null,${damage}`);
}

export function dbSourceValues(sourceId: string) {
  const id = sourceId.toLowerCase();
  const mapped: Record<string, string[]> = {
    publicsurplus: ["gov_auction"],
    govdeals: ["gov_auction"],
    allsurplus: ["gov_auction"],
    municibid: ["gov_auction"],
    gsa_auctions: ["gov_auction"],
    gsa: ["gov_auction"],
    curated_dealers: ["independent_dealer"],
    "ae-of-miami": ["independent_dealer"],
    "damage-com": ["independent_dealer"],
    "dg-auto": ["independent_dealer"],
    recar: ["independent_dealer"],
    "stjames-auto": ["independent_dealer"],
    "cas-miami": ["independent_dealer"],
    salvagezone: ["independent_dealer"],
    "rebuilt-auto": ["independent_dealer"],
    "alpine-auto": ["independent_dealer"],
    "replica-auto": ["independent_dealer"],
    carparts_com: ["independent_dealer"],
  };
  return mapped[id] || [id];
}

export function uniqueDbSources(sourceIds: string[]) {
  return Array.from(new Set(sourceIds.flatMap(dbSourceValues)));
}

export function sellerTypeSourceValues(sellerType: string) {
  const type = sellerType.toLowerCase();
  if (type === "auction") {
    return ["copart", "iaa", "adesa", "manheim", "acv", "gov_auction"];
  }
  if (type === "dealer") {
    return [
      "independent_dealer",
      "craigslist_dealer",
      "cars_com",
      "cargurus",
      "autotrader",
      "truecar",
      "ebay_motors",
      "carvana",
      "vroom",
    ];
  }
  if (type === "private") {
    return ["craigslist", "facebook_marketplace", "offerup"];
  }
  return [];
}

export function sourceUrlNeedles(sourceId: string) {
  const id = sourceId.toLowerCase();
  const mapped: Record<string, string[]> = {
    publicsurplus: ["publicsurplus.com"],
    govdeals: ["govdeals.com"],
    allsurplus: ["allsurplus.com", "liquidityservices.com"],
    municibid: ["municibid.com"],
    gsa_auctions: ["gsaauctions.gov", "gsa.gov"],
    gsa: ["gsaauctions.gov", "gsa.gov"],
    "ae-of-miami": ["aeofmiami.com"],
    "damage-com": ["damage.com"],
    "dg-auto": ["dgautollc.com"],
    recar: ["recar.com"],
    "stjames-auto": ["stjamesauto.com", "stjamesautoparts.com"],
    "cas-miami": ["casmiami.com"],
    salvagezone: ["salvagezone.com"],
    "rebuilt-auto": ["rebuiltauto.com"],
    "alpine-auto": ["alpineautogallery.com"],
    "replica-auto": ["replicaauto.com"],
  };
  return mapped[id] || [];
}

export function damagedLaneFilter() {
  return [
    "condition.in.(salvage_title,rebuilt_title,parts_only,fire,flood,hail,repairable)",
    "damage_type.ilike.%repairable%",
    "damage_type.ilike.%damage%",
    "damage_type.ilike.%collision%",
  ].join(",");
}

export function validateInventoryRanges(
  params: URLSearchParams,
): string | null {
  for (const [min, max, label] of [
    ["minPrice", "maxPrice", "Price"],
    ["minYear", "maxYear", "Year"],
    ["minMileage", "maxMileage", "Mileage"],
  ]) {
    const low = params.get(min);
    const high = params.get(max);
    for (const value of [low, high]) {
      if (
        value != null &&
        value !== "" &&
        (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      )
        return `${label} must be a non-negative whole number`;
    }
    if (high && Number(high) === 0 && label !== "Mileage")
      return `${label} maximum must be greater than zero`;
    if (low && high && Number(low) > Number(high))
      return `${label} minimum must not exceed maximum`;
  }
  return validateExtendedFilters(params);
}

export function applyVehicleDetails(query: any, params: URLSearchParams) {
  let scoped = applyInventoryNumericFilters(query, params);
  for (const [key, column] of [
    ["damage", "damage_type"],
    ["body", "body_class"],
    ["trim", "trim"],
  ]) {
    const value = (params.get(key) || "")
      .replace(/[^a-zA-Z0-9 -]/g, "")
      .trim()
      .slice(0, 60);
    if (value && value !== "all") scoped = scoped.ilike(column, `%${value}%`);
  }
  for (const [key, column, values] of [
    ["fuelType", "fuel_type", ["Gas", "Diesel", "Hybrid", "Electric"]],
    ["transmission", "transmission", ["Automatic", "Manual"]],
    ["drivetrain", "drivetrain", ["AWD", "4WD", "FWD", "RWD"]],
  ] as const) {
    const value = params.get(key);
    if (values.some((allowed) => allowed === value))
      scoped = scoped.or(
        `${column}.ilike.%${value}%,options->>${key}.eq.${value}`,
      );
  }
  const keys = params.get("keys");
  if (keys === "yes" || keys === "no")
    scoped = scoped.eq("keys_present", keys === "yes");
  if (keys === "unknown") scoped = scoped.is("keys_present", null);
  if (params.get("buyNow") === "1") scoped = scoped.gt("buy_now_price", 0);
  return applyExtendedFilters(scoped, params);
}

/** Missing price is null/nonpositive; an actual zero-mile odometer is still reported. */
export function applyInventoryNumericFilters(
  query: any,
  params: URLSearchParams,
) {
  let q = query;
  for (const [kind, column, minKey, maxKey] of [
    ["price", "ask_price", "minPrice", "maxPrice"],
    ["mileage", "mileage", "minMileage", "maxMileage"],
  ] as const) {
    const policy = params.get(`${kind}Policy`);
    const low = params.get(minKey);
    const high = params.get(maxKey);
    const hasLow =
      low !== null && low !== "" && (kind === "mileage" || Number(low) > 0);
    const hasHigh =
      high !== null && high !== "" && (kind === "mileage" || Number(high) > 0);
    const unknown = `${column}.is.null,${column}.${kind === "price" ? "lte" : "lt"}.0`;
    if (policy === "unknown") {
      q = q.or(unknown);
      continue;
    }
    if (policy === "include") {
      if (hasLow || hasHigh) {
        const bounds = [`${column}.${kind === "price" ? "gt" : "gte"}.0`];
        if (hasLow) bounds.push(`${column}.gte.${Number(low)}`);
        if (hasHigh) bounds.push(`${column}.lte.${Number(high)}`);
        q = q.or(`${unknown},and(${bounds.join(",")})`);
      }
      continue;
    }
    if (policy === "reported" || (kind === "price" && (hasLow || hasHigh)))
      q = kind === "price" ? q.gt(column, 0) : q.gte(column, 0);
    if (hasLow) q = q.gte(column, Number(low));
    if (hasHigh) q = q.lte(column, Number(high));
  }
  return q;
}

export function applyInventoryLane(query: any, lane: string) {
  if (lane === "auction" || lane === "government")
    return query.in(
      "source",
      lane === "auction" ? sellerTypeSourceValues("auction") : ["gov_auction"],
    );
  if (lane === "private")
    return query.in("source", sellerTypeSourceValues("private"));
  if (lane === "clean-retail")
    return query.in("source", sellerTypeSourceValues("dealer"));
  if (lane === "parts") return query.eq("condition", "parts_only");
  if (lane === "damaged") return query.or(damagedLaneFilter());
  return query;
}

export const VEHICLE_CATEGORY_FILTERS = {
  trucks: {
    label: "Pickup trucks",
    filter: "body_class.ilike.%pickup%,body_class.ilike.%truck%",
  },
  suvs: {
    label: "SUVs",
    filter: "body_class.ilike.%suv%,body_class.ilike.%utility%",
  },
  sedans: { label: "Sedans", filter: "body_class.ilike.%sedan%" },
  sports: {
    label: "Coupes & convertibles",
    filter: "body_class.ilike.%coupe%,body_class.ilike.%convertible%",
  },
  luxury: {
    label: "Premium brands",
    filter: [
      "BMW",
      "Mercedes-Benz",
      "Audi",
      "Lexus",
      "Porsche",
      "Cadillac",
      "Acura",
      "Genesis",
      "Lincoln",
      "Jaguar",
      "Infiniti",
      "Bentley",
      "Rolls-Royce",
    ]
      .map((make) => `make.ilike.${make}`)
      .join(","),
  },
  electric: {
    label: "Electric & hybrid",
    filter:
      "fuel_type.ilike.%electric%,fuel_type.ilike.%hybrid%,options->>fuelType.in.(Electric,Hybrid)",
  },
  commercial: {
    label: "Commercial vehicles",
    filter:
      "body_class.ilike.%cargo%,body_class.ilike.%commercial%,body_class.ilike.%heavy%,body_class.ilike.%bus%",
  },
  motorcycles: {
    label: "Motorcycles",
    filter: "body_class.ilike.%motorcycle%",
  },
};

export function applySelectedSources(query: any, sources: string[]) {
  if (!sources.length) return query;
  return query.or(
    sources
      .map((source) => {
        const values = dbSourceValues(source);
        const stored =
          values.length === 1
            ? `source.eq.${values[0]}`
            : `source.in.(${values.join(",")})`;
        const needles = sourceUrlNeedles(source);
        return needles.length
          ? `and(${stored},or(${needles.map((needle) => `source_url.ilike.%${needle}%`).join(",")}))`
          : stored;
      })
      .join(","),
  );
}

export const INVENTORY_SOURCE_FILTERS = Array.from(
  new Map(
    [
      ...STORED_SOURCE_IDS.map((id) => ({ id, name: sourceMeta(id).label })),
      ...["govdeals", "allsurplus", "municibid", "salvagezone"].map((id) => ({
        id,
        name: sourceMeta(id).label,
      })),
      ...ALL_VEHICLE_SOURCES.filter((source) =>
        dbSourceValues(source.id).every((id) =>
          (STORED_SOURCE_IDS as string[]).includes(id),
        ),
      ).map(({ id, name }) => ({ id, name })),
    ].map((source) => [source.id, source]),
  ).values(),
).sort((a, b) => a.name.localeCompare(b.name));
