import { expect, it, vi } from "vitest";
import { publicInventoryStatus } from "./public-inventory-status";
function database(failure = false, missingCount = false) {
  const calls: unknown[][] = [];
  let index = 0;
  const sb = {
    from: (table: string) => {
      const at = index++;
      const q: any = {};
      calls.push(["from", table]);
      for (const method of [
        "select",
        "eq",
        "not",
        "neq",
        "or",
        "gte",
        "lte",
        "gt",
        "order",
        "limit",
      ])
        q[method] = (...args: unknown[]) => {
          calls.push([method, ...args]);
          return q;
        };
      q.abortSignal = vi.fn((signal: AbortSignal) => {
        calls.push(["signal", signal]);
        return Promise.resolve({
          error: failure ? { message: "private database diagnostics" } : null,
          count: missingCount ? null : [23, 12, 4][at],
          data: at === 3 ? [{ last_seen_at: "2026-10-14T12:00:00Z" }] : null,
        });
      });
      return q;
    },
  };
  return { sb, calls };
}
it("uses four bounded reads without scanning listing options, images or valuations", async () => {
  const { sb, calls } = database();
  const out = await publicInventoryStatus(
    sb,
    Date.parse("2026-10-14T13:00:00Z"),
  );
  expect(out).toMatchObject({
    activeDeals: 23,
    buyerReady: true,
    decisionReady: false,
    freshPhotoListings: 12,
    sourceHealth: { readySources: null },
    freshness: { newLast24h: 4, newestAgeHours: 1, stale: false },
    coverage: "inventory_only",
  });
  expect(calls.filter((x) => x[0] === "from")).toHaveLength(4);
  expect(calls.filter((x) => x[0] === "select").map((x) => x[1])).toEqual([
    "id",
    "id",
    "id",
    "last_seen_at",
  ]);
  expect(calls).toContainEqual(["limit", 1]);
  expect(calls.filter((x) => x[0] === "signal")).toHaveLength(4);
  expect(calls).toContainEqual([
    "or",
    "options->photoAudit->>state.is.null,options->photoAudit->>state.neq.unavailable",
  ]);
});
it("never reports a failed count as zero inventory or readiness", async () => {
  await expect(publicInventoryStatus(database(true).sb)).rejects.toThrow(
    "Inventory status unavailable",
  );
  await expect(publicInventoryStatus(database(false, true).sb)).rejects.toThrow(
    "Inventory count not confirmed",
  );
});
