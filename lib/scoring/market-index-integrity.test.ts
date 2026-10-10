import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetMarketIndexForTest,
  loadMarketIndex,
  lookupMarketValue,
  lookupRealSold,
} from "./market-value";

const ask = {
  make: "Honda",
  model: "Accord",
  year: 2018,
  source: "cars_com",
  ask_price: 15000,
  condition: "used",
  title: "clean title",
  mileage: 40000,
};
const sale = {
  make: "Honda",
  model: "Accord",
  year: 2018,
  sold_price: 14000,
  title: "clean title",
  sold_at: new Date(Date.now() - 86400000).toISOString(),
};
function client(read: (table: string, from: number) => any) {
  return {
    from(table: string) {
      const q: any = {};
      for (const method of ["select", "eq", "gt", "lt", "gte", "order"])
        q[method] = () => q;
      q.range = async (from: number) => read(table, from);
      return q;
    },
  } as any;
}
beforeEach(__resetMarketIndexForTest);
describe("market index completeness", () => {
  it("invalidates prior asking values after a rejected refresh", async () => {
    await loadMarketIndex(
      client(() => ({ data: Array(6).fill(ask), error: null })),
    );
    expect(lookupMarketValue("Honda", "Accord", 2018)).not.toBeNull();
    await loadMarketIndex(
      client(() => {
        throw new Error("network interrupted");
      }),
      true,
    );
    expect(lookupMarketValue("Honda", "Accord", 2018)).toBeNull();
  });
  it("does not score with a partial asking index after a later page fails", async () => {
    await loadMarketIndex(
      client((_table, from) =>
        from === 0
          ? { data: Array(1000).fill(ask), error: null }
          : { data: null, error: { message: "page failed" } },
      ),
    );
    expect(lookupMarketValue("Honda", "Accord", 2018)).toBeNull();
  });
  it("removes old sold anchors instead of replacing them with a partial refresh", async () => {
    await loadMarketIndex(
      client((table) => ({
        data: Array(3).fill(table === "deals" ? ask : sale),
        error: null,
      })),
    );
    expect(lookupRealSold("Honda", "Accord", 2018)?.n).toBe(3);
    await loadMarketIndex(
      client((table, from) =>
        table === "deals"
          ? { data: [ask], error: null }
          : from === 0
            ? { data: Array(1000).fill(sale), error: null }
            : { data: null, error: { message: "sold page failed" } },
      ),
      true,
    );
    expect(lookupRealSold("Honda", "Accord", 2018)).toBeNull();
  });
});
