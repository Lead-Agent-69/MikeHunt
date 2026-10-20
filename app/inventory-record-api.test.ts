import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  row: {
    id: "unit",
    dealer_id: "owner",
    stage: "offer",
    repair_cost: 100,
  } as Record<string, unknown>,
  updated: { id: "unit", stage: "recon" } as Record<string, unknown> | null,
  payload: {} as Record<string, unknown>,
  outcomePayload: {} as Record<string, unknown>,
  outcomeRead: { data: null, error: null } as {
    data: Record<string, unknown> | null;
    error: unknown;
  },
  outcomeWrite: { data: { id: "outcome" }, error: null } as {
    data: Record<string, unknown> | null;
    error: unknown;
  },
  filters: [] as unknown[][],
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: { id: "owner" } }, error: null }),
}));
vi.mock("@/lib/data/inventory-service", () => ({
  InventoryService: class {
    mapDbToItem(row: unknown) {
      return row;
    }
  },
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: (table: string) => {
      let writing = false;
      const query = {
        select: () => query,
        eq: (...args: unknown[]) => {
          state.filters.push([table, ...args]);
          return query;
        },
        is: (...args: unknown[]) => {
          state.filters.push([table, ...args]);
          return query;
        },
        update: (payload: Record<string, unknown>) => {
          writing = true;
          if (table === "inventory") state.payload = payload;
          else state.outcomePayload = payload;
          return query;
        },
        single: async () =>
          table === "inventory"
            ? { data: state.row, error: null }
            : state.outcomeWrite,
        maybeSingle: async () =>
          table === "inventory"
            ? { data: writing ? state.updated : null, error: null }
            : writing
              ? state.outcomeWrite
              : state.outcomeRead,
        insert: (payload: Record<string, unknown>) => {
          writing = true;
          state.outcomePayload = payload;
          return query;
        },
      };
      return query;
    },
  }),
}));
import { PATCH } from "./api/inventory/route";

beforeEach(() => {
  state.row = {
    id: "unit",
    dealer_id: "owner",
    stage: "offer",
    repair_cost: 100,
  };
  state.updated = { id: "unit", stage: "recon" };
  state.payload = {};
  state.outcomePayload = {};
  state.outcomeRead = { data: null, error: null };
  state.outcomeWrite = { data: { id: "outcome" }, error: null };
  state.filters = [];
});
async function patch(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest("http://localhost/api/inventory", {
      method: "PATCH",
      body: JSON.stringify({ id: "unit", ...body }),
    }),
  );
}
describe("confirmed inventory records", () => {
  it.each([undefined, -1, "1200", null, 1.234, 100000001])(
    "rejects an invalid actual sale price %s",
    async (soldPrice) => {
      expect((await patch({ stage: "sold", soldPrice })).status).toBe(400);
      expect(state.payload).toEqual({});
    },
  );
  it("accepts an explicitly recorded zero sale and scopes the mutation to the owner and read stage", async () => {
    state.updated = { id: "unit", stage: "sold" };
    expect((await patch({ stage: "sold", soldPrice: 0 })).status).toBe(200);
    expect(state.payload).toMatchObject({ sold_price: 0, stage: "sold" });
    expect(state.filters).toContainEqual(["inventory", "dealer_id", "owner"]);
    expect(state.filters).toContainEqual(["inventory", "stage", "offer"]);
  });
  it("records an expense against the expected category total", async () => {
    expect(
      (
        await patch({
          expense: { category: "repair", amount: 25.55, expectedTotal: 100 },
        })
      ).status,
    ).toBe(200);
    expect(state.payload).toEqual({ repair_cost: 125.55 });
    expect(state.filters).toContainEqual(["inventory", "repair_cost", 100]);
  });
  it("rejects stale expense totals and unconfirmed concurrent writes", async () => {
    expect(
      (
        await patch({
          expense: { category: "repair", amount: 20, expectedTotal: 0 },
        })
      ).status,
    ).toBe(409);
    expect(state.payload).toEqual({});
    state.updated = null;
    expect((await patch({ stage: "recon" })).status).toBe(409);
  });
  it.each(["__proto__", "constructor", "missing"])(
    "rejects unsupported category %s",
    async (category) => {
      expect(
        (await patch({ expense: { category, amount: 20, expectedTotal: 100 } }))
          .status,
      ).toBe(400);
    },
  );
  it("does not mutate another owner's vehicle or record the same sale again", async () => {
    state.row.dealer_id = "other";
    expect((await patch({ stage: "recon" })).status).toBe(403);
    state.row.dealer_id = "owner";
    state.row.stage = "sold";
    expect((await patch({ stage: "sold", soldPrice: 1200 })).status).toBe(409);
    expect(state.payload).toEqual({});
  });
  it("reports a confirmed Pipeline sale separately from a failed outcome copy", async () => {
    state.outcomeWrite = { data: null, error: { code: "unavailable" } };
    const response = await patch({ stage: "sold", soldPrice: 1200 });
    expect(response.status).toBe(200);
    expect((await response.json()).outcomeReview).toMatchObject({
      synced: false,
    });
    expect(state.payload).toMatchObject({ sold_price: 1200 });
  });
  it("copies an unreviewed sale using revision checks and never certifies costs", async () => {
    state.outcomeRead = {
      data: { id: "outcome", revision: 3, sell_price: null },
      error: null,
    };
    const body = await (await patch({ stage: "sold", soldPrice: 0 })).json();
    expect(body.outcomeReview.synced).toBe(true);
    expect(state.outcomePayload).toMatchObject({
      sell_price: 0,
      costs_complete: false,
    });
    expect(state.filters).toContainEqual(["deal_outcomes", "revision", 3]);
    expect(state.filters).toContainEqual(["deal_outcomes", "user_id", "owner"]);
    state.outcomeWrite = { data: null, error: null };
    expect(
      (await (await patch({ stage: "sold", soldPrice: 0 })).json())
        .outcomeReview.synced,
    ).toBe(false);
  });
  it("preserves an existing sale and surfaces its separate review requirement", async () => {
    state.outcomeRead = {
      data: { id: "outcome", revision: 3, sell_price: 2000 },
      error: null,
    };
    const body = await (await patch({ stage: "sold", soldPrice: 1200 })).json();
    expect(body.outcomeReview.synced).toBe(false);
    expect(state.outcomePayload).toEqual({});
  });
});
