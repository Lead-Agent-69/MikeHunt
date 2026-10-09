import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  result: { data: [] as any[], error: null as any },
  reject: false,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: () => {
      const query: any = {};
      for (const method of [
        "select",
        "ilike",
        "eq",
        "gt",
        "gte",
        "lte",
        "order",
        "limit",
      ])
        query[method] = () => query;
      query.then = (resolve: any, reject: any) =>
        state.reject
          ? reject(new Error("private database diagnostic"))
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
      { title: "2018 Honda Accord EX", sold_price: 14000, sold_at },
      { title: "2018 Honda Accord clean title", sold_price: 16000, sold_at },
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
});
