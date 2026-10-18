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
  applyRepairEligibility,
  applySelectedSources,
  applyVehicleDetails,
  applySellerTypes,
} from "./inventory-filters";
import { DEFAULT_RADIUS_MI, MAX_RADIUS_MI } from "./zip-radius-scope";

export const INVENTORY_SEARCH_KEYS = Array.from(
  new Set([
    "scope",
    "radius",
    "q",
    "state",
    "states",
    "zip",
    "radius",
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
    "includeRepairable",
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

export function inventoryScopeLabel(params: URLSearchParams) {
  const zip = params.get("zip");
  const requested = Number(params.get("radius"));
  const radius =
    Number.isFinite(requested) && requested > 0
      ? Math.max(5, Math.round(requested))
      : DEFAULT_RADIUS_MI;
  if (zip)
    return /^\d{5}$/.test(zip)
      ? `${radius} mi of ${zip}`
      : "Location needs checking";
  return inventoryScopeStates(params)?.join(", ") || "Nationwide";
}

export function inventoryViewUnavailableReason(
  params: URLSearchParams,
  photosRequired = false,
): string | null {
  if (params.get("zip") && Number(params.get("radius")) > MAX_RADIUS_MI)
    return `This view supports up to ${MAX_RADIUS_MI} miles. Your full-radius search remains available in Results.`;
  if (photosRequired && params.get("hasPhotos") === "no")
    return "This view requires photos. Your search for listings without photos remains available in Results.";
  return null;
}

export function applyInventoryViewScope(query: any, params: URLSearchParams) {
  let q = applyVehicleDetails(
    applyLiveAuctionWindow(
      applyCustomerInventory(query, Date.now(), {
        includeWithoutPhotos: params.get("hasPhotos") === "no",
        observedDays: Number(params.get("seenWithin")),
      }),
    ),
    params,
  );
  q = applyInventoryLane(q, params.get("lane") || "all");
  q = applyRepairEligibility(q, params.get("includeRepairable"));
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
  q = applySellerTypes(q, [params.get("sellerType") || ""]);
  // titleType=clean|rebuilt|salvage|rebuildable|unknown (comma-multi) on the condition enum.
  const titleFilter = titleCategoryOrFilter(
    parseTitleTypes(params.get("titleType")),
  );
  if (titleFilter) q = q.or(titleFilter);
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
import { applyLiveAuctionWindow } from "./live-auction-window";
import { applyCustomerInventory } from "./customer-inventory";
import {
  parseTitleTypes,
  titleCategoryOrFilter,
} from "@/lib/deals/title-category";
