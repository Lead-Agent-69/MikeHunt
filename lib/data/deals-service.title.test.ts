import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as Array<[string, ...unknown[]]>);

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
        resolve({ data: [], error: null, count: 0 });
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
});
