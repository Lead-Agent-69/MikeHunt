import { describe, it, expect } from "vitest";
import {
  __resetMarketIndexForTest,
  loadMarketIndex,
  lowFence,
} from "./market-value";

describe("lowFence (Tukey q1−1.5·IQR — adaptive per-market outlier floor)", () => {
  it("catches a below-market listing in a TIGHT bucket the fixed 45% ratio would miss", () => {
    // Corolla-tight market: ~$18k–$19.5k. Fence lands ~$17.5k.
    const corollas = [18000, 18200, 18500, 18800, 19000, 19200, 19500];
    const fence = lowFence(corollas)!;
    expect(fence).toBeGreaterThan(15000);
    expect(fence).toBeLessThan(18500);
    // A $14,850 listing is a genuine outlier here — even though 14850/18500 = 80% (well above 45%).
    expect(14850 < fence).toBe(true);
    // A real market price is NOT flagged.
    expect(18200 < fence).toBe(false);
  });

  it("returns null for a WIDE bucket where nothing is a low outlier", () => {
    // Mixed trims/conditions ($5k rough → $42k loaded): the fence goes ≤0, so we don't false-flag.
    expect(lowFence([5000, 8000, 12000, 20000, 35000, 42000])).toBeNull();
  });

  it("returns null when there are too few comps to trust a spread", () => {
    expect(lowFence([18000, 18500, 19000])).toBeNull();
  });

  it("shares one in-flight market index load across concurrent callers", async () => {
    __resetMarketIndexForTest();
    const calls: Record<string, number> = {};
    const fakeSupabase = {
      from(table: string) {
        const query = {
          select() {
            return query;
          },
          eq() {
            return query;
          },
          gt() {
            return query;
          },
          gte() {
            return query;
          },
          lt() {
            return query;
          },
          async range() {
            calls[table] = (calls[table] || 0) + 1;
            if (table === "deals") {
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            return { data: [], error: null };
          },
        };
        return query;
      },
    };

    await Promise.all([
      loadMarketIndex(fakeSupabase as any),
      loadMarketIndex(fakeSupabase as any),
      loadMarketIndex(fakeSupabase as any),
    ]);

    expect(calls.deals).toBe(1);
    expect(calls.sold_listings).toBe(1);
    expect(calls.market_aggregates).toBe(1);
  });
});
