import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rows = vi.hoisted(() => ({ value: [] as any[] }));
const resolveCallerFlipDesk = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({}),
}));
vi.mock("@/lib/db/paginate", () => ({
  fetchAllRows: async () => rows.value,
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({ resolveCallerFlipDesk }));

import { GET } from "./route";

const req = (ip: string) =>
  new NextRequest("http://localhost/api/deals/map", {
    headers: { "x-forwarded-for": ip },
  });

const decimals = (n: number) => (String(n).split(".")[1] || "").length;

beforeEach(() => {
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
