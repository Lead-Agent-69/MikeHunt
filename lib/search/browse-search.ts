import { INVENTORY_SEARCH_KEYS } from "./inventory-view-scope";

const MARKET_HANDOFF_KEYS = new Set([
  ...INVENTORY_SEARCH_KEYS,
  "near",
  "lat",
  "lng",
  "priceBasis",
  "sort",
  "sortDir",
  "mode",
]);

/** Search existing inventory with the selected scope, starting at the first result batch. */
export function inventorySearchHref(
  scopeQuery: string,
  query: string,
  {
    openFilters = false,
    currentQuery = "",
    path = "/market",
  }: {
    openFilters?: boolean;
    currentQuery?: string;
    path?: "/market" | "/feed";
  } = {},
) {
  const params = new URLSearchParams(scopeQuery);
  const explicit = new URLSearchParams(currentQuery);
  if (explicit.has("states")) params.delete("state");
  else if (explicit.has("state")) params.delete("states");
  explicit.forEach((value, key) => {
    if (MARKET_HANDOFF_KEYS.has(key)) params.set(key, value);
  });
  if (
    explicit.get("near") ||
    explicit.get("zip") ||
    explicit.get("lat") ||
    explicit.get("lng")
  ) {
    params.delete("state");
    params.delete("states");
  }
  const q = query.trim();
  if (q) params.set("q", q);
  else params.delete("q");
  params.delete("page");
  if (openFilters) params.set("filters", "open");
  else params.delete("filters");
  return `${path}?${params.toString()}`;
}
