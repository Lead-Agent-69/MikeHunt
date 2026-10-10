// @vitest-environment node
// GET /api/vin/[vin]/specs with recorded NHTSA responses; Supabase replaced by an in-memory table.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fixtureFetch } from "@/lib/vehicle/__fixtures__/nhtsa/fixture-fetch";

const db = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  noAttemptsColumn: false,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const f: Array<[string, any]> = [];
      const q: any = {
        select: () => q,
        eq: (c: string, v: any) => (f.push([c, v]), q),
        maybeSingle: async () => ({
          data:
            (db.tables[table] ?? []).find((r) =>
              f.every(([c, v]) => r[c] === v),
            ) ?? null,
        }),
        upsert: async (row: any, o?: { onConflict?: string }) => {
          if (db.noAttemptsColumn && "extras_attempts" in row)
            return {
              error: {
                message:
                  "Could not find the 'extras_attempts' column of 'vin_decodes' in the schema cache",
              },
            };
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

const fetchSpy = vi.fn(fixtureFetch);
vi.stubGlobal("fetch", fetchSpy);

const F250 = "1FT7W2BT8GED11804";
const get = async (vin: string) => {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/vin/${vin}/specs`), {
    params: Promise.resolve({ vin }),
  });
};

describe("GET /api/vin/[vin]/specs (full decode + recalls)", () => {
  beforeEach(() => {
    db.tables = { vin_decodes: [], nhtsa_recalls_cache: [] };
    db.noAttemptsColumn = false;
    fetchSpy.mockClear();
  });

  it("200: extended decode fields and catalog-resolved recall campaigns", async () => {
    const res = await get(F250);
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b).toMatchObject({
      vin: F250,
      year: 2016,
      make: "FORD",
      model: "F-250",
      series: "Super Duty - Single Rear Wheel",
      bodyClass: "Pickup",
      driveType: "4WD/4-Wheel Drive/4x4",
      engine: "6.7L V8 Diesel 440hp",
      gvwrMaxLb: 10000,
      plant: { company: "Kentucky Truck", state: "KENTUCKY" },
      decodeClean: true,
      recalls: 4,
      recallsScope: "model_year",
      cached: false,
    });
    expect(b.recallCampaigns.map((c: any) => c.campaign)).toContain(
      "16V246000",
    );
    // EPA and safety ratings weren't recorded, so they come back empty rather than invented.
    expect(b.mpg).toBeNull();
    expect(b.safety).toBeNull();
    expect(db.tables.vin_decodes[0]).toMatchObject({
      vin: F250,
      recalls_count: 4,
      plant_company: "Kentucky Truck",
    });
    expect(db.tables.nhtsa_recalls_cache[0]).toMatchObject({
      make: "FORD",
      model: "F-250",
      recalls_count: 4,
    });
  });

  it("second call is served from both caches without touching NHTSA", async () => {
    await get(F250);
    fetchSpy.mockClear();
    const b = await (await get(F250)).json();
    expect(b).toMatchObject({
      cached: true,
      recalls: 4,
      series: "Super Duty - Single Rear Wheel",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("404 when NHTSA can't decode and nothing is cached; 400 for a malformed VIN", async () => {
    fetchSpy.mockImplementation(
      async () => ({ ok: false, status: 503, json: async () => ({}) }) as any,
    );
    expect((await get(F250)).status).toBe(404);
    expect((await get("NOTAVIN")).status).toBe(400);
    fetchSpy.mockImplementation(fixtureFetch);
  });

  it("a failed safety/EPA lookup is retried after 6h, not pinned for 180 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t0 = new Date("2026-10-10T00:00:00Z").getTime();
      vi.setSystemTime(t0);
      await get(F250); // fixtures have no safety/EPA recordings -> both empty
      const isExtra = (u: string) =>
        u.includes("SafetyRatings") || u.includes("fueleconomy.gov");
      const extraCalls = () =>
        fetchSpy.mock.calls.filter(([u]) => isExtra(String(u))).length;
      expect(extraCalls()).toBeGreaterThan(0);

      fetchSpy.mockClear();
      vi.setSystemTime(t0 + 5 * 3_600_000); // inside the 6h retry window
      await get(F250);
      expect(extraCalls()).toBe(0);

      fetchSpy.mockClear();
      vi.setSystemTime(t0 + 6 * 3_600_000 + 1); // past it: retried
      await get(F250);
      expect(extraCalls()).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  const isSafety = (u: string) => u.includes("SafetyRatings");
  const isEpa = (u: string) => u.includes("fueleconomy.gov");
  const calls = (pred: (u: string) => boolean) =>
    fetchSpy.mock.calls.filter(([u]) => pred(String(u))).length;

  it("retries stop after 3 incomplete attempts; the gaps are reported n/a (HD truck)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t0 = new Date("2026-10-10T00:00:00Z").getTime();
      const H = 3_600_000;
      const times = [0, 6 * H + 1, 12 * H + 2];
      for (let i = 0; i < times.length; i++) {
        const t = times[i];
        fetchSpy.mockClear();
        vi.setSystemTime(t0 + t);
        const b = await (await get(F250)).json();
        expect(calls(isSafety) + calls(isEpa)).toBeGreaterThan(0);
        expect(db.tables.vin_decodes[0].extras_attempts).toBe(i + 1);
        expect(b.extrasStatus.mpg).toBe(i + 1 >= 3 ? "n/a" : "pending");
      }
      fetchSpy.mockClear();
      vi.setSystemTime(t0 + 18 * H + 3); // a 4th attempt would be due under the 6h rule
      const b = await (await get(F250)).json();
      expect(calls(isSafety) + calls(isEpa)).toBe(0);
      expect(b.extrasStatus).toEqual({
        safety: "n/a",
        mpg: "n/a",
        heavyDuty: true,
      });

      fetchSpy.mockClear();
      vi.setSystemTime(t0 + 12 * H + 2 + 180 * 24 * H + 1); // settled 180 days ago: new cycle
      await get(F250);
      expect(calls(isSafety) + calls(isEpa)).toBeGreaterThan(0);
      expect(db.tables.vin_decodes[0].extras_attempts).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a complete extras set is looked up again (both) after 180 days, not just re-stamped", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t0 = new Date("2026-10-10T00:00:00Z").getTime();
      const D = 24 * 3_600_000;
      vi.setSystemTime(t0);
      await get(F250);
      Object.assign(db.tables.vin_decodes[0], {
        safety_overall: 5,
        mpg_combined: 20,
        extras_attempts: 1,
        extras_at: new Date(t0).toISOString(),
      });
      fetchSpy.mockClear();
      vi.setSystemTime(t0 + 179 * D);
      await get(F250);
      expect(calls(isSafety) + calls(isEpa)).toBe(0);

      fetchSpy.mockClear();
      vi.setSystemTime(t0 + 180 * D + 1);
      await get(F250);
      expect(calls(isSafety)).toBeGreaterThan(0);
      expect(calls(isEpa)).toBeGreaterThan(0);
      // The lookups came back empty (no recordings), so the old values are kept, not wiped.
      expect(db.tables.vin_decodes[0]).toMatchObject({
        safety_overall: 5,
        mpg_combined: 20,
        extras_attempts: 1,
        extras_at: new Date(t0 + 180 * D + 1).toISOString(),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("before 20261010401000 is applied, extras are still stored (without the counter)", async () => {
    db.noAttemptsColumn = true;
    await get(F250);
    const row = db.tables.vin_decodes[0];
    expect(row.recalls_count).toBe(4);
    expect(row.extras_at).toBeTruthy();
    expect(row).not.toHaveProperty("extras_attempts");
  });

  it("planExtras: retries only the missing value; a stale complete or settled row starts over", async () => {
    const { planExtras, EXTRAS_TTL_MS, EXTRAS_RETRY_MS } =
      await import("@/lib/vehicle/extras-ttl");
    const now = Date.parse("2026-10-10T00:00:00Z");
    const at = (ms: number) => new Date(now - ms).toISOString();
    expect(planExtras(null, now)).toEqual({
      safety: true,
      mpg: true,
      nextAttempts: 1,
    });
    expect(
      planExtras(
        {
          safety_overall: 4,
          extras_attempts: 1,
          extras_at: at(EXTRAS_RETRY_MS + 1),
        },
        now,
      ),
    ).toEqual({ safety: false, mpg: true, nextAttempts: 2 });
    expect(
      planExtras(
        {
          safety_overall: 4,
          mpg_combined: 20,
          extras_attempts: 2,
          extras_at: at(EXTRAS_TTL_MS + 1),
        },
        now,
      ),
    ).toEqual({ safety: true, mpg: true, nextAttempts: 1 });
    expect(
      planExtras({ extras_attempts: 3, extras_at: at(EXTRAS_TTL_MS - 1) }, now),
    ).toMatchObject({
      safety: false,
      mpg: false,
    });
  });

  it("extrasFresh: 180 days when complete, 6h when either value is missing", async () => {
    const { extrasFresh, EXTRAS_TTL_MS, EXTRAS_RETRY_MS } =
      await import("@/lib/vehicle/extras-ttl");
    const now = Date.parse("2026-10-10T00:00:00Z");
    const at = (ms: number) => new Date(now - ms).toISOString();
    const full = { safety_overall: 5, mpg_combined: 20 };
    expect(
      extrasFresh({ ...full, extras_at: at(EXTRAS_TTL_MS - 1) }, now),
    ).toBe(true);
    expect(
      extrasFresh({ ...full, extras_at: at(EXTRAS_TTL_MS + 1) }, now),
    ).toBe(false);
    expect(
      extrasFresh(
        {
          safety_overall: 5,
          mpg_combined: null,
          extras_at: at(EXTRAS_RETRY_MS - 1),
        },
        now,
      ),
    ).toBe(true);
    expect(
      extrasFresh(
        {
          safety_overall: null,
          mpg_combined: 20,
          extras_at: at(EXTRAS_RETRY_MS + 1),
        },
        now,
      ),
    ).toBe(false);
    expect(extrasFresh({ ...full, extras_at: null }, now)).toBe(false);
    expect(extrasFresh(null, now)).toBe(false);
  });
});
