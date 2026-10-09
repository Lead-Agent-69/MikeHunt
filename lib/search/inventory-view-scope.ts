import {
  hasAuctionDetailFilters,
  INVENTORY_DETAIL_FIELDS,
} from "./extended-inventory-filters";
import {
  AUCTION_DB_SOURCES,
  wantsAuctionInventory,
} from "@/lib/discovery/auction-scope";
import {
  applyInventoryLane,
  applySelectedSources,
  applyVehicleDetails,
  sellerTypeSourceValues,
} from "./inventory-filters";

export const INVENTORY_SEARCH_KEYS = Array.from(
  new Set([
    "scope",
    "q",
    "state",
    "states",
    "source",
    "sources",
    "make",
    "makes",
    "model",
    "lane",
    "sellerType",
    "titleType",
    "minPrice",
    "maxPrice",
    "minYear",
    "maxYear",
    "minMileage",
    "maxMileage",
    "dealerSourceIds",
    "dealers",
    "availability",
    "madeInUsa",
    ...INVENTORY_DETAIL_FIELDS.map((field) => field.key),
  ]),
);

export function inventoryViewParams(input: URLSearchParams) {
  return new URLSearchParams(
    Array.from(input.entries()).filter(([key]) =>
      INVENTORY_SEARCH_KEYS.includes(key),
    ),
  );
}

export function inventoryScopeStates(
  params: URLSearchParams,
): string[] | undefined {
  if (params.has("states"))
    return (params.get("states") || "")
      .split(",")
      .map((state) => state.trim().toUpperCase())
      .filter((state) => /^[A-Z]{2}$/.test(state));
  if (params.has("state")) {
    const state = (params.get("state") || "").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(state) ? [state] : [];
  }
  return undefined;
}

export function applyInventoryViewScope(query: any, params: URLSearchParams) {
  let q = applyVehicleDetails(query, params);
  q = applyInventoryLane(q, params.get("lane") || "all");
  const csv = (key: string) =>
    (params.get(key) || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  const states = csv("states");
  const state = params.get("state");
  if (states.length)
    q = q.in(
      "location_state",
      states.map((value) => value.toUpperCase()),
    );
  else if (state && !["all", "nationwide"].includes(state.toLowerCase()))
    q = q.eq("location_state", state.toUpperCase());
  const sources = [
    ...csv("sources"),
    ...csv("source"),
    ...csv("dealerSourceIds"),
  ].filter((source) => source !== "all" && /^[a-zA-Z0-9_-]+$/.test(source));
  if (
    !hasAuctionDetailFilters(params) &&
    !wantsAuctionInventory({
      lane: params.get("lane"),
      sellerType: params.get("sellerType"),
      sources,
    })
  ) {
    q = q.not("source", "in", `(${AUCTION_DB_SOURCES.join(",")})`);
  }
  q = applySelectedSources(q, sources);
  const makes = [...csv("makes"), ...csv("make")]
    .map((value) => value.replace(/[^a-zA-Z0-9 -]/g, ""))
    .filter(Boolean);
  if (makes.length)
    q = q.or(makes.map((make) => `make.ilike.${make}`).join(","));
  const model = (params.get("model") || "")
    .replace(/[^a-zA-Z0-9 -]/g, "")
    .trim();
  if (model) q = q.ilike("model", model);
  const text = (params.get("q") || "")
    .replace(/[^a-zA-Z0-9 -]/g, " ")
    .trim()
    .slice(0, 60);
  if (text)
    q = q.or(
      `title.ilike.%${text}%,make.ilike.%${text}%,model.ilike.%${text}%,vin.ilike.%${text}%`,
    );
  for (const [key, column, method] of [
    ["minYear", "year", "gte"],
    ["maxYear", "year", "lte"],
  ])
    if (params.get(key)) q = q[method](column, Number(params.get(key)));
  const sellers = sellerTypeSourceValues(params.get("sellerType") || "");
  if (sellers.length) q = q.in("source", sellers);
  const title = params.get("titleType");
  if (title && title !== "all")
    q = q.eq(
      "condition",
      (
        {
          clean: "clean_title",
          salvage: "salvage_title",
          rebuilt: "rebuilt_title",
          parts: "parts_only",
        } as Record<string, string>
      )[title] || title,
    );
  if (params.get("availability") && params.get("availability") !== "all")
    q = q.eq("availability_status", params.get("availability"));
  if (params.get("madeInUsa") === "1")
    q = q.or(
      "assembly_country.ilike.%united states%,assembly_country.ilike.%usa%",
    );
  const dealers = csv("dealers")
    .map((value) => value.replace(/[^a-zA-Z0-9.-]/g, ""))
    .filter(Boolean);
  if (dealers.length)
    q = q.or(dealers.map((host) => `source_url.ilike.%${host}%`).join(","));
  return q;
}
