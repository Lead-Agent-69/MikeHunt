// Full-decode + recalls enrichment, driven by recorded real NHTSA responses (__fixtures__/nhtsa).
import { describe, expect, it, vi } from "vitest";
import {
  decodeVinExtended,
  getRecalls,
  parseDecodeExtended,
  recallModelCandidates,
} from "./nhtsa";
import {
  DECODE_TTL_MS,
  RECALLS_TTL_MS,
  decodeToRow,
  getRecallsCached,
  getVinDecode,
  isDecodeFresh,
} from "./vin-enrichment";
import { fixtureFetch, loadFixture } from "./__fixtures__/nhtsa/fixture-fetch";

const HONDA = "1HGCM82633A004352";
const CAMARO = "1G1FJ1R66P0139282";
const F250 = "1FT7W2BT8GED11804";
const NOW = Date.parse("2026-10-10T07:00:00Z");
const result = (vin: string) =>
  loadFixture(`decode-extended-${vin}.json`).Results[0];

/** In-memory stand-in for the two Supabase tables (select().eq()...maybeSingle(), upsert()). */
function fakeSb(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {
    vin_decodes: [],
    nhtsa_recalls_cache: [],
    ...seed,
  };
  const upserts: Array<{ table: string; row: any; onConflict?: string }> = [];
  const sb = {
    tables,
    upserts,
    from(table: string) {
      const filters: Array<[string, any]> = [];
      const q: any = {
        select: () => q,
        eq: (c: string, v: any) => (filters.push([c, v]), q),
        maybeSingle: async () => ({
          data:
            (tables[table] ?? []).find((r) =>
              filters.every(([c, v]) => r[c] === v),
            ) ?? null,
          error: null,
        }),
        upsert: async (row: any, opts?: { onConflict?: string }) => {
          upserts.push({ table, row, onConflict: opts?.onConflict });
          const keys = (opts?.onConflict ?? "vin").split(",");
          const rows = (tables[table] ??= []);
          const i = rows.findIndex((r) => keys.every((k) => r[k] === row[k]));
          if (i >= 0) rows[i] = { ...rows[i], ...row };
          else rows.push(row);
          return { error: null };
        },
      };
      return q;
    },
  };
  return sb;
}

describe("parseDecodeExtended (recorded vPIC DecodeVinValuesExtended)", () => {
  it("2003 Honda Accord: trim, engine, GVWR class and plant", () => {
    const d = parseDecodeExtended(result(HONDA));
    expect(d).toMatchObject({
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: "EX-V6",
      series: null,
      bodyClass: "Coupe",
      doors: 2,
      engine: "3.0L V6 240hp",
      engineConfiguration: "V-Shaped",
      cylinders: 6,
      transmissionStyle: "Automatic",
      transmissionSpeeds: 5,
      gvwr: "Class 1C: 4,001 - 5,000 lb (1,814 - 2,268 kg)",
      gvwrMaxLb: 5000,
      plantCity: "MARYSVILLE",
      plantState: "OHIO",
      plantCountry: "UNITED STATES (USA)",
      madeInUsa: true,
      decodeErrorCode: "0",
      decodeClean: true,
    });
  });

  it("2016 Ford F-250: series (no trim), 4WD, diesel engine label, heavy GVWR, plant company", () => {
    const d = parseDecodeExtended(result(F250));
    expect(d).toMatchObject({
      model: "F-250",
      trim: null,
      series: "Super Duty - Single Rear Wheel",
      bodyClass: "Pickup",
      driveType: "4WD/4-Wheel Drive/4x4",
      fuelType: "Diesel",
      engine: "6.7L V8 Diesel 440hp",
      gvwrMaxLb: 10000,
      plantCompany: "Kentucky Truck",
      plantState: "KENTUCKY",
    });
  });

  it("2023 Camaro ZL1: manual transmission, no config/hp gives a plainer engine label", () => {
    const d = parseDecodeExtended(result(CAMARO));
    expect(d).toMatchObject({
      trim: "ZL1",
      transmissionStyle: "Manual/Standard",
      engine: "6.2L 8 cyl",
      engineHp: null,
      gvwr: "Class 1: 6,000 lb or less (2,722 kg or less)",
      gvwrMaxLb: 6000,
      driveType: null,
    });
  });

  it("a bad check digit still returns partial data but is flagged not clean", () => {
    const d = parseDecodeExtended(
      loadFixture("decode-extended-invalid-check-digit.json").Results[0],
    );
    expect(d.make).toBe("HONDA");
    expect(d.decodeClean).toBe(false);
    expect(d.decodeErrorCode).toBe("1,400");
    expect(d.decodeErrorText).toMatch(/Check Digit/);
  });
});

describe("decodeVinExtended", () => {
  it("hits the Extended endpoint and returns the parsed decode", async () => {
    const f = vi.fn(fixtureFetch);
    const d = await decodeVinExtended(F250, f as any);
    expect(String(f.mock.calls[0][0])).toContain(
      `/DecodeVinValuesExtended/${F250}?format=json`,
    );
    expect(d?.series).toBe("Super Duty - Single Rear Wheel");
  });
  it("rejects invalid VINs without fetching and returns null on upstream failure", async () => {
    const f = vi.fn(fixtureFetch);
    expect(await decodeVinExtended("NOTAVIN", f as any)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    const down = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    expect(await decodeVinExtended(HONDA, down as any)).toBeNull();
  });
});

describe("recalls (recorded api.nhtsa.gov responses)", () => {
  it("querying the vPIC model name directly gives a false zero for the 2016 F-250", () => {
    expect(loadFixture("recalls-ford-f-250-2016.json").Count).toBe(0);
    expect(loadFixture("recalls-ford-f-250-sd-2016.json").Count).toBe(4);
  });

  it("recallModelCandidates maps F-250 to its catalog names, never F-2500 or F-350", () => {
    const cat = loadFixture("recall-models-ford-2016.json").results;
    const c = recallModelCandidates(cat, "F-250");
    expect(c).toEqual(
      expect.arrayContaining([
        "F-250 SD",
        "F-250 SUPERCAB",
        "F-250 REGULAR CAB",
        "F-250 SUPER CREW",
      ]),
    );
    expect(c.every((m) => m === "F-250" || m.startsWith("F-250 "))).toBe(true);
    expect(recallModelCandidates([{ model: "F-2500" }], "F-250")).toEqual([]);
  });

  it("getRecalls unions catalog models: 2016 F-250 -> the 4 F-250 SD campaigns", async () => {
    const r = await getRecalls("FORD", "F-250", 2016, fixtureFetch as any);
    expect(r?.count).toBe(4);
    expect(r?.campaigns.map((c) => c.campaign).sort()).toEqual([
      "16V246000",
      "20E090000",
      "22V337000",
      "25V572000",
    ]);
    expect(r?.modelsQueried).toContain("F-250 SD");
    expect(r?.scope).toBe("model_year");
  });

  it("2003 Accord returns its 24 campaigns; 2023 Camaro is an honest 0 across every variant", async () => {
    expect(
      (await getRecalls("HONDA", "Accord", 2003, fixtureFetch as any))?.count,
    ).toBe(24);
    const cam = await getRecalls(
      "CHEVROLET",
      "Camaro",
      2023,
      fixtureFetch as any,
    );
    expect(cam?.count).toBe(0);
    expect(cam?.modelsQueried.length).toBeGreaterThan(1);
  });

  it("null (unknown), never 0, when NHTSA is down", async () => {
    const down = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    expect(await getRecalls("FORD", "F-250", 2016, down as any)).toBeNull();
  });
});

describe("getVinDecode cache (vin_decodes, 180-day TTL)", () => {
  const opts = { fetchImpl: fixtureFetch as any, now: () => NOW };

  it("miss: live extended decode is written back with decoded/extended/expires timestamps", async () => {
    const sb = fakeSb();
    const r = await getVinDecode(sb, F250, opts);
    expect(r).toMatchObject({ cached: false, stale: false });
    const w = sb.upserts.find((u) => u.table === "vin_decodes")!;
    expect(w.onConflict).toBe("vin");
    expect(w.row).toMatchObject({
      vin: F250,
      series: "Super Duty - Single Rear Wheel",
      gvwr_max_lb: 10000,
      plant_company: "Kentucky Truck",
      decode_clean: true,
      expires_at: new Date(NOW + DECODE_TTL_MS).toISOString(),
    });
    // decode-only write: never clobbers mpg/safety/recall columns of an existing row
    expect(Object.keys(w.row)).not.toContain("mpg_combined");
    expect(Object.keys(w.row)).not.toContain("recalls_count");
  });

  it("write budget spent: serves the live decode but creates no new row", async () => {
    const sb = fakeSb();
    const canWrite = vi.fn(() => false);
    const r = await getVinDecode(sb, F250, { ...opts, canWrite });
    expect(r).toMatchObject({ cached: false, persisted: false });
    expect(r?.decode.make).toBeTruthy();
    expect(canWrite).toHaveBeenCalledTimes(1);
    expect(sb.upserts.filter((u) => u.table === "vin_decodes")).toHaveLength(0);
  });

  it("refreshing an existing row doesn't spend the new-row budget", async () => {
    const legacy = { vin: HONDA, make: "HONDA", model: "Accord", year: 2003 };
    const sb = fakeSb({ vin_decodes: [legacy] });
    const canWrite = vi.fn(() => false);
    const r = await getVinDecode(sb, HONDA, { ...opts, canWrite });
    expect(r?.persisted).toBe(true);
    expect(canWrite).not.toHaveBeenCalled();
  });

  it("fresh extended row: served from cache, no NHTSA call", async () => {
    const row = decodeToRow(
      HONDA,
      parseDecodeExtended(result(HONDA)),
      NOW - 1000,
    );
    const sb = fakeSb({ vin_decodes: [row] });
    const f = vi.fn(fixtureFetch);
    const r = await getVinDecode(sb, HONDA, {
      fetchImpl: f as any,
      now: () => NOW,
    });
    expect(r?.cached).toBe(true);
    expect(r?.decode.trim).toBe("EX-V6");
    expect(f).not.toHaveBeenCalled();
  });

  it("old-style row (no extended_at) or expired row is re-decoded", async () => {
    const legacy = {
      vin: HONDA,
      make: "HONDA",
      model: "Accord",
      year: 2003,
      mpg_combined: 23,
    };
    expect(isDecodeFresh(legacy, NOW)).toBe(false);
    const sb = fakeSb({ vin_decodes: [legacy] });
    const r = await getVinDecode(sb, HONDA, opts);
    expect(r?.cached).toBe(false);
    expect(sb.tables.vin_decodes[0]).toMatchObject({
      mpg_combined: 23,
      gvwr_max_lb: 5000,
    });

    const expired = {
      ...decodeToRow(
        HONDA,
        parseDecodeExtended(result(HONDA)),
        NOW - DECODE_TTL_MS - 1,
      ),
    };
    expect(isDecodeFresh(expired, NOW)).toBe(false);
  });

  it("NHTSA down: an expired row is served marked stale; no row at all is null", async () => {
    const down = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    const expired = decodeToRow(
      HONDA,
      parseDecodeExtended(result(HONDA)),
      NOW - DECODE_TTL_MS - 1,
    );
    const r = await getVinDecode(fakeSb({ vin_decodes: [expired] }), HONDA, {
      fetchImpl: down as any,
      now: () => NOW,
    });
    expect(r).toMatchObject({ cached: true, stale: true });
    expect(
      await getVinDecode(fakeSb(), HONDA, {
        fetchImpl: down as any,
        now: () => NOW,
      }),
    ).toBeNull();
  });
});

describe("getRecallsCached (nhtsa_recalls_cache, 7-day TTL)", () => {
  it("miss writes an upper-cased make/model/year row; a second call is served from cache", async () => {
    const sb = fakeSb();
    const f = vi.fn(fixtureFetch);
    const first = await getRecallsCached(sb, "Ford", "F-250", 2016, {
      fetchImpl: f as any,
      now: () => NOW,
    });
    expect(first).toMatchObject({ count: 4, cached: false });
    const w = sb.upserts.find((u) => u.table === "nhtsa_recalls_cache")!;
    expect(w.onConflict).toBe("make,model,model_year");
    expect(w.row).toMatchObject({
      make: "FORD",
      model: "F-250",
      model_year: 2016,
      recalls_count: 4,
      expires_at: new Date(NOW + RECALLS_TTL_MS).toISOString(),
    });
    const calls = f.mock.calls.length;
    const second = await getRecallsCached(sb, "FORD", "f-250", 2016, {
      fetchImpl: f as any,
      now: () => NOW + 60_000,
    });
    expect(second).toMatchObject({ count: 4, cached: true, stale: false });
    expect(f.mock.calls.length).toBe(calls);
  });

  it("expired row + NHTSA down: stale count is served; nothing cached: null", async () => {
    const down = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    const sb = fakeSb({
      nhtsa_recalls_cache: [
        {
          make: "FORD",
          model: "F-250",
          model_year: 2016,
          recalls_count: 4,
          campaigns: [],
          models_queried: ["F-250 SD"],
          expires_at: new Date(NOW - 1).toISOString(),
        },
      ],
    });
    expect(
      await getRecallsCached(sb, "Ford", "F-250", 2016, {
        fetchImpl: down as any,
        now: () => NOW,
      }),
    ).toMatchObject({ count: 4, stale: true });
    expect(
      await getRecallsCached(fakeSb(), "Ford", "F-250", 2016, {
        fetchImpl: down as any,
        now: () => NOW,
      }),
    ).toBeNull();
  });
});

// Ren #301 blocker: a failed catalog or ANY failed per-model lookup is "unknown", never a cached 0.
describe("getRecalls is all-or-nothing (no partial counts cached)", () => {
  const isCatalog = (u: string) => u.includes("products/vehicle/models");
  const isSdLookup = (u: string) =>
    u.includes("recallsByVehicle") && /model=F-250%20SD/.test(u);
  const abortErr = () =>
    Object.assign(new Error("The operation was aborted"), {
      name: "TimeoutError",
    });

  async function cachedWith(f: any) {
    const sb = fakeSb();
    const r = await getRecallsCached(sb, "Ford", "F-250", 2016, {
      fetchImpl: f,
      now: () => NOW,
    });
    return {
      r,
      writes: sb.upserts.filter((u) => u.table === "nhtsa_recalls_cache"),
    };
  }

  it("baseline: the fixtures give 4 and cache them", async () => {
    const { r, writes } = await cachedWith(fixtureFetch);
    expect(r?.count).toBe(4);
    expect(writes).toHaveLength(1);
  });

  it("catalog times out -> null, no cache write", async () => {
    const f = vi.fn(async (u: string, init?: any) => {
      if (isCatalog(u)) throw abortErr();
      return (fixtureFetch as any)(u, init);
    });
    expect(await getRecalls("FORD", "F-250", 2016, f as any)).toBeNull();
    const { r, writes } = await cachedWith(f);
    expect(r).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("catalog returns 503 -> null, no cache write", async () => {
    const f = vi.fn(async (u: string, init?: any) =>
      isCatalog(u)
        ? { ok: false, json: async () => ({}) }
        : (fixtureFetch as any)(u, init),
    );
    const { r, writes } = await cachedWith(f);
    expect(r).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("catalog body malformed -> null, no cache write", async () => {
    const f = vi.fn(async (u: string, init?: any) =>
      isCatalog(u)
        ? { ok: true, json: async () => ({ oops: 1 }) }
        : (fixtureFetch as any)(u, init),
    );
    const { r, writes } = await cachedWith(f);
    expect(r).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("one per-model lookup returns 503 -> null, no cache write", async () => {
    const f = vi.fn(async (u: string, init?: any) =>
      isSdLookup(u)
        ? { ok: false, json: async () => ({}) }
        : (fixtureFetch as any)(u, init),
    );
    expect(await getRecalls("FORD", "F-250", 2016, f as any)).toBeNull();
    const { r, writes } = await cachedWith(f);
    expect(r).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("one per-model lookup times out -> null, no cache write", async () => {
    const f = vi.fn(async (u: string, init?: any) => {
      if (isSdLookup(u)) throw abortErr();
      return (fixtureFetch as any)(u, init);
    });
    const { r, writes } = await cachedWith(f);
    expect(r).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("one per-model body is oversize (>1 MB) -> null, no cache write", async () => {
    const f = vi.fn(async (u: string, init?: any) =>
      isSdLookup(u)
        ? new Response("x", {
            headers: { "content-length": String(2 * 1024 * 1024) },
          })
        : (fixtureFetch as any)(u, init),
    );
    const { r, writes } = await cachedWith(f);
    expect(r).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("a stale row is still served (not overwritten) when a lookup fails", async () => {
    const f = vi.fn(async (u: string, init?: any) =>
      isSdLookup(u)
        ? { ok: false, json: async () => ({}) }
        : (fixtureFetch as any)(u, init),
    );
    const sb = fakeSb({
      nhtsa_recalls_cache: [
        {
          make: "FORD",
          model: "F-250",
          model_year: 2016,
          recalls_count: 4,
          campaigns: [],
          models_queried: ["F-250 SD"],
          expires_at: new Date(NOW - 1).toISOString(),
        },
      ],
    });
    const r = await getRecallsCached(sb, "Ford", "F-250", 2016, {
      fetchImpl: f as any,
      now: () => NOW,
    });
    expect(r).toMatchObject({ count: 4, stale: true });
    expect(
      sb.upserts.filter((u) => u.table === "nhtsa_recalls_cache"),
    ).toHaveLength(0);
  });
});

describe("recall cache inserts spend the new-row budget", () => {
  it("over budget: live answer served, no new row", async () => {
    const sb = fakeSb();
    const canWrite = vi.fn(() => false);
    const r = await getRecallsCached(sb, "Ford", "F-250", 2016, {
      fetchImpl: fixtureFetch as any,
      now: () => NOW,
      canWrite,
    });
    expect(r).toMatchObject({ count: 4, cached: false });
    expect(canWrite).toHaveBeenCalledTimes(1);
    expect(
      sb.upserts.filter((u) => u.table === "nhtsa_recalls_cache"),
    ).toHaveLength(0);
  });

  it("refreshing an existing (expired) row doesn't spend budget", async () => {
    const sb = fakeSb({
      nhtsa_recalls_cache: [
        {
          make: "FORD",
          model: "F-250",
          model_year: 2016,
          recalls_count: 1,
          campaigns: [],
          models_queried: [],
          expires_at: new Date(NOW - 1).toISOString(),
        },
      ],
    });
    const canWrite = vi.fn(() => false);
    await getRecallsCached(sb, "Ford", "F-250", 2016, {
      fetchImpl: fixtureFetch as any,
      now: () => NOW,
      canWrite,
    });
    expect(canWrite).not.toHaveBeenCalled();
    expect(
      sb.upserts.filter((u) => u.table === "nhtsa_recalls_cache"),
    ).toHaveLength(1);
  });
});
