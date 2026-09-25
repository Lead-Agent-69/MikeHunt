import { describe, it, expect } from "vitest";
import { parseOsrm, roadRoute } from "./routing";

const okFetch = (distanceMeters: number, durationSec: number) => async () => ({
  ok: true,
  json: async () => ({
    code: "Ok",
    routes: [{ distance: distanceMeters, duration: durationSec }],
  }),
});

describe("parseOsrm", () => {
  it("converts meters/seconds to miles/minutes", () => {
    expect(
      parseOsrm({
        code: "Ok",
        routes: [{ distance: 1609.344, duration: 600 }],
      }),
    ).toEqual({
      miles: 1,
      minutes: 10,
    });
  });

  it("rejects non-Ok or empty responses", () => {
    expect(parseOsrm({ code: "NoRoute", routes: [] })).toBeNull();
    expect(parseOsrm({ code: "Ok", routes: [] })).toBeNull();
    expect(parseOsrm(null)).toBeNull();
    expect(
      parseOsrm({ code: "Ok", routes: [{ distance: 0, duration: 0 }] }),
    ).toBeNull();
  });
});

describe("roadRoute", () => {
  // ~782mi / 14.1h, distinct coords so the module cache doesn't collide with other tests.
  const dallas = { lat: 32.78, lng: -96.8 };
  const atlanta = { lat: 33.75, lng: -84.39 };

  it("returns real road miles + minutes when OSRM answers", async () => {
    const r = await roadRoute(dallas, atlanta, {
      fetchImpl: okFetch(782 * 1609.344, 14.1 * 3600) as any,
    });
    expect(r?.mode).toBe("road");
    expect(r?.miles).toBe(782);
    expect(r?.minutes).toBe(Math.round(14.1 * 60));
  });

  it("falls back to a haversine estimate when OSRM is unreachable", async () => {
    const r = await roadRoute(
      { lat: 47.6, lng: -122.33 }, // Seattle
      { lat: 25.76, lng: -80.19 }, // Miami — unique coords, avoids cache
      {
        fetchImpl: async () => {
          throw new Error("network down");
        },
      },
    );
    expect(r?.mode).toBe("estimate");
    // Seattle→Miami great-circle ≈ 2735mi → ×1.3 ≈ 3550mi; just assert it's a sane large estimate.
    expect(r!.miles).toBeGreaterThan(2500);
    expect(r!.minutes).toBeGreaterThan(0);
  });

  it("returns null for invalid coordinates", async () => {
    // NaN is caught by the up-front finite guard.
    expect(await roadRoute({ lat: NaN, lng: 0 }, atlanta)).toBeNull();
    // Out-of-range lat passes the finite guard but the haversine fallback rejects it → null.
    expect(
      await roadRoute(
        dallas,
        { lat: 999, lng: 0 },
        {
          fetchImpl: async () => {
            throw new Error("osrm down");
          },
        },
      ),
    ).toBeNull();
  });
});
