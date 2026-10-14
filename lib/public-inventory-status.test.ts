import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicInventoryStatus } from "./public-inventory-status";

function client(counts = [100, 10, 90, 90, 90, 90, 90, 2, 3, 4]) {
  const queries: any[] = [];
  const sb = {
    from: vi.fn((table: string) => {
      const index = queries.length;
      const query: any = {
        table,
        result: {
          count: counts[index],
          error: null,
          data:
            index === 10 ? { last_seen_at: new Date().toISOString() } : null,
        },
      };
      for (const method of [
        "select",
        "eq",
        "gt",
        "gte",
        "not",
        "neq",
        "or",
        "lt",
        "lte",
        "order",
        "limit",
        "maybeSingle",
        "abortSignal",
      ])
        query[method] = vi.fn(() => query);
      query.then = (resolve: any, reject: any) =>
        Promise.resolve(query.result).then(resolve, reject);
      queries.push(query);
      return query;
    }),
  };
  return { sb: sb as any, queries };
}

describe("publicInventoryStatus", () => {
  beforeEach(() => vi.useRealTimers());
  it("uses ten head-only counts and one timestamp, without scans or private tables", async () => {
    const { sb, queries } = client();
    const status = await publicInventoryStatus(sb);
    expect(status).toMatchObject({
      activeDeals: 100,
      buyerReady: true,
      decisionReady: true,
      sourceHealth: { readySources: null, activeDeals: 100 },
      freshness: { newLast24h: 10, newestAgeHours: 0, stale: false },
      quality: { goDeals: 2, watchCandidates: 3 },
    });
    expect(queries).toHaveLength(11);
    expect(
      queries
        .slice(0, 10)
        .every((q) => q.select.mock.calls[0][1]?.head === true),
    ).toBe(true);
    expect(
      queries.slice(0, 9).every((q) => q.eq.mock.calls[0][0] === "active"),
    ).toBe(true);
    expect(queries[9].table).toBe("sold_listings");
    expect(queries[10].select).toHaveBeenCalledWith("last_seen_at");
    expect(queries[10].limit).toHaveBeenCalledWith(1);
    expect(queries[2].or).toHaveBeenCalledWith(
      "options->photoAudit->>state.is.null,options->photoAudit->>state.neq.unavailable",
    );
    expect(queries[2].gte).toHaveBeenCalledWith(
      "last_seen_at",
      expect.any(String),
    );
    expect(queries[2].lte).toHaveBeenCalledWith(
      "last_seen_at",
      expect.any(String),
    );
    expect(
      queries.every(
        (q) => q.abortSignal.mock.calls[0][0] instanceof AbortSignal,
      ),
    ).toBe(true);
    expect(status).not.toHaveProperty("sources");
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
    "rejects query %i failures instead of reporting healthy zeroes",
    async (index) => {
      const { sb, queries } = client();
      const promise = publicInventoryStatus(sb);
      queries[index].result.error = { message: "private database diagnostics" };
      await expect(promise).rejects.toThrow("Inventory status unavailable");
    },
  );
  it("does not turn missing counts into zero", async () => {
    const { sb, queries } = client();
    const promise = publicInventoryStatus(sb);
    queries[0].result.count = null;
    await expect(promise).rejects.toThrow("Inventory status unavailable");
  });
  it("keeps decision evidence on hold without sold comps", async () => {
    const { sb } = client([100, 10, 90, 90, 90, 90, 90, 2, 3, 0]);
    expect(await publicInventoryStatus(sb)).toMatchObject({
      buyerReady: true,
      decisionReady: false,
    });
  });
  it("keeps thin or stale inventory unready", async () => {
    const thin = client([100, 10, 20, 90, 90, 90, 90, 2, 3, 4]);
    expect(await publicInventoryStatus(thin.sb)).toMatchObject({
      buyerReady: false,
      decisionReady: false,
    });
    const stale = client();
    const promise = publicInventoryStatus(stale.sb);
    stale.queries[10].result.data.last_seen_at = "2000-01-01T00:00:00Z";
    expect(await promise).toMatchObject({
      buyerReady: false,
      decisionReady: false,
      freshness: { stale: true },
    });
  });
});
