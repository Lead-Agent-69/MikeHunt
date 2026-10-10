import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  result: { data: [] as any[], error: null as any },
  reject: false,
  calls: [] as { method: string; args: any[] }[][],
  missingBasis: false,
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
    expect(state.calls).toHaveLength(2);
    expect(
      state.calls[1].some((c) => c.method === "eq" && c.args[0] === "basis"),
    ).toBe(false);
  });
});
