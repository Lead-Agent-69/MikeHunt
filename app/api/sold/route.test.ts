import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  result: { data: [] as any[], error: null as any },
  reject: false,
  calls: [] as { method: string; args: any[] }[][],
  missingBasis: false,
  missingChannel: false,
  gov: { data: [] as any[], error: null as any },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: () => {
      const query: any = {};
      const calls: { method: string; args: any[] }[] = [];
      state.calls.push(calls);
      for (const method of [
        "select",
        "ilike",
        "or",
        "eq",
        "gt",
        "gte",
        "lte",
        "is",
        "in",
        "not",
        "order",
        "limit",
      ])
        query[method] = (...args: any[]) => {
          calls.push({ method, args });
          return query;
        };
      query.then = (resolve: any, reject: any) =>
        state.reject
          ? reject(new Error("private database diagnostic"))
          : calls.some((c) => c.method === "not")
            ? resolve(state.gov)
            : state.missingChannel &&
                calls.some(
                  (c) => c.method === "is" && c.args[0] === "sale_channel",
                )
              ? resolve({
                  data: null,
                  error: {
                    code: "42703",
                    message: "column sold_listings.sale_channel does not exist",
                  },
                })
              : state.missingBasis &&
                  calls.some((c) => c.method === "eq" && c.args[0] === "basis")
                ? resolve({
                    data: null,
                    error: {
                      code: "42703",
                      message: "column sold_listings.basis does not exist",
                    },
                  })
                : resolve(state.result);
      return query;
    },
  }),
}));
import { GET } from "./route";

const request = () =>
  new NextRequest(
    "http://localhost/api/sold?make=Honda&model=Accord&year=2018",
  );
beforeEach(() => {
  state.result = { data: [], error: null };
  state.reject = false;
  state.missingChannel = false;
  state.gov = { data: [], error: null };
  state.calls = [];
  state.missingBasis = false;
});

describe("source-reported sold evidence", () => {
  it("does not imply an empty successful sample when the database fails", async () => {
    state.result.error = { message: "private database diagnostic" };
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database");
  });
  it("handles rejected queries with the same friendly unavailable state", async () => {
    state.reject = true;
    expect((await GET(request())).status).toBe(503);
  });
  it("keeps missing titles unknown and rejects invalid/future sale amounts", async () => {
    const sold_at = new Date(Date.now() - 86400000).toISOString();
    state.result.data = [
      {
        make: "Honda",
        model: "Accord",
        title: "2018 Honda Accord EX",
        sold_price: 14000,
        sold_at,
      },
      {
        make: "Honda",
        model: "Accord",
        title: "2018 Honda Accord clean title",
        sold_price: 16000,
        sold_at,
      },
      { title: "clean title", sold_price: Infinity, sold_at },
      {
        title: "clean title",
        sold_price: 18000,
        sold_at: new Date(Date.now() + 1000).toISOString(),
      },
    ];
    const data = await (await GET(request())).json();
    expect(data.median).toBeNull();
    expect(data.count).toBe(1);
    expect(data.sales).toHaveLength(2);
    expect(data.sales[0].lane).toBe("unknown");
    expect(data.evidenceLabel).toMatch(/not independently verified/);
    expect(Number.isFinite(Date.parse(data.checkedAt))).toBe(true);
  });
  it("returns an honest empty state with a check date and observation window", async () => {
    const data = await (await GET(request())).json();
    expect(data).toMatchObject({ median: null, count: 0, windowDays: 180 });
    expect(data.note).toMatch(/cannot be confirmed/);
    expect(data.checkedAt).toBeTruthy();
  });
  it("excludes other full models and missing vehicle identities from comparisons", async () => {
    const sold_at = new Date(Date.now() - 86400000).toISOString();
    state.result.data = [
      ...Array(3).fill({
        make: "Honda",
        model: "Accord Hybrid",
        title: "clean title",
        sold_price: 19000,
        sold_at,
      }),
      { title: "Honda Accord clean title", sold_price: 18000, sold_at },
      {
        make: "Honda",
        model: "Accord",
        title: "clean title",
        sold_price: 14000,
        sold_at,
      },
    ];
    const data = await (await GET(request())).json();
    expect(data.count).toBe(1);
    expect(data.median).toBeNull();
    expect(data.sales).toHaveLength(1);
  });
  it("reads completed sales only (basis = 'sold') and matches the normalized model", async () => {
    const sold_at = new Date(Date.now() - 86400000).toISOString();
    state.result.data = Array(3).fill({
      make: "Honda",
      model: "accord", // stored by the eBay sold collector through normalizeModel
      title: "2018 Honda Accord EX clean title",
      sold_price: 15000,
      sold_at,
    });
    const data = await (await GET(request())).json();
    expect(data.count).toBe(3);
    const calls = state.calls[0];
    expect(calls).toContainEqual({ method: "eq", args: ["basis", "sold"] });
    expect(calls).toContainEqual({
      method: "or",
      args: ["model.ilike.Accord,model.eq.accord"],
    });
  });
  it("still answers before the basis migration is applied", async () => {
    state.missingBasis = true;
    const response = await GET(request());
    expect(response.status).toBe(200);
    // retail read, retail retry without basis, then the separate gov lane read
    expect(state.calls).toHaveLength(3);
    expect(
      state.calls[1].some((c) => c.method === "eq" && c.args[0] === "basis"),
    ).toBe(false);
  });
  it("retail comps exclude gov / fleet / surplus rows (sale_channel IS NULL)", async () => {
    await GET(request());
    expect(state.calls[0]).toContainEqual({
      method: "eq",
      args: ["basis", "sold"],
    });
    expect(state.calls[0]).toContainEqual({
      method: "is",
      args: ["sale_channel", null],
    });
  });
  it("still answers before the sale_channel migration is applied", async () => {
    state.missingChannel = true;
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(
      state.calls[1].some(
        (c) => c.method === "is" && c.args[0] === "sale_channel",
      ),
    ).toBe(false);
    expect(state.calls[1]).toContainEqual({
      method: "eq",
      args: ["basis", "sold"],
    });
  });
  it("gov rows go to their own lane with the source credit, never into the median", async () => {
    const sold_at = new Date(Date.now() - 86400000).toISOString();
    state.result.data = [];
    state.gov.data = [
      {
        year: 2018,
        make: "Honda",
        model: "Accord",
        title: "2018 Honda Accord",
        sold_price: 4200,
        sold_at,
        source: "gsa_closing_bid",
        source_url: "https://gsaauctions.gov/x",
        basis: "last_bid",
        sale_channel: "gov_fleet_auction",
        attribution:
          "GovAuctions.app GSA dataset, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
      },
      {
        year: 2018,
        make: "Honda",
        model: "Accord",
        sold_price: 3100,
        sold_at,
        source: "govdeals",
        basis: "sold",
        sale_channel: "gov_surplus_auction",
        attribution: null, // no credit, not shown
      },
    ];
    const data = await (await GET(request())).json();
    expect(data.count).toBe(0);
    expect(data.median).toBeNull();
    expect(data.govLane.sales).toHaveLength(1);
    expect(data.govLane.sales[0]).toMatchObject({
      price: 4200,
      priceKind: "last_observed_bid",
      saleChannel: "gov_fleet_auction",
      attribution: expect.stringContaining("CC BY 4.0"),
    });
    expect(data.govLane.credits).toEqual([
      expect.stringContaining("CC BY 4.0"),
    ]);
    const lane = state.calls.find((c) => c.some((x) => x.method === "not"))!;
    expect(lane).toContainEqual({
      method: "not",
      args: ["sale_channel", "is", null],
    });
    expect(lane.find((x) => x.method === "select")!.args[0]).toContain(
      "attribution",
    );
  });
});
