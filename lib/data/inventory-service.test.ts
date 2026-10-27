import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  filters: [] as unknown[][],
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: (...args: unknown[]) => {
          state.filters.push(args);
          return query;
        },
        order: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: state.rows,
            count: state.rows.length,
            error: null,
          }).then(resolve),
      };
      return query;
    },
  }),
}));
import { InventoryService } from "./inventory-service";
describe("inventory sale amounts", () => {
  it("keeps listing-specific reads scoped to the requested owner", async () => {
    state.filters = [];
    await new InventoryService().getInventory("buyer", { dealId: "vehicle" });
    expect(state.filters).toEqual([
      ["dealer_id", "buyer"],
      ["deal_id", "vehicle"],
    ]);
  });
  it("preserves zero proceeds while retaining unknown sale amounts as unknown", async () => {
    state.rows = [
      { id: "loss", sold_price: 0 },
      { id: "unknown", sold_price: null },
      { id: "sale", sold_price: "12000.25" },
    ];
    const { items } = await new InventoryService().getInventory("owner");
    expect(items.map((item) => item.soldPrice)).toEqual([
      0,
      undefined,
      12000.25,
    ]);
  });
});
