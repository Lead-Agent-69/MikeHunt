import { afterEach, expect, it, vi } from "vitest";
import {
  inventoryFailureDiagnostic,
  publicInventoryStatus,
} from "./public-inventory-status";
afterEach(() => vi.restoreAllMocks());
function database(
  failure = false,
  missingCount = false,
  resultFor?: (index: number) => Record<string, unknown>,
) {
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
          ...resultFor?.(at),
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

it.each(["active", "fresh_photos", "added_24h", "newest"])(
  "identifies a failed %s read without retaining private database diagnostics",
  async (read) => {
    const at = ["active", "fresh_photos", "added_24h", "newest"].indexOf(read);
    const { sb, calls } = database(false, false, (index) =>
      index === at
        ? { error: { message: "private SQL and token" }, status: 503 }
        : {},
    );
    const error = await publicInventoryStatus(sb).catch((error) => error);
    expect(inventoryFailureDiagnostic(error)).toEqual({
      read,
      reason: "database",
      durationMs: expect.any(Number),
      httpStatus: 503,
    });
    expect(JSON.stringify(error)).not.toContain("private SQL");
    expect(calls.filter((call) => call[0] === "from")).toHaveLength(4);
  },
);

it.each([
  [{ code: "57014" }, 500, "database_canceled"],
  [{ message: "private rate limit" }, 429, "rate_limited"],
  [{ message: "private network error" }, 0, "transport"],
] as const)(
  "classifies failures without exposing error payloads: %s",
  async (error, status, reason) => {
    const { sb } = database(false, false, (at) =>
      at === 1 ? { error, status } : {},
    );
    const failure = await publicInventoryStatus(sb).catch((error) => error);
    expect(inventoryFailureDiagnostic(failure)).toMatchObject({
      read: "fresh_photos",
      reason,
      httpStatus: status || null,
    });
  },
);

it("labels an aborted inventory deadline without retrying any read", async () => {
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
  const { sb, calls } = database(true);
  const error = await publicInventoryStatus(sb).catch((error) => error);
  expect(inventoryFailureDiagnostic(error)).toMatchObject({
    reason: "deadline",
  });
  expect(AbortSignal.timeout).toHaveBeenCalledWith(4000);
  expect(calls.filter((call) => call[0] === "from")).toHaveLength(4);
});

it("sanitizes a thrown transport exception without retaining its message", async () => {
  const { sb } = database(false, false, (at) => {
    if (at === 2) throw new Error("private transport details");
    return {};
  });
  const failure = await publicInventoryStatus(sb).catch((error) => error);
  expect(inventoryFailureDiagnostic(failure)).toMatchObject({
    read: "added_24h",
    reason: "transport",
    httpStatus: null,
  });
  expect(JSON.stringify(failure)).not.toContain("private transport");
});

it("distinguishes invalid counts and strips unknown exceptions from diagnostics", async () => {
  const error = await publicInventoryStatus(database(false, true).sb).catch(
    (error) => error,
  );
  expect(inventoryFailureDiagnostic(error)).toMatchObject({
    reason: "invalid_count",
  });
  expect(
    inventoryFailureDiagnostic(new Error("private unexpected error")),
  ).toEqual({ reason: "unexpected" });
});
it("never reports a failed count as zero inventory or readiness", async () => {
  await expect(publicInventoryStatus(database(true).sb)).rejects.toThrow(
    "Inventory status unavailable",
  );
  await expect(publicInventoryStatus(database(false, true).sb)).rejects.toThrow(
    "Inventory count not confirmed",
  );
});
