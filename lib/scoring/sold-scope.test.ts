import { describe, expect, it, vi } from "vitest";
import { applyRetailSoldScope, withRetailSold } from "./sold-scope";

describe("retail sold scope", () => {
  it("applies completed-sale and retail-channel filters", () => {
    const query: any = {};
    query.eq = vi.fn(() => query);
    query.is = vi.fn(() => query);
    expect(applyRetailSoldScope(query, { basis: true, retailOnly: true })).toBe(
      query,
    );
    expect(query.eq).toHaveBeenCalledWith("basis", "sold");
    expect(query.is).toHaveBeenCalledWith("sale_channel", null);
  });

  it("drops only rollout filters whose columns do not exist", async () => {
    const scopes: unknown[] = [];
    const result = await withRetailSold(async (scope) => {
      scopes.push({ ...scope });
      if (scopes.length === 1)
        return {
          data: null,
          error: {
            code: "PGRST204",
            message: "Could not find the 'sale_channel' column",
          },
        };
      return { data: [{ id: 1 }], error: null };
    });
    expect(scopes).toEqual([
      { basis: true, retailOnly: true },
      { basis: true, retailOnly: false },
    ]);
    expect(result.data).toEqual([{ id: 1 }]);
  });

  it("does not hide real database errors", async () => {
    const run = vi.fn(async () => ({
      data: null,
      error: { code: "42501", message: "permission denied" },
    }));
    const result = await withRetailSold(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.error?.code).toBe("42501");
  });
});
