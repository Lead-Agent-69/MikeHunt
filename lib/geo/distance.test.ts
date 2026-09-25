import { describe, it, expect } from "vitest";
import { haversineMiles, withinMiles, boundingBox } from "./distance";

describe("boundingBox (ZIP-radius pre-filter)", () => {
  it("brackets the center and every corner is within ~radius·√2", () => {
    const lat = 29.76,
      lng = -95.37; // Houston
    const bb = boundingBox(lat, lng, 50);
    expect(bb.minLat).toBeLessThan(lat);
    expect(bb.maxLat).toBeGreaterThan(lat);
    expect(bb.minLng).toBeLessThan(lng);
    expect(bb.maxLng).toBeGreaterThan(lng);
    // A point just outside the box in latitude is beyond the radius (box half-height ≈ 50mi).
    expect(haversineMiles(lat, lng, bb.maxLat, lng)!).toBeGreaterThan(49);
    expect(haversineMiles(lat, lng, bb.maxLat, lng)!).toBeLessThan(52);
  });

  it("widens in longitude at higher latitude (cos correction)", () => {
    const north = boundingBox(61, -149, 50); // Anchorage
    const equatorish = boundingBox(10, -84, 50); // Costa Rica
    const lngSpan = (b: ReturnType<typeof boundingBox>) => b.maxLng - b.minLng;
    expect(lngSpan(north)).toBeGreaterThan(lngSpan(equatorish));
  });
});

describe("haversineMiles", () => {
  it("is ~0 for identical points", () => {
    expect(haversineMiles(40, -74, 40, -74)).toBeCloseTo(0, 5);
  });

  it("matches a known distance (NYC ↔ LA ≈ 2445 mi)", () => {
    const d = haversineMiles(40.7128, -74.006, 34.0522, -118.2437)!;
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2500);
  });

  it("matches a short hop (Dallas ↔ Fort Worth ≈ 32 mi)", () => {
    const d = haversineMiles(32.7767, -96.797, 32.7555, -97.3308)!;
    expect(d).toBeGreaterThan(28);
    expect(d).toBeLessThan(36);
  });

  it("returns null on invalid input", () => {
    expect(haversineMiles(NaN, 0, 0, 0)).toBeNull();
    expect(haversineMiles(200, 0, 0, 0)).toBeNull();
    expect(haversineMiles(0, 999, 0, 0)).toBeNull();
  });
});

describe("withinMiles", () => {
  const dallas = { lat: 32.7767, lng: -96.797 };
  const fortWorth = { lat: 32.7555, lng: -97.3308 };
  const la = { lat: 34.0522, lng: -118.2437 };

  it("true when inside the radius", () => {
    expect(withinMiles(dallas, fortWorth, 50)).toBe(true);
  });
  it("false when outside the radius", () => {
    expect(withinMiles(dallas, fortWorth, 20)).toBe(false);
    expect(withinMiles(dallas, la, 100)).toBe(false);
  });
  it("false when either point is missing coords", () => {
    expect(withinMiles(dallas, { lat: null, lng: null }, 9999)).toBe(false);
    expect(withinMiles({}, fortWorth, 9999)).toBe(false);
  });
});
