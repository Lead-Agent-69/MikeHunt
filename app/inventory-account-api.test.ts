import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  owner: "one" as string | null,
  database: vi.fn(),
  inventory: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({
    data: { user: state.owner ? { id: state.owner } : null },
    error: null,
  }),
}));
vi.mock("@/lib/outcomes/snapshot", () => ({
  outcomePredictionSnapshot: async () => ({}),
}));
vi.mock("@/lib/data/inventory-service", () => ({
  InventoryService: class {
    getInventory = state.inventory;
    mapDbToItem(row: Record<string, unknown>) {
      return {
        id: row.id,
        dealerId: row.dealer_id,
        purchasePrice: row.purchase_price,
        stage: row.stage,
      };
    }
  },
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: state.database,
}));
import { GET, POST, PATCH } from "./api/inventory/route";
const handlers = { GET, POST, PATCH };
beforeEach(() => {
  vi.clearAllMocks();
  state.owner = "one";
  state.inventory.mockResolvedValue({ items: [], total: 0, hasMore: false });
  state.insert.mockImplementation((payload) => ({
    select: () => ({
      single: async () => ({ data: { ...payload }, error: null }),
    }),
  }));
  state.database.mockReturnValue({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: null, error: null }),
        insert:
          table === "inventory"
            ? state.insert
            : (payload: unknown) => ({
                select: () => ({
                  single: async () => ({ data: payload, error: null }),
                }),
              }),
      };
      return query;
    },
  });
});
function request(
  method: keyof typeof handlers,
  owner?: string,
  query = "",
  body = {},
) {
  return handlers[method](
    new NextRequest(`http://localhost/api/inventory${query}`, {
      method,
      headers: owner ? { "x-inventory-owner": owner } : {},
      ...(method !== "GET" ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
describe("inventory account boundaries", () => {
  it.each(["GET", "POST", "PATCH"] as const)(
    "rejects %s from an account that changed before the server receives it",
    async (method) => {
      expect((await request(method, "previous-owner")).status).toBe(409);
      expect(state.database).not.toHaveBeenCalled();
      expect(state.inventory).not.toHaveBeenCalled();
    },
  );
  it.each(["GET", "POST", "PATCH"] as const)(
    "requires authentication for %s even with an owner header",
    async (method) => {
      state.owner = null;
      expect((await request(method, "one")).status).toBe(401);
      expect(state.database).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, "one"])(
    "rejects a stale legacy dealer query even when header is %s",
    async (header) => {
      expect((await request("GET", header, "?dealerId=two")).status).toBe(409);
      expect(state.inventory).not.toHaveBeenCalled();
    },
  );
  it("returns an explicit owner and prohibits caching personal inventory", async () => {
    const response = await request("GET", "one", "?limit=100");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ownerId: "one", items: [] });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(state.inventory).toHaveBeenCalledWith(
      "one",
      expect.objectContaining({ limit: 100 }),
    );
  });
  it("bounds a listing-specific lookup to the authenticated owner and one record", async () => {
    const dealId = "a0000000-0000-4000-8000-000000000001";
    expect(
      (await request("GET", "one", `?dealId=${dealId}&limit=500`)).status,
    ).toBe(200);
    expect(state.inventory).toHaveBeenCalledWith(
      "one",
      expect.objectContaining({ dealId, limit: 1 }),
    );
    state.inventory.mockClear();
    expect((await request("GET", "one", "?dealId=invalid")).status).toBe(400);
    expect(state.inventory).not.toHaveBeenCalled();
  });
  it("derives a purchase's owner from the session and returns the same mapped contract as reads", async () => {
    const response = await request("POST", "one", "", {
      id: "a0000000-0000-4000-8000-000000000001",
      purchaseDate: "2026-01-01",
      make: "Honda",
      model: "Civic",
      dealerId: "forged",
      purchasePrice: 100,
      stage: "acquired",
    });
    expect(response.status).toBe(200);
    expect(state.insert).toHaveBeenCalledWith(
      expect.objectContaining({ dealer_id: "one", purchase_price: 100 }),
    );
    expect(await response.json()).toMatchObject({
      ownerId: "one",
      item: {
        id: "a0000000-0000-4000-8000-000000000001",
        dealerId: "one",
        purchasePrice: 100,
        stage: "acquired",
      },
    });
  });
});
