import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  base: null as unknown,
  error: null as unknown,
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        ilike: () => query,
        gt: () => query,
        not: () => query,
        limit: () => query,
        order: () => query,
        gte: () => query,
        lte: () => query,
        maybeSingle: async () => ({ data: state.base, error: state.error }),
        then: (resolve: any) =>
          Promise.resolve({ data: state.rows, error: state.error }).then(
            resolve,
          ),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
import { GET as depreciation } from "@/app/api/market/depreciation/route";
import { GET as sources } from "@/app/api/deals/[id]/sources/route";
const request = () =>
  new NextRequest(
    "http://localhost/api/market/depreciation?make=Honda&model=Civic",
  );
const context = { params: Promise.resolve({ id: "vehicle-one" }) };
beforeEach(() => {
  state.rows = [];
  state.base = null;
  state.error = null;
});
it("returns trend endpoints at the actual observed mileage bounds", async () => {
  state.rows = Array.from({ length: 8 }, (_, i) => ({
    mileage: 20000 + i * 10000,
    ask_price: 20000 - i * 1000,
  }));
  const body = await (await depreciation(request())).json();
  expect(body.trend).toEqual([
    { mileage: 20000, price: 20000 },
    { mileage: 90000, price: 13000 },
  ]);
});
it("does not convert a database failure into an empty market", async () => {
  state.error = { message: "private database diagnostics" };
  const response = await depreciation(request());
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain(
    "private database diagnostics",
  );
  expect((await sources(request(), context)).status).toBe(503);
});
it("distinguishes an absent listing from a VIN-less listing", async () => {
  expect((await sources(request(), context)).status).toBe(404);
  state.base = { vin: null, make: "Honda", model: "Civic" };
  const response = await sources(request(), context);
  expect(response.status).toBe(200);
  expect((await response.json()).sources).toEqual([]);
});
