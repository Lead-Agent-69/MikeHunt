import { validCoords } from "@/lib/geo/buyer-home";

export type SearchAreaValue = {
  near: string;
  radius: string;
  lat: string;
  lng: string;
  states: string[];
};
export type SearchAreaMode = "nationwide" | "nearby" | "states";
export const EMPTY_SEARCH_AREA: SearchAreaValue = {
  near: "",
  radius: "",
  lat: "",
  lng: "",
  states: [],
};
export const AREA_RADIUS_STEPS = [
  5, 10, 25, 50, 75, 100, 150, 200, 250, 500, 1000,
];

export function searchAreaMode(value: SearchAreaValue): SearchAreaMode {
  if (value.near || value.lat || value.lng) return "nearby";
  if (value.states.length) return "states";
  // An incomplete shared radius query needs a location, never a Nationwide label.
  return value.radius ? "nearby" : "nationwide";
}

export function normalizeMarketArea(value: SearchAreaValue): SearchAreaValue {
  if (value.lat || value.lng || value.near) {
    const pin = validCoords(value.lat, value.lng);
    return {
      ...value,
      near: pin ? "" : value.near.trim(),
      states: [],
      radius: value.radius || "100",
    };
  }
  if (value.states.length) return { ...value, radius: "" };
  return value;
}

export function searchAreaLabel(value: SearchAreaValue): string {
  const mode = searchAreaMode(value);
  if (mode === "nationwide") return "Nationwide";
  if (mode === "states")
    return value.states.length <= 3
      ? value.states.join(", ")
      : `${value.states.length} selected states`;
  if ((value.lat || value.lng) && !validCoords(value.lat, value.lng))
    return "Check search area";
  if (!value.near && !validCoords(value.lat, value.lng))
    return "Choose a location";
  const radius = Number(value.radius || 100);
  if (!Number.isFinite(radius) || radius < 1 || radius > 1000)
    return "Check search area";
  return `Within ${radius.toLocaleString("en-US")} mi of ${value.near || "your location"}`;
}

/** State / Nationwide changes must retire the previous geographic circle in every inventory view. */
export function replaceStateArea(
  input: URLSearchParams,
  states: string[],
  market = false,
) {
  const params = new URLSearchParams(input);
  for (const key of [
    "state",
    "states",
    "near",
    "zip",
    "radius",
    "lat",
    "lng",
    "page",
    "offset",
  ])
    params.delete(key);
  if (params.get("scope") === "nearby") params.delete("scope");
  if (params.get("sort") === "distanceMiles") {
    params.set("sort", market ? "lastSeenAt" : "newest");
    if (market) params.set("sortDir", "desc");
    else params.delete("sortDir");
  }
  if (market) {
    if (states.length) params.set("states", states.join(","));
  } else if (states.length === 1) params.set("state", states[0]);
  else if (states.length) params.set("states", states.join(","));
  else params.set("state", "Nationwide");
  return params;
}
