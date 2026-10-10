import { describe, it, expect } from "vitest";
import { milesFrom, parseZipRadius, resolveZipRadius } from "./zip-radius";

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

  it("an unknown ZIP turns the filter off instead of failing", async () => {
    expect(
      await resolveZipRadius({} as any, p("zip=00000"), async () => null),
    ).toBeNull();
  });
});
