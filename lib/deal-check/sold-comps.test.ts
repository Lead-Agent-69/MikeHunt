import { describe, expect, it } from "vitest";
import {
  dealCheckModelKey,
  loadDealCheckSoldRows,
  toDealCheckSoldRow,
} from "./sold-comps";

const NOW = Date.parse("2026-10-09T12:00:00Z");

function fakeClient(result: { data: any; error: any }, missingBasis = false) {
  const calls: { method: string; args: any[] }[][] = [];
  return {
    calls,
    client: {
      from(table: string) {
        expect(table).toBe("sold_listings");
        const mine: { method: string; args: any[] }[] = [];
        calls.push(mine);
        const q: any = {};
        for (const m of [
          "select",
          "ilike",
          "or",
          "eq",
          "gt",
          "gte",
          "lte",
          "order",
          "limit",
        ])
          q[m] = (...args: any[]) => {
            mine.push({ method: m, args });
            return q;
          };
        q.then = (r: any, j: any) =>
          Promise.resolve(
            missingBasis &&
              mine.some((c) => c.method === "eq" && c.args[0] === "basis")
              ? {
                  data: null,
                  error: {
                    code: "42703",
                    message: "column sold_listings.basis does not exist",
                  },
                }
              : result,
          ).then(r, j);
        return q;
      },
    } as any,
  };
}

describe("deal-check sold comps", () => {
  it("keys the model the way the eBay sold collector stores it", () => {
    expect(dealCheckModelKey("Ford", "F-150 XLT")).toEqual({
      make: "Ford",
      model: "f150",
    });
    expect(dealCheckModelKey("Jeep", "Grand Cherokee Laredo")).toEqual({
      make: "Jeep",
      model: "grandcherokee",
    });
    expect(dealCheckModelKey("Chevy", "Silverado 1500 LT")).toEqual({
      make: "Chevrolet",
      model: "silverado1500",
    });
  });

  it("maps sold_listings rows onto DealCheckCompRow", () => {
    expect(
      toDealCheckSoldRow({
        sold_price: "15000",
        sold_at: "2026-10-01T00:00:00Z",
        location_state: "TX",
        source: "ebay_motors",
        source_item_id: "123",
        source_url: "https://www.ebay.com/itm/123",
        vin: "1HGCV1F30JA000001",
        year: 2018,
        mileage: 50000,
        title: "2018 Honda Accord, clean title",
      }),
    ).toEqual({
      sold_price: 15000,
      sold_at: "2026-10-01T00:00:00Z",
      location_state: "TX",
      source: "ebay_motors",
      source_deal_id: "123",
      source_url: "https://www.ebay.com/itm/123",
      vin: "1HGCV1F30JA000001",
      year: 2018,
      mileage: 50000,
      title: "2018 Honda Accord, clean title",
    });
  });

  it("reads with basis = 'sold', the 180-day window, normalized model and year ±1", async () => {
    const { client, calls } = fakeClient({
      data: [
        { make: "Ford", model: "f150", sold_price: 20000, source_item_id: "1" },
        {
          make: "Ford",
          model: "F-150",
          sold_price: 21000,
          source_item_id: "2",
        },
        {
          make: "Ford",
          model: "f150raptor",
          sold_price: 60000,
          source_item_id: "3",
        },
        {
          make: "Ford",
          model: "F-250",
          sold_price: 30000,
          source_item_id: "4",
        },
      ],
      error: null,
    });
    const rows = await loadDealCheckSoldRows(
      client,
      { make: "Ford", model: "F-150 XLT", year: 2018 },
      NOW,
    );
    expect(rows.map((r) => r.source_deal_id)).toEqual(["1", "2"]);
    const c = calls[0];
    expect(c).toContainEqual({ method: "eq", args: ["basis", "sold"] });
    expect(c).toContainEqual({
      method: "or",
      args: ["model.eq.f150,model.ilike.F-150*"],
    });
    expect(c).toContainEqual({ method: "gte", args: ["year", 2017] });
    expect(c).toContainEqual({ method: "lte", args: ["year", 2019] });
    expect(c).toContainEqual({
      method: "gte",
      args: ["sold_at", new Date(NOW - 180 * 86_400_000).toISOString()],
    });
  });

  it("still reads before the basis migration, and throws on other errors", async () => {
    const pre = fakeClient({ data: [], error: null }, true);
    await expect(
      loadDealCheckSoldRows(pre.client, { make: "Ford", model: "F-150" }, NOW),
    ).resolves.toEqual([]);
    expect(pre.calls).toHaveLength(2);
    const bad = fakeClient({
      data: null,
      error: { code: "57014", message: "timeout" },
    });
    await expect(
      loadDealCheckSoldRows(bad.client, { make: "Ford", model: "F-150" }, NOW),
    ).rejects.toThrow();
  });
});
