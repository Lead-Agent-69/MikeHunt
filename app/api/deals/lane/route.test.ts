import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const resolveCallerFlipDesk = vi.hoisted(() => vi.fn());
const calls = vi.hoisted(() => ({ select: "", inArgs: null as any }));

const row = {
  id: "d1",
  vin: "1HGCM82633A004352",
  year: 2018,
  make: "Honda",
  model: "Accord",
  ask_price: 9000,
  sell_estimate: 12000,
  deal_verdict: "go",
  true_net_profit: 2100,
  recommended_max_bid: 9500,
  deal_analysis: { costs: { repair: 500, transport: 200 }, profit: 2100 },
  embedding: "[0.1]",
  lat: 41.1234567,
  options: { contact: { phone: "5550100" } },
};

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: () => ({
      select: (c: string) => {
        calls.select = c;
        const q: any = {
          in: (_k: string, v: any) => {
            calls.inArgs = v;
            return Promise.resolve({ data: [row], error: null });
          },
          eq: () => q,
          order: () => q,
          limit: () => Promise.resolve({ data: [row], error: null }),
        };
        return q;
      },
    }),
  }),
}));
vi.mock("@/lib/deals/deal-desk-access", async (orig) => {
  const actual = await orig<typeof import("@/lib/deals/deal-desk-access")>();
  return { ...actual, resolveCallerFlipDesk };
});

import { GET } from "./route";

let n = 0;
const req = (qs = "") =>
  new NextRequest(`http://localhost/api/deals/lane${qs}`, {
    headers: { "x-forwarded-for": `10.5.0.${n++ % 250}` },
  });

beforeEach(() => {
  getServerUser.mockReset();
  resolveCallerFlipDesk.mockReset();
  getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  resolveCallerFlipDesk.mockResolvedValue(false);
});

describe("GET /api/deals/lane", () => {
  it("401 for signed-out callers, no-store", async () => {
    getServerUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("explicit columns: never embedding, geo or options", async () => {
    await GET(req("?vins=1HGCM82633A004352"));
    const cols = calls.select.split(",").map((c) => c.trim());
    expect(calls.select).not.toContain("*");
    for (const c of [
      "embedding",
      "lat",
      "lng",
      "location_zip",
      "options",
      "pricing_breakdown",
    ]) {
      expect(cols).not.toContain(c);
    }
  });

  it("sanitizes and caps the VIN list", async () => {
    await GET(
      req(`?vins=${encodeURIComponent("1hgcm82633a004352, bad;drop,(x)")}`),
    );
    expect(calls.inArgs).toEqual(["1HGCM82633A004352"]);
  });

  it("personal desk gets no flip economics", async () => {
    const body = await (await GET(req("?vins=1HGCM82633A004352"))).json();
    const d = body.deals[0];
    expect(body.deskAccess).toBe("personal");
    for (const k of [
      "deal_verdict",
      "true_net_profit",
      "recommended_max_bid",
    ]) {
      expect(d).not.toHaveProperty(k);
    }
    expect(d.deal_analysis ?? d.dealAnalysis).toEqual({
      costs: { repair: 500, transport: 200 },
    });
  });

  it("flip desk keeps lane economics", async () => {
    resolveCallerFlipDesk.mockResolvedValue(true);
    const body = await (await GET(req())).json();
    expect(body.deals[0].true_net_profit).toBe(2100);
    expect(body.deals[0].recommended_max_bid).toBe(9500);
  });
});
