import { describe, it, expect } from "vitest";
import {
  filterZipRadiusRows,
  milesFrom,
  parseZipRadius,
  resolveZipRadius,
} from "./zip-radius";

const p = (qs: string) => new URLSearchParams(qs);

describe("zip + radius search", () => {
  it("parses and clamps", () => {
    expect(parseZipRadius(p("zip=60601&radius=50"))).toEqual({
      zip: "60601",
      radius: 50,
    });
    expect(parseZipRadius(p("zip=60601"))).toEqual({
      zip: "60601",
      radius: 100,
    });
    expect(parseZipRadius(p("zip=60601&radius=9999"))!.radius).toBe(500);
    expect(parseZipRadius(p("zip=6060&radius=50"))).toBeNull();
    expect(parseZipRadius(p("radius=50"))).toBeNull();
  });

  it("geocodes once and measures rows (no coords → null, never placed)", async () => {
    const zr = await resolveZipRadius(
      {} as any,
      p("zip=60601&radius=50"),
      async () => ({ lat: 41.886, lng: -87.623 }),
    );
    expect(zr).not.toBeNull();
    expect(zr!.box.minLat).toBeLessThan(41.886);
    // Milwaukee is ~82 mi straight-line from the Loop; Evanston ~12.
    expect(milesFrom(zr!, { lat: 42.045, lng: -87.688 })).toBeLessThan(20);
    expect(milesFrom(zr!, { lat: 43.039, lng: -87.906 })).toBeGreaterThan(50);
    expect(milesFrom(zr!, { lat: null, lng: null })).toBeNull();
  });

  it("reports an unresolved ZIP so callers can reject rather than broaden", async () => {
    expect(
      await resolveZipRadius({} as any, p("zip=00000"), async () => null),
    ).toBeNull();
  });

  it("filters the exact circle without rounding distant candidates into range", async () => {
    const zr = await resolveZipRadius(
      {} as any,
      p("zip=63101&radius=50"),
      async () => ({ lat: 38.63, lng: -90.2 }),
    );
    const rows = [
      { id: "MO", lat: 38.63, lng: -90.2 },
      { id: "IL", lat: 38.62, lng: -90.15 },
      { id: "outside", lat: 39.36, lng: -90.2 },
      { id: "missing", lat: null, lng: null },
      { id: "invalid", lat: 999, lng: 0 },
    ];
    expect(filterZipRadiusRows(rows, zr).map((row) => row.id)).toEqual([
      "MO",
      "IL",
    ]);
    expect(filterZipRadiusRows(rows, null)).toBe(rows);
  });
});
