import { parseMarketSearch } from "@/lib/market/parse-search";
import { parseSearchQuery } from "./parse-search";

/** The account alert schema is narrower than Market. Never silently discard criteria. */
export function savedSearchPreview(query: string) {
  const parsed = parseSearchQuery(query);
  const market = parseMarketSearch(query);
  const f = market.filters;
  // Use Market's unit-aware interpretation so mileage cannot become a dollar budget.
  parsed.max_price = f.priceMax ? Number(f.priceMax) : undefined;
  parsed.min_year = f.yearMin ? Number(f.yearMin) : undefined;
  parsed.max_year = f.yearMax ? Number(f.yearMax) : undefined;
  parsed.state =
    Array.isArray(f.states) && f.states.length === 1 ? f.states[0] : undefined;
  if (Array.isArray(f.makes) && f.makes.length === 1) parsed.make = f.makes[0];
  if (typeof f.model === "string") parsed.model = f.model || undefined;
  const unsupported: string[] = [];
  if (f.mileageMax) unsupported.push("Mileage limit");
  if (f.near || f.radius || market.needsNearby)
    unsupported.push("Location / radius");
  if (Object.keys(market.details).some((key) => key !== "pricePolicy"))
    unsupported.push("Vehicle specifications");
  if (f.priceMin) unsupported.push("Minimum price");
  if (f.q) unsupported.push("Additional keywords");
  if (Array.isArray(f.conditions) && f.conditions.length === 1) {
    const title = f.conditions[0].replace(/_title$/, "");
    if (["clean", "rebuilt", "salvage"].includes(title))
      Object.assign(parsed, { title_type: title });
    else unsupported.push("Title / condition");
  }
  const params = new URLSearchParams({ scope: "explicit", hasPhotos: "yes" });
  for (const [key, value] of Object.entries({ ...f, ...market.details })) {
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
    } else if (value) params.set(key, value);
  }
  return {
    query,
    parsed: parsed as typeof parsed & { title_type?: string },
    labels: market.labels,
    warnings: market.warnings,
    unsupported,
    // A malformed or ambiguous request must not produce a broader saved alert.
    blocked: market.blocked || unsupported.length > 0,
    marketHref:
      !market.blocked && !market.needsNearby ? `/market?${params}` : null,
  };
}
