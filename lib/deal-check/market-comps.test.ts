import { describe, expect, it } from "vitest";
import {
  dealCheckMarketValue,
  isSameVehicleOrListing,
  marketBasisLabel,
  type DealCheckCompRow,
} from "./market-comps";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const seen = (daysAgo: number) =>
  new Date(NOW - daysAgo * 86_400_000).toISOString();

const ask = (
  id: string,
  price: number,
  extra: Partial<DealCheckCompRow> = {},
): DealCheckCompRow => ({
  id,
  source: "cars_com",
  source_deal_id: `cc-${id}`,
  source_url: `https://www.cars.com/vehicledetail/${id}/`,
  ask_price: price,
  last_seen_at: seen(1),
  ...extra,
});

describe("dealCheckMarketValue", () => {
  it("excludes the deal being checked by id, so it cannot grade itself", () => {
    const rows = [
      ask("a", 10000),
      ask("b", 20000),
      ask("c", 21000),
      ask("d", 22000),
    ];
    const m = dealCheckMarketValue({
      target: { id: "a" },
      askRows: rows,
      now: NOW,
    });
    expect(m.excludedSelf).toBe(1);
    expect(m.aggregate.n).toBe(3);
    // median of 20k/21k/22k × 0.95 ask→sold, not a mean that includes the 10k self ask
    expect(m.aggregate.value).toBe(Math.round(21000 * 0.95));
    expect(m.askRows.map((r) => r.id)).toEqual(["b", "c", "d"]);
  });

  it("excludes by source + source_deal_id, same VIN, and the same pasted URL", () => {
    const vin = "1FMSK8DH5LGA12345";
    const rows = [
      ask("a", 9000, { source: "cargurus", source_deal_id: "X1" }),
      ask("b", 9100, { vin }),
      ask("c", 9200),
      ask("d", 20000),
      ask("e", 21000),
      ask("f", 22000),
    ];
    const m = dealCheckMarketValue({
      target: {
        source: "CarGurus",
        sourceDealId: "x1",
        vin: vin.toLowerCase(),
        url: "https://cars.com/vehicledetail/c",
      },
      askRows: rows,
      now: NOW,
    });
    expect(m.excludedSelf).toBe(3);
    expect(m.aggregate.n).toBe(3);
    expect(m.askRows.map((r) => r.id)).toEqual(["d", "e", "f"]);
  });

  it("returns no value (unknown) when exclusion leaves fewer than 3 comps", () => {
    const rows = [ask("a", 10000), ask("b", 20000), ask("c", 21000)];
    const m = dealCheckMarketValue({
      target: { id: "a" },
      askRows: rows,
      now: NOW,
    });
    expect(m.aggregate.value).toBeNull();
    expect(m.aggregate.confidence).toBe("none");
    expect(marketBasisLabel(m.aggregate)).toBeNull();
  });

  it("drops asks not seen live in 7 days, and undated asks", () => {
    const rows = [
      ask("a", 20000),
      ask("b", 21000),
      ask("c", 22000, { last_seen_at: seen(8) }),
      ask("d", 22000, { last_seen_at: null }),
    ];
    const m = dealCheckMarketValue({ target: {}, askRows: rows, now: NOW });
    expect(m.excludedStale).toBe(2);
    expect(m.aggregate.value).toBeNull();
  });

  it("prefers completed sales over asks when there are at least 3 sales", () => {
    const sold = [15000, 15500, 16000].map((p, i) => ({
      id: `s${i}`,
      sold_price: p,
      sold_at: seen(30),
    }));
    const rows = [ask("a", 20000), ask("b", 21000), ask("c", 22000)];
    const m = dealCheckMarketValue({
      target: {},
      askRows: rows,
      soldRows: sold,
      now: NOW,
    });
    expect(m.aggregate.kind).toBe("sold");
    expect(m.aggregate.value).toBe(15500); // sold median, no ask haircut
    expect(marketBasisLabel(m.aggregate)).toMatch(/completed sales/);
  });

  it("falls back to asks when there are fewer than 3 recent sales", () => {
    const sold = [
      { id: "s1", sold_price: 15000, sold_at: seen(30) },
      { id: "s2", sold_price: 15000, sold_at: seen(400) },
    ];
    const rows = [ask("a", 20000), ask("b", 21000), ask("c", 22000)];
    const m = dealCheckMarketValue({
      target: {},
      askRows: rows,
      soldRows: sold,
      now: NOW,
    });
    expect(m.aggregate.kind).toBe("ask");
    expect(m.aggregate.value).toBe(Math.round(21000 * 0.95));
  });

  it("does not treat short or blank VINs/URLs as a match", () => {
    expect(isSameVehicleOrListing({ vin: "" }, { vin: "" })).toBe(false);
    expect(isSameVehicleOrListing({ vin: "ABC" }, { vin: "ABC" })).toBe(false);
    expect(
      isSameVehicleOrListing({ source_url: null }, { url: "not a url" }),
    ).toBe(false);
  });
});
