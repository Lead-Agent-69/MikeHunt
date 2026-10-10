import { isValidVin } from "@/lib/vehicle/vin";
import { zipToState } from "@/lib/geo/zip-state";
import { parseVehicleQuery } from "./parse-vehicle-query";

const FILLER =
  /^(under|below|less|than|over|above|at|least|from|max|maximum|min|minimum|up|to|near|within|in|of|for|with|and|or|the|a|miles?|mi|mileage|zip|around|before|after|older|newer|budget|cheap|k)$/i;

/**
 * Free text like "honda civic under 15000" used to be matched literally against titles, so it
 * returned nothing. Turn it into structured filters (only where the caller didn't set them
 * explicitly) and leave a residual text query of the words we couldn't place.
 * Mutates and returns `params`.
 */
export function expandFreeTextQuery(params: URLSearchParams): URLSearchParams {
  const raw = (params.get("q") || "").trim();
  if (!raw || isValidVin(raw)) return params;
  const p = parseVehicleQuery(raw);
  const fill = (key: string, value: string | undefined) => {
    if (value && !params.get(key)) params.set(key, value);
  };
  fill("make", p.make);
  fill("model", p.model);
  fill("minYear", p.minYear);
  fill("maxYear", p.maxYear);
  fill("minPrice", p.minPrice);
  fill("maxPrice", p.maxPrice);
  fill("maxMileage", p.maxMileage);
  fill("zip", p.zip);
  fill("radius", p.radius);
  fill("state", p.state ?? (p.zip && !p.radius ? zipToState(p.zip) ?? undefined : undefined));

  const structured = Object.keys(p).length > 0;
  if (!structured) return params;
  // Residual: words that aren't make/model, numbers, state codes or filter phrasing.
  const placed = new Set(
    [p.make, p.model, p.state]
      .filter(Boolean)
      .flatMap((v) => String(v).toLowerCase().split(/\s+/)),
  );
  const residual = raw
    .split(/\s+/)
    .filter((w) => {
      const t = w.toLowerCase().replace(/[^a-z0-9-]/g, "");
      return t && !/\d/.test(t) && !FILLER.test(t) && !placed.has(t) && t.length > 1;
    })
    .join(" ");
  if (p.make || p.model) params.set("q", "");
  else params.set("q", residual);
  return params;
}
