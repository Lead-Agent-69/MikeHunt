// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression for "zip-radius search returns nothing for 33601 (Tampa)".
// Root cause: the route defaulted to verdict=go while every active listing is graded pass/hold,
// so ?zip=33601&radius=50 filtered out all 489 FL listings in Dade City (~30 mi away).

const user = vi.hoisted(() => ({
  current: { id: "u1" } as { id: string } | null,
}));
const geocode = vi.hoisted(() => vi.fn());
const calls = vi.hoisted(() => [] as [string, ...unknown[]][]);
const dealRows = vi.hoisted(() => ({ rows: [] as any[] }));

vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: user.current } }),
}));
vi.mock("@/lib/geo/geocode", () => ({ geocodeZip: geocode }));
vi.mock("@/lib/deals/deal-desk-access", async () => {
  const actual = await vi.importActual<any>("@/lib/deals/deal-desk-access");
  return { ...actual, resolveCallerFlipDesk: async () => false };
});
vi.mock("@/lib/supabase", () => {
  // Minimal PostgREST-style builder: records the deals filters and applies eq/gte/lte so the
  // test fails if the route narrows rows the way the bug did.
  const builder = (table: string) => {
    const filters: ((r: any) => boolean)[] = [];
    const b: any = {
      select: () => b,
      maybeSingle: async () => ({ data: null }),
      eq: (col: string, val: unknown) => {
        if (table === "deals") {
          calls.push(["eq", col, val]);
          filters.push((r) => r[col] === val);
        }
        return b;
      },
      not: (col: string, op: string, val: unknown) => {
        if (table === "deals") calls.push(["not", col, op, val]);
        if (op === "is") filters.push((r) => r[col] != null);
        return b;
      },
      gt: (col: string, val: number) => {
        filters.push((r) => r[col] > val);
        return b;
      },
      gte: (col: string, val: number) => {
        filters.push((r) => r[col] >= val);
        return b;
      },
      lte: (col: string, val: number) => {
        filters.push((r) => r[col] <= val);
        return b;
      },
      limit: () => b,
      then: (res: (v: any) => unknown) =>
        res({ data: dealRows.rows.filter((r) => filters.every((f) => f(r))) }),
    };
    return b;
  };
  return { createServerComponentClient: () => ({ from: builder }) };
});

import { GET } from "./route";
import { nearVerdictFilter } from "@/lib/discovery/near-lock";

// Real geography: zippopotam's 33601 centroid, and the Dade City / Miami centroids the FL rows carry.
const TAMPA_33601 = { lat: 27.9961, lng: -82.582 };
const row = (
  id: string,
  verdict: string,
  lat: number | null,
  lng: number | null,
  city: string,
) => ({
  id,
  source: "dealer_site",
  source_url: `https://example.test/${id}`,
  title: `2015 Honda Civic ${id}`,
  year: 2015,
  make: "Honda",
  model: "Civic",
  ask_price: 9000,
  active: true,
  deal_verdict: verdict,
  location_city: city,
  location_state: "FL",
  images: [],
  lat,
  lng,
});

const near = (qs: string) =>
  GET(new NextRequest(`https://x.test/api/deals/near?${qs}`)).then((r) =>
    r.json(),
  );

beforeEach(() => {
  user.current = { id: "u1" };
  calls.length = 0;
  geocode.mockReset();
  geocode.mockResolvedValue(TAMPA_33601);
  dealRows.rows = [
    row("dade-pass", "pass", 28.3647, -82.1959, "Dade City"),
    row("dade-hold", "hold", 28.3647, -82.1959, "Dade City"),
    row("miami-pass", "pass", 25.7742, -80.1936, "Miami"),
    row("no-coords", "pass", null, null, "Tampa"),
  ];
});

describe("GET /api/deals/near zip-radius", () => {
  it("33601 + 50 mi finds the Dade City listings (no hidden verdict=go default)", async () => {
    const body = await near("zip=33601&radius=50");
    expect(body.state).toBe("FL");
    expect(geocode).toHaveBeenCalledWith(expect.anything(), { zip: "33601" });
    expect(calls).not.toContainEqual(["eq", "deal_verdict", "go"]);
    expect(
      calls.some(([op, col]) => op === "eq" && col === "deal_verdict"),
    ).toBe(false);
    const ids = body.deals.map((d: any) => d.id).sort();
    expect(ids).toEqual(["dade-hold", "dade-pass"]);
    // Centroid to centroid: Dade City is ~33 mi from the 33601 centroid; Miami (~210 mi) and the
    // row without coordinates are outside a 50 mi radius.
    for (const d of body.deals) expect(d.distanceMiles).toBeGreaterThan(25);
    for (const d of body.deals) expect(d.distanceMiles).toBeLessThan(45);
  });

  it("no radius: the whole locked state, nearest first, rows without coords last", async () => {
    const body = await near("zip=33601");
    expect(body.deals.map((d: any) => d.id)).toEqual([
      "dade-pass",
      "dade-hold",
      "miami-pass",
      "no-coords",
    ]);
  });

  it("an explicit verdict still narrows; verdict=all and junk do not", async () => {
    expect((await near("zip=33601&radius=50&verdict=go")).deals).toEqual([]);
    expect(calls).toContainEqual(["eq", "deal_verdict", "go"]);
    expect(
      (await near("zip=33601&radius=50&verdict=hold")).deals.map(
        (d: any) => d.id,
      ),
    ).toEqual(["dade-hold"]);
    expect((await near("zip=33601&radius=50&verdict=all")).deals).toHaveLength(
      2,
    );
    expect(
      (await near("zip=33601&radius=50&verdict=bogus")).deals,
    ).toHaveLength(2);
  });

  it("a ZIP that can't be geocoded asks for a location instead of silently returning nothing", async () => {
    geocode.mockResolvedValue(null);
    const body = await near("zip=33601&radius=50");
    expect(body).toMatchObject({ deals: [], needsLocation: true });
  });

  it("signed out says so instead of an empty list that looks like 'nothing near you'", async () => {
    user.current = null;
    expect(await near("zip=33601&radius=50")).toEqual({
      deals: [],
      needsSignIn: true,
    });
  });
});

describe("nearVerdictFilter", () => {
  it.each([
    [null, null],
    ["", null],
    ["all", null],
    ["GO", "go"],
    [" hold ", "hold"],
    ["pass", "pass"],
    ["actionable", null],
  ])("%j -> %j", (raw, want) => {
    expect(nearVerdictFilter(raw)).toBe(want);
  });
});
