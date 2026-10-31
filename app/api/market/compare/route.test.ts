import { beforeEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { briefCandidate } from "@/lib/deals/__fixtures__/brief-candidate";
const state = vi.hoisted(() => ({
  data: [] as any[],
  error: false,
  calls: [] as any[],
  flip: true,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: () => state.flip,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: () => {
      const q: any = {};
      for (const m of [
        "select",
        "eq",
        "or",
        "ilike",
        "gte",
        "lte",
        "not",
        "neq",
        "order",
        "limit",
        "abortSignal",
      ]) {
        q[m] = (...args: any[]) => {
          state.calls.push([m, ...args]);
          return q;
        };
      }
      q.then = (resolve: any) =>
        Promise.resolve({
          data: state.data,
          error: state.error ? {} : null,
          count: state.data.length,
        }).then(resolve);
      return q;
    },
  }),
}));
import { GET } from "./route";
beforeEach(() => {
  Object.assign(state, {
    data: [{ ...briefCandidate(), mileage: 10000 }],
    error: false,
    calls: [],
    flip: true,
  });
});
it("queries the complete model and exact year, never a first-word wildcard or adjacent years", async () => {
  await GET(
    new NextRequest(
      "https://dealerhunt.vercel.app/api/market/compare?vehicles=Tesla:Model%203:2020",
    ),
  );
  expect(state.calls).toContainEqual(["or", 'model.ilike."Model 3"']);
  expect(state.calls).toContainEqual(["eq", "year", 2020]);
  expect(state.calls.some((c) => c[0] === "gte" && c[1] === "year")).toBe(
    false,
  );
});
it("returns unavailable for query failures instead of zero listings", async () => {
  state.error = true;
  const r = await GET(
    new NextRequest(
      "https://dealerhunt.vercel.app/api/market/compare?vehicles=Honda:Accord:2003",
    ),
  );
  expect(r.status).toBe(503);
  expect((await r.json()).comparison).toBeUndefined();
});
it("retains personal-desk redaction and returns sample metadata", async () => {
  state.flip = false;
  const r = await GET(
    new NextRequest(
      "https://dealerhunt.vercel.app/api/market/compare?vehicles=Honda:Accord:2003",
    ),
  );
  const body = await r.json();
  expect(body.comparison[0].avgProfit).toBeUndefined();
  expect(body.comparison[0].sample.eligible).toBe(1);
});
it("rejects malformed years and wildcard models before querying", async () => {
  const r = await GET(
    new NextRequest(
      "https://dealerhunt.vercel.app/api/market/compare?vehicles=Honda:Acc%25:2003",
    ),
  );
  expect(r.status).toBe(400);
  expect(state.calls).toHaveLength(0);
});
