import { describe, expect, it } from "vitest";
import type { ArbitrageComp } from "@/lib/arbitrage";
import {
  ebayItemId,
  loadCheckListingData,
  matchComps,
  sameModel,
  soldTitleCondition,
} from "./check-listing-data";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function fakeSupabase(rows: Record<string, any[]>) {
  return {
    from(table: string) {
      const q: any = {};
      for (const m of ["select", "eq", "ilike", "gte", "lte", "gt", "limit", "order"]) q[m] = () => q;
      q.then = (ok: any, bad: any) =>
        Promise.resolve({ data: rows[table] || [], error: null }).then(ok, bad);
      return q;
    },
  };
}

const deal = (id: string, o: Record<string, any> = {}) => ({
  id,
  year: 2018,
  make: "Honda",
  model: "Civic",
  trim: "EX",
  mileage: 70000,
  ask_price: 15000,
  source: "independent_dealer",
  source_deal_id: `sd-${id}`,
  source_url: `https://dealer.example/${id}`,
  vin: null,
  location_state: "IL",
  last_seen_at: hoursAgo(2),
  condition: "clean_title",
  damage_type: null,
  title: "2018 Honda Civic EX",
  auction_end_at: null,
  ...o,
});

describe("comp matching", () => {
  it("normalized model, not the first word", () => {
    expect(sameModel("Model S", "Model 3")).toBe(false);
    expect(sameModel("Model S", "Model S")).toBe(true);
    expect(sameModel("Civic", "Civic EX")).toBe(true); // eBay sold rows keep the trim in model
    expect(sameModel("F-150", "F150 XLT")).toBe(true);
    expect(sameModel("Grand Cherokee", "Grand Wagoneer")).toBe(false);
  });

  const c = (model: string, trim: string | null, mileage: number | null): ArbitrageComp =>
    ({ price: 1, kind: "ask", model, trim, mileage } as unknown as ArbitrageComp);

  it("trim when >= 3 comps share it, else the model pool; ±25k miles when mileage is known", () => {
    const comps = [
      c("Civic", "EX", 70000),
      c("Civic", "EX", 80000),
      c("Civic EX", null, 60000),
      c("Civic", "LX", 72000),
      c("Civic", "EX", 140000),
      c("Civic", "EX", null),
      c("Model 3", null, 70000),
    ];
    const r = matchComps(comps, { model: "Civic", trim: "EX", mileage: 71000 });
    expect(r.info).toMatchObject({ trimMatched: true, mileageBand: 25000, droppedModel: 1 });
    expect(r.comps.map((x: any) => x.mileage)).toEqual([70000, 80000, 60000]);
    const noTrim = matchComps(comps, { model: "Civic", trim: "Si", mileage: null });
    expect(noTrim.info.trimMatched).toBe(false);
    expect(noTrim.comps).toHaveLength(6);
  });
});

describe("sold rows", () => {
  it("eBay item id from a pasted URL", () => {
    expect(ebayItemId("https://www.ebay.com/itm/123456789012?hash=item1")).toBe("123456789012");
    expect(ebayItemId("https://www.ebay.com/itm/2018-honda-civic/123456789012")).toBe("123456789012");
    expect(ebayItemId("https://dealer.example/itm/123456789012")).toBeNull();
  });

  it("headline title uses market-value's soldTitleLane (only explicit clean title is clean)", () => {
    expect(soldTitleCondition("2018 Honda Civic EX Clean Title")).toBe("clean_title");
    expect(soldTitleCondition("2018 Honda Civic EX clean carfax")).toBeNull();
    expect(soldTitleCondition("2018 Honda Civic rebuilt title")).toBe("rebuilt_title");
    expect(soldTitleCondition("2018 Honda Civic SALVAGE")).toBe("salvage_title");
    expect(soldTitleCondition(null)).toBeNull();
  });

  it("loader: stale / frozen / ended asks are excluded; sold rows map state, source, item id, vin", async () => {
    const sb = fakeSupabase({
      deals: [
        deal("live1"),
        deal("live2"),
        deal("stale", { last_seen_at: hoursAgo(100) }),
        deal("frozen", { source: "cars_com", source_url: "https://www.cars.com/vehicledetail/1/", last_seen_at: hoursAgo(30) }),
      ],
      sold_listings: [
        {
          year: 2018, make: "Honda", model: "Civic EX", trim: null, mileage: 69000, sold_price: 14100,
          sold_at: hoursAgo(240), title: "2018 Honda Civic EX Clean Title", source: "ebay_motors",
          source_item_id: "555", source_url: "https://www.ebay.com/itm/555", vin: "2HGFC2F59JH000000", location_state: "WI",
        },
      ],
    });
    const data = await loadCheckListingData(
      sb,
      { make: "Honda", model: "Civic", year: 2018, mileage: 71000, price: 9000 },
      NOW,
    );
    expect(data.comps.filter((x) => x.kind === "ask").map((x) => x.id).sort()).toEqual(["live1", "live2"]);
    const sold = data.comps.find((x) => x.kind === "sold") as any;
    expect(sold).toMatchObject({
      id: "sold:555",
      state: "WI",
      source: "ebay_motors",
      sourceDealId: "555",
      vin: "2HGFC2F59JH000000",
      title: "clean_title",
      observedAt: hoursAgo(240),
    });
  });

  it("loader: the pasted URL's tracked row is found by normalized URL and returned as self", async () => {
    const sb = fakeSupabase({ deals: [deal("me", { source_url: "https://dealer.example/me/" }), deal("b"), deal("c")] });
    const data = await loadCheckListingData(
      sb,
      { make: "Honda", model: "Civic", year: 2018, price: 9000, url: "https://www.dealer.example/me#photos" },
      NOW,
    );
    expect(data.dealId).toBe("me");
    expect(data.self).toMatchObject({ id: "me", source: "independent_dealer", sourceDealId: "sd-me" });
  });
});
