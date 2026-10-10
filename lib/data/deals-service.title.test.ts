import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as Array<[string, ...unknown[]]>);
const rows = vi.hoisted(() => ({ value: [] as any[] }));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: () => {
      const q: any = {};
      for (const m of [
        "select",
        "eq",
        "in",
        "or",
        "gte",
        "order",
        "limit",
        "range",
      ])
        q[m] = (...args: unknown[]) => {
          calls.push([m, ...args]);
          return q;
        };
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: rows.value, error: null, count: rows.value.length });
      return q;
    },
  }),
}));

import { DealsService } from "./deals-service";

describe("DealsService titleTypes", () => {
  it("getDeals and searchDeals filter title categories on condition", async () => {
    const service = new DealsService();
    calls.splice(0);
    await service.getDeals({ titleTypes: ["unknown"] });
    expect(calls).toContainEqual([
      "or",
      "condition.in.(run_drive,flood,fire,hail),condition.is.null",
    ]);
    calls.splice(0);
    await service.searchDeals("civic", { titleTypes: ["rebuilt"] });
    expect(calls).toContainEqual(["or", "condition.in.(rebuilt_title)"]);
    calls.splice(0);
    await service.getDeals({});
    expect(
      calls.some(([m, f]) => m === "or" && String(f).startsWith("condition")),
    ).toBe(false);
  });

  it("maps titleCategory + options.titleSource onto each deal", async () => {
    rows.value = [
      {
        id: "d1",
        source: "independent_dealer",
        title: "2015 Civic",
        condition: "salvage_title",
        options: { titleSource: "source_default", seller: "D&G" },
      },
    ];
    const { deals } = await new DealsService().getDeals({});
    expect(deals[0]).toMatchObject({
      titleCategory: "salvage",
      titleSource: "source_default",
    });
    rows.value = [];
  });
});
