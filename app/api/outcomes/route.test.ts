import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { completeSale } from "@/lib/outcomes/ledger.fixture";
import { validateOutcome } from "@/lib/outcomes/ledger";
const state = vi.hoisted(() => ({
  user: "a0110000-0000-4000-8000-000000000001" as string | null,
  results: [] as Array<{ data: unknown; error: unknown }>,
  filters: [] as unknown[][],
  writes: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({
    data: { user: state.user ? { id: state.user } : null },
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/outcomes/snapshot", () => ({
  outcomePredictionSnapshot: vi.fn(async () => ({
    year: 2020,
    make: "Ford",
    model: "Escape",
    prediction_basis: "market_supported",
    predicted_sell: 15000,
  })),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: (table: string) => {
      const done = async () =>
        state.results.shift() ?? { data: null, error: null };
      const query = {
        select: () => query,
        order: () => query,
        eq: (...args: unknown[]) => {
          state.filters.push([table, ...args]);
          return query;
        },
        limit: (n: number) => {
          state.filters.push([table, "limit", n]);
          return query;
        },
        insert: (body: Record<string, unknown>) => {
          state.writes.push(body);
          return query;
        },
        update: (body: Record<string, unknown>) => {
          state.writes.push(body);
          return query;
        },
        single: done,
        maybeSingle: done,
        then: (resolve: (value: unknown) => unknown) => done().then(resolve),
      };
      return query;
    },
  }),
}));
import { GET, POST, PATCH } from "./route";
const owner = "a0110000-0000-4000-8000-000000000001";
const id = "b0110000-0000-4000-8000-000000000001";
const deal = "c0110000-0000-4000-8000-000000000001";
const actuals = () => validateOutcome(completeSale()).row;
const saved = () => ({
  ...actuals(),
  id,
  user_id: owner,
  revision: 1,
  deal_id: null,
  inventory_id: null,
});
const request = (
  body: Record<string, unknown>,
  method = "POST",
  header = owner,
) =>
  new NextRequest("http://localhost/api/outcomes", {
    method,
    body: JSON.stringify({ id, ...body }),
    headers: { "content-type": "application/json", "x-outcome-owner": header },
  });
beforeEach(() => {
  state.user = owner;
  state.results = [];
  state.filters = [];
  state.writes = [];
});
describe("owner outcome writes", () => {
  it("requires authentication for reads and both writes", async () => {
    state.user = null;
    expect((await GET()).status).toBe(401);
    expect((await POST(request({}))).status).toBe(401);
    expect((await PATCH(request({}, "PATCH"))).status).toBe(401);
    expect(state.writes).toHaveLength(0);
  });
  it("rejects a stale account and invalid actual costs before any write", async () => {
    expect(
      (await POST(request(completeSale(), "POST", "another-owner"))).status,
    ).toBe(409);
    expect(
      (await POST(request(completeSale({ actual_recon: -1 })))).status,
    ).toBe(400);
    expect(state.writes).toHaveLength(0);
  });
  it("derives ownership and profit server-side and ignores forged predictions", async () => {
    state.results.push({ data: saved(), error: null });
    const response = await POST(
      request({
        ...completeSale(),
        user_id: "victim",
        actual_profit: 999999,
        predicted_profit: 999999,
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).outcome.actual_profit).toBe(2180);
    expect(state.writes[0].user_id).toBe(owner);
    expect(state.writes[0]).not.toHaveProperty("actual_profit");
    expect(state.writes[0]).not.toHaveProperty("predicted_profit");
  });
  it("does not reconstruct a prediction after a completed sale", async () => {
    state.results.push({ data: { ...saved(), deal_id: deal }, error: null });
    expect(
      (await POST(request({ ...completeSale(), deal_id: deal }))).status,
    ).toBe(200);
    expect(state.writes[0]).toMatchObject({ year: 2020, make: "Ford" });
    expect(state.writes[0]).not.toHaveProperty("predicted_sell");
  });
  it("scopes edits to the signed-in owner and expected revision", async () => {
    state.results.push(
      { data: saved(), error: null },
      { data: { ...saved(), revision: 2 }, error: null },
    );
    expect(
      (await PATCH(request({ ...completeSale(), revision: 1 }, "PATCH")))
        .status,
    ).toBe(200);
    expect(state.filters.filter((f) => f[1] === "user_id")).toHaveLength(2);
    expect(state.filters).toContainEqual(["deal_outcomes", "revision", 1]);
  });
  it("does not expose foreign records or overwrite a concurrent edit", async () => {
    state.results.push({ data: null, error: null });
    expect(
      (await PATCH(request({ ...completeSale(), revision: 1 }, "PATCH")))
        .status,
    ).toBe(404);
    state.results.push({ data: { ...saved(), revision: 3 }, error: null });
    expect(
      (await PATCH(request({ ...completeSale(), revision: 1 }, "PATCH")))
        .status,
    ).toBe(409);
    expect(state.writes).toHaveLength(0);
  });
  it("replays an already saved PATCH without writing again", async () => {
    state.results.push({ data: { ...saved(), revision: 2 }, error: null });
    const response = await PATCH(
      request({ ...completeSale(), revision: 1 }, "PATCH"),
    );
    expect((await response.json()).replayed).toBe(true);
    expect(state.writes).toHaveLength(0);
  });
  it("recovers a POST retry using its stable id and exact actuals", async () => {
    state.results.push(
      { data: null, error: { code: "23505" } },
      { data: saved(), error: null },
    );
    const response = await POST(request(completeSale()));
    expect(response.status).toBe(200);
    expect((await response.json()).replayed).toBe(true);
    expect(state.filters).toContainEqual(["deal_outcomes", "user_id", owner]);
  });
  it("rejects a collision with another owner instead of exposing it", async () => {
    state.results.push(
      { data: null, error: { code: "23505" } },
      { data: null, error: null },
    );
    expect((await POST(request(completeSale()))).status).toBe(409);
  });
  it("requires owned inventory before linking it", async () => {
    state.results.push({ data: null, error: null });
    expect(
      (await POST(request({ ...completeSale(), inventory_id: deal }))).status,
    ).toBe(404);
    expect(state.filters).toContainEqual(["inventory", "dealer_id", owner]);
    expect(state.writes).toHaveLength(0);
  });
  it("returns a conflict if the atomic revision check loses a race", async () => {
    state.results.push(
      { data: saved(), error: null },
      { data: null, error: null },
    );
    expect(
      (await PATCH(request({ ...completeSale(), revision: 1 }, "PATCH")))
        .status,
    ).toBe(409);
  });
  it("bounds reads, filters listing and owner, and masks unreviewed profit", async () => {
    state.results.push({
      data: [{ ...saved(), costs_complete: false, actual_profit: 999999 }],
      error: null,
    });
    const response = await GET(
      new NextRequest(`http://localhost/api/outcomes?dealId=${deal}`),
    );
    const body = await response.json();
    expect(body.ownerId).toBe(owner);
    expect(body.outcomes[0].actual_profit).toBeNull();
    expect(state.filters).toContainEqual(["deal_outcomes", "deal_id", deal]);
    expect(state.filters).toContainEqual(["deal_outcomes", "user_id", owner]);
    expect(state.filters).toContainEqual(["deal_outcomes", "limit", 200]);
  });
});
