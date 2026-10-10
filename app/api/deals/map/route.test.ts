import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rows = vi.hoisted(() => ({ value: [] as any[] }));
const qcalls = vi.hoisted(() => ({
  list: [] as Array<[string, ...unknown[]]>,
}));
const resolveCallerFlipDesk = vi.hoisted(() => vi.fn());

// Recursive recording builder: every chained call is logged and returns the same builder.
const builder = vi.hoisted(() => {
  const rec: any = new Proxy(
    {},
    {
      get:
        (_t, prop: string) =>
        (...args: unknown[]) => {
          qcalls.list.push([prop, ...args]);
          return rec;
        },
    },
  );
  return rec;
});

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from: () => builder }),
}));
vi.mock("@/lib/db/paginate", () => ({
  // Run the route's query builder once so tests can see its filters, then return fixtures.
  fetchAllRows: async (build: (from: number, to: number) => unknown) => {
    build(0, 999);
    return rows.value;
  },
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({ resolveCallerFlipDesk }));

import { GET } from "./route";

const req = (ip: string) =>
  new NextRequest("http://localhost/api/deals/map", {
    headers: { "x-forwarded-for": ip },
  });

const decimals = (n: number) => (String(n).split(".")[1] || "").length;

beforeEach(() => {
  qcalls.list = [];
  resolveCallerFlipDesk.mockReset();
  resolveCallerFlipDesk.mockResolvedValue(false);
});

describe("GET /api/deals/map coordinate coarsening", () => {
  it("rounds exact geocodes and centroid fallbacks to 2 decimals and sets no-store", async () => {
    rows.value = [
      {
        id: "a",
        year: 2019,
        make: "Ford",
        model: "F-150",
        ask_price: 20000,
        true_net_profit: 3000,
        deal_verdict: "go",
        lat: 38.6270251,
        lng: -90.1994042,
        location_city: "St. Louis",
        location_state: "MO",
      },
      {
        id: "b",
        year: 2017,
        make: "Honda",
        model: "Civic",
        ask_price: 9000,
        true_net_profit: 500,
        deal_verdict: "hold",
        lat: null,
        lng: null,
        location_city: null,
        location_state: "KS",
      },
    ];
    const res = await GET(req("10.1.1.1"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.points).toHaveLength(2);
    for (const p of body.points) {
      expect(decimals(p.lat)).toBeLessThanOrEqual(2);
      expect(decimals(p.lng)).toBeLessThanOrEqual(2);
    }
    expect(body.points[0]).toMatchObject({ lat: 38.63, lng: -90.2 });
    expect(JSON.stringify(body)).not.toContain("38.6270251");
    // Guests: no profit in the label.
    expect(body.points[0].label).not.toMatch(/profit/i);
  });

  it("empty result is no-store too", async () => {
    rows.value = [];
    const res = await GET(req("10.1.1.2"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("GET /api/deals/map verdict gate", () => {
  const verdictCalls = () =>
    qcalls.list.filter(
      ([m, col]) => (m === "eq" || m === "in") && col === "deal_verdict",
    );
  const one = {
    id: "g",
    year: 2020,
    make: "Kia",
    model: "Soul",
    ask_price: 8000,
    true_net_profit: 900,
    deal_verdict: "go",
    lat: 39.1,
    lng: -94.5,
    location_city: "KC",
    location_state: "MO",
  };

  it("guests: ?verdict= (and the go/hold default) is ignored and markers are neutral", async () => {
    resolveCallerFlipDesk.mockResolvedValue(false);
    rows.value = [one];
    for (const qs of [
      "",
      "?verdict=go",
      "?verdict=go,hold",
      "?verdict=actionable",
    ]) {
      qcalls.list = [];
      const res = await GET(
        new NextRequest(`http://localhost/api/deals/map${qs}`, {
          headers: { "x-forwarded-for": "10.2.2.2" },
        }),
      );
      expect(verdictCalls()).toEqual([]);
      const body = await res.json();
      expect(body.points[0].type).toBe("dealer");
    }
  });

  it("flip desk: verdict filter applies and markers keep verdict colors", async () => {
    resolveCallerFlipDesk.mockResolvedValue(true);
    rows.value = [one];
    const res = await GET(
      new NextRequest("http://localhost/api/deals/map?verdict=go", {
        headers: { "x-forwarded-for": "10.2.2.3" },
      }),
    );
    expect(verdictCalls()).toEqual([["eq", "deal_verdict", "go"]]);
    expect((await res.json()).points[0].type).toBe("private");
  });
});
