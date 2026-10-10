import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OPENFREEMAP_ATTRIBUTION,
  OPENFREEMAP_STYLES,
  openFreeMapStyleFor,
} from "./openfreemap";

describe("OpenFreeMap basemap", () => {
  it("uses liberty by default and the dark style for the dark theme", () => {
    expect(openFreeMapStyleFor("light")).toBe(
      "https://tiles.openfreemap.org/styles/liberty",
    );
    expect(openFreeMapStyleFor("dark")).toBe(
      "https://tiles.openfreemap.org/styles/dark",
    );
    for (const url of Object.values(OPENFREEMAP_STYLES)) {
      expect(url.startsWith("https://tiles.openfreemap.org/styles/")).toBe(
        true,
      );
    }
  });

  it("carries the attribution OpenFreeMap requires", () => {
    expect(OPENFREEMAP_ATTRIBUTION).toContain("https://openfreemap.org");
    expect(OPENFREEMAP_ATTRIBUTION).toContain("OpenMapTiles");
    expect(OPENFREEMAP_ATTRIBUTION).toContain(
      "https://www.openstreetmap.org/copyright",
    );
  });

  it("DealerMap renders the OpenFreeMap layer, not a keyed/raster tile provider", () => {
    const src = readFileSync("components/map/DealerMap.tsx", "utf8");
    expect(src).toContain("<OpenFreeMapLayer");
    expect(src).not.toMatch(/cartocdn|tile\.openstreetmap|mapbox|<TileLayer/);
  });

  it("CSP allows OpenFreeMap fetches and MapLibre's blob: worker", () => {
    const config = readFileSync("next.config.js", "utf8");
    expect(config).toContain('sources.add("https://tiles.openfreemap.org")');
    expect(config).toMatch(/img-src[^"]*https:\/\/tiles\.openfreemap\.org/);
    expect(config).toContain("\"worker-src 'self' blob:\"");
    expect(config).toContain("\"object-src 'none'\"");
  });
});
