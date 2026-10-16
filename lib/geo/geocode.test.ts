import { describe, it, expect, vi } from "vitest";
import {
  placeKey,
  parseZippopotam,
  parseNominatim,
  resolvePlaces,
} from "./geocode";

describe("placeKey", () => {
  it("prefers a 5-digit ZIP", () => {
    expect(placeKey({ zip: "75201", city: "Dallas", state: "TX" })).toBe(
      "zip:75201",
    );
  });
  it("extracts a ZIP from ZIP+4", () => {
    expect(placeKey({ zip: "75201-1234" })).toBe("zip:75201");
  });
  it("falls back to normalized city|state", () => {
    expect(placeKey({ city: "  Fort   Worth ", state: "Tx" })).toBe(
      "cs:fort worth|tx",
    );
  });
  it("returns null when nothing usable", () => {
    expect(placeKey({})).toBeNull();
    expect(placeKey({ city: "Dallas" })).toBeNull();
  });
  it("normalizes a repeated matching state without guessing away a conflict", () => {
    expect(placeKey({ city: "Forsyth, MO", state: "MO" })).toBe(
      "cs:forsyth|mo",
    );
    expect(placeKey({ city: "Springfield,mo", state: "MO" })).toBe(
      "cs:springfield|mo",
    );
    expect(placeKey({ city: "Dallas, TX", state: "CT" })).toBe(
      "cs:dallas, tx|ct",
    );
  });
});

describe("parsers", () => {
  it("parses zippopotam", () => {
    expect(
      parseZippopotam({
        places: [{ latitude: "32.7767", longitude: "-96.797" }],
      }),
    ).toEqual({ lat: 32.7767, lng: -96.797 });
  });
  it("rejects null-island / garbage", () => {
    expect(
      parseZippopotam({ places: [{ latitude: "0", longitude: "0" }] }),
    ).toBeNull();
    expect(parseZippopotam({})).toBeNull();
  });
  it("parses nominatim (lat/lon strings)", () => {
    expect(parseNominatim([{ lat: "32.7767", lon: "-96.797" }])).toEqual({
      lat: 32.7767,
      lng: -96.797,
    });
  });
  it("nominatim with no match → null", () => {
    expect(parseNominatim([])).toBeNull();
    expect(parseNominatim({})).toBeNull();
  });
});

function fakeSupabase(
  cacheRows: any[],
  capture: { upserts: any[]; updates?: any[] },
) {
  return {
    from() {
      return {
        select() {
          return { in: async () => ({ data: cacheRows }) };
        },
        upsert(rows: any[]) {
          capture.upserts.push(...rows);
          return Promise.resolve({ error: null });
        },
        update(row: any) {
          (capture.updates ||= []).push(row);
          const query: any = {
            eq: () => query,
            is: () => query,
            then: (resolve: any) => resolve({ error: null }),
          };
          return query;
        },
      };
    },
  } as any;
}

describe("resolvePlaces", () => {
  it("serves from cache without any network call", async () => {
    const capture = { upserts: [] as any[] };
    const sb = fakeSupabase(
      [{ place_key: "zip:75201", lat: 32.78, lng: -96.8 }],
      capture,
    );
    const fetchImpl = vi.fn();
    const out = await resolvePlaces(sb, [{ zip: "75201" }], { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.get("zip:75201")).toEqual({ lat: 32.78, lng: -96.8 });
  });

  it("fetches misses, caps lookups, and writes back to cache", async () => {
    const capture = { upserts: [] as any[] };
    const sb = fakeSupabase([], capture);
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        places: [{ latitude: "10", longitude: "20" }],
      }),
    }));
    const out = await resolvePlaces(
      sb,
      [{ zip: "10001" }, { zip: "10002" }, { zip: "10003" }],
      { fetchImpl, maxLookups: 2 },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2); // capped
    expect(out.size).toBe(2);
    expect(capture.upserts).toHaveLength(2);
    expect(capture.upserts[0].source).toBe("zippopotam");
  });

  it("dedups identical places", async () => {
    const capture = { upserts: [] as any[] };
    const sb = fakeSupabase([], capture);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [{ latitude: "1", longitude: "2" }] }),
    }));
    await resolvePlaces(sb, [{ zip: "90001" }, { zip: "90001" }], {
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("skips remembered failures (negative cache) without a network call", async () => {
    const capture = { upserts: [] as any[] };
    const sb = fakeSupabase(
      [
        {
          place_key: "cs:nowhere|zz",
          lat: 0,
          lng: 0,
          source: "failed",
          created_at: new Date().toISOString(),
        },
      ],
      capture,
    );
    const fetchImpl = vi.fn();
    const out = await resolvePlaces(sb, [{ city: "Nowhere", state: "ZZ" }], {
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.size).toBe(0);
  });

  it("records a 'failed' marker when a lookup resolves nothing", async () => {
    const capture = { upserts: [] as any[] };
    const sb = fakeSupabase([], capture);
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => [] }));
    await resolvePlaces(sb, [{ city: "Ghost", state: "TX" }], { fetchImpl });
    expect(capture.upserts).toHaveLength(1);
    expect(capture.upserts[0].source).toBe("failed");
  });

  it("returns empty for unusable places", async () => {
    const capture = { upserts: [] as any[] };
    const sb = fakeSupabase([], capture);
    const out = await resolvePlaces(sb, [{ city: "Nowhere" }], {
      fetchImpl: vi.fn(),
    });
    expect(out.size).toBe(0);
  });

  it("retries an expired failure and replaces only that failed cache entry", async () => {
    const capture = { upserts: [] as any[], updates: [] as any[] };
    const sb = fakeSupabase(
      [
        {
          place_key: "cs:dallas|tx",
          lat: 0,
          lng: 0,
          source: "failed",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      capture,
    );
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [{ lat: "32.78", lon: "-96.8" }],
    }));
    const out = await resolvePlaces(sb, [{ city: "Dallas", state: "TX" }], {
      fetchImpl,
    });
    expect(out.get("cs:dallas|tx")).toEqual({ lat: 32.78, lng: -96.8 });
    expect(capture.upserts).toEqual([]);
    expect(capture.updates).toMatchObject([
      { source: "nominatim", lat: 32.78 },
    ]);
  });

  it.each([429, 500, 503])(
    "does not cache transient HTTP %s as a missing location",
    async (status) => {
      const capture = { upserts: [] as any[] };
      await resolvePlaces(fakeSupabase([], capture), [{ zip: "75201" }], {
        fetchImpl: vi.fn(async () => ({
          ok: false,
          status,
          json: async () => ({}),
        })),
      });
      expect(capture.upserts).toEqual([]);
    },
  );

  it("does not cache a network exception or malformed success response", async () => {
    const capture = { upserts: [] as any[] };
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: "gateway" }),
      });
    await resolvePlaces(
      fakeSupabase([], capture),
      [{ zip: "75201" }, { city: "Dallas", state: "TX" }],
      { fetchImpl },
    );
    expect(capture.upserts).toEqual([]);
  });
});
