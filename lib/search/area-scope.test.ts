import { describe, expect, it } from "vitest";
import {
  normalizeMarketArea,
  searchAreaLabel,
  searchAreaMode,
  replaceStateArea,
  EMPTY_SEARCH_AREA,
} from "./area-scope";

describe("coherent geographic scope", () => {
  it("Nationwide has no radius and a radius without a center never claims Nationwide", () => {
    expect(searchAreaLabel(EMPTY_SEARCH_AREA)).toBe("Nationwide");
    expect(searchAreaMode({ ...EMPTY_SEARCH_AREA, radius: "100" })).toBe(
      "nearby",
    );
    expect(searchAreaLabel({ ...EMPTY_SEARCH_AREA, radius: "100" })).toBe(
      "Choose a location",
    );
  });
  it("matches the API's circle precedence without displaying ignored state filters", () => {
    expect(
      normalizeMarketArea({
        ...EMPTY_SEARCH_AREA,
        near: "63101",
        states: ["MO"],
      }),
    ).toEqual({ ...EMPTY_SEARCH_AREA, near: "63101", radius: "100" });
    expect(
      normalizeMarketArea({
        ...EMPTY_SEARCH_AREA,
        near: "63101",
        lat: "38.6",
        lng: "-90.2",
        radius: "75",
        states: ["MO"],
      }),
    ).toEqual({
      ...EMPTY_SEARCH_AREA,
      lat: "38.6",
      lng: "-90.2",
      radius: "75",
    });
    expect(
      searchAreaLabel({ ...EMPTY_SEARCH_AREA, near: "63101", lat: "38" }),
    ).toBe("Check search area");
  });
  it("clears an irrelevant radius from a statewide scope", () => {
    const value = normalizeMarketArea({
      ...EMPTY_SEARCH_AREA,
      states: ["MO", "IL"],
      radius: "100",
    });
    expect(value.radius).toBe("");
    expect(searchAreaLabel(value)).toBe("MO, IL");
  });
  it.each([false, true])(
    "switches area atomically and preserves vehicle constraints (Market=%s)",
    (market) => {
      const initial = new URLSearchParams(
        "near=63101&zip=63304&lat=38&lng=-90&radius=100&states=MO&state=IL&scope=nearby&page=5&offset=100&q=Ford&fuelType=Hybrid&sort=distanceMiles&sortDir=asc",
      );
      const params = replaceStateArea(initial, [], market);
      for (const key of [
        "near",
        "zip",
        "lat",
        "lng",
        "radius",
        "scope",
        "page",
        "offset",
        "states",
      ])
        expect(params.has(key), key).toBe(false);
      expect(params.get("q")).toBe("Ford");
      expect(params.get("fuelType")).toBe("Hybrid");
      expect(params.get("state")).toBe(market ? null : "Nationwide");
      expect(params.get("sort")).toBe(market ? "lastSeenAt" : "newest");
      expect(initial.get("zip")).toBe("63304");
      const states = replaceStateArea(initial, ["MO", "IL"], market);
      expect(states.get("states")).toBe("MO,IL");
      expect(states.has("radius")).toBe(false);
    },
  );
});
