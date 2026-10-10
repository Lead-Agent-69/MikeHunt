import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fixtureFetch } from "@/lib/vehicle/__fixtures__/nhtsa/fixture-fetch";

const db = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const f: Array<[string, any]> = [];
      const q: any = {
        select: () => q,
        eq: (c: string, v: any) => (f.push([c, v]), q),
        limit: () => q,
        update: () => q,
        maybeSingle: async () => ({
          data:
            (db.tables[table] ?? []).find((r) =>
              f.every(([c, v]) => r[c] === v),
            ) ?? null,
        }),
        upsert: async (row: any, o?: { onConflict?: string }) => {
          const keys = (o?.onConflict ?? "vin").split(",");
          const rows = (db.tables[table] ??= []);
          const i = rows.findIndex((r) => keys.every((k) => r[k] === row[k]));
          if (i >= 0) rows[i] = { ...rows[i], ...row };
          else rows.push(row);
          return { error: null };
        },
      };
      return q;
    },
  }),
}));

const fetchSpy = vi.fn();
vi.stubGlobal("fetch", fetchSpy);

describe("GET /api/vin/[vin]", () => {
  it.each([
    "1HGCM82633A/../x",
    "ABC",
    "1HGCM82633A004352?x=1",
    "IOQ45678901234567",
  ])("rejects %s before any upstream fetch", async (vin) => {
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest(`http://localhost/api/vin/${encodeURIComponent(vin)}`),
      { params: Promise.resolve({ vin }) },
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("GET /api/vin/[vin] decode via shared vin-enrichment (recorded NHTSA)", () => {
  beforeEach(() => {
    db.tables = { vin_decodes: [], nhtsa_recalls_cache: [], deals: [] };
    fetchSpy.mockReset();
    fetchSpy.mockImplementation(fixtureFetch);
  });
  const get = async (vin: string) => {
    const { GET } = await import("./route");
    return GET(new NextRequest(`http://localhost/api/vin/${vin}`), {
      params: Promise.resolve({ vin }),
    });
  };

  it("200: NHTSA extended decode first (no mcp.vin call), family recalls, written to vin_decodes", async () => {
    const res = await get("1FT7W2BT8GED11804");
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b).toMatchObject({
      year: 2016,
      make: "FORD",
      model: "F-250",
      series: "Super Duty - Single Rear Wheel",
      engine: "6.7L V8 Diesel 440hp",
      gvwr: "Class 2H: 9,001 - 10,000 lb (4,082 - 4,536 kg)",
      assembly_plant: "Kentucky Truck, JEFFERSON COUNTY, KENTUCKY",
      recalls: 4,
      recallsScope: "model_year",
      source: "live",
    });
    expect(
      fetchSpy.mock.calls.some(([u]) => String(u).includes("mcp.vin")),
    ).toBe(false);
    expect(db.tables.vin_decodes[0]?.vin).toBe("1FT7W2BT8GED11804");
  });

  it("second call is a cache hit shared with /specs (same vin_decodes row)", async () => {
    await get("1HGCM82633A004352");
    fetchSpy.mockClear();
    const b = await (await get("1HGCM82633A004352")).json();
    expect(b).toMatchObject({
      trim: "EX-V6",
      recalls: 24,
      source: "cache",
      cached: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to mcp.vin only when NHTSA is unavailable", async () => {
    fetchSpy.mockImplementation(async (u: string) =>
      String(u).includes("mcp.vin")
        ? ({
            ok: true,
            json: async () => ({ year: 2003, make: "Honda", model: "Accord" }),
          } as any)
        : ({ ok: false, json: async () => ({}) } as any),
    );
    const b = await (await get("1HGCM82633A004352")).json();
    expect(b).toMatchObject({
      make: "Honda",
      source: "mcp.vin",
      recalls: null,
    });
  });
});
