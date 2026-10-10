import { describe, expect, it } from "vitest";
import {
  dealCheckCompCategories,
  dealCheckCompTitle,
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

describe("dealCheckMarketValue title lanes", () => {
  const sold = (
    id: string,
    price: number,
    title: string,
  ): DealCheckCompRow => ({
    id,
    sold_price: price,
    sold_at: seen(20),
    title,
  });
  const cleanSold = [
    sold("c1", 20000, "2019 Honda Accord EX, clean title"),
    sold("c2", 21000, "2019 Honda Accord EX clean title"),
    sold("c3", 22000, "2019 Honda Accord EX, clean title"),
  ];
  const salvageSold = [
    sold("x1", 9000, "2019 Honda Accord salvage title"),
    sold("x2", 9500, "2019 Honda Accord flood"),
    sold("x3", 10000, "2019 Honda Accord hail damage"),
  ];

  it("maps each title to the comp categories it may be valued on", () => {
    expect(dealCheckCompCategories("salvage")).toEqual(["salvage"]);
    expect(dealCheckCompCategories("rebuilt")).toEqual(["rebuilt"]);
    expect(dealCheckCompCategories("rebuildable")).toEqual([
      "rebuildable",
      "salvage",
    ]);
    expect(dealCheckCompCategories("clean")).toEqual(["clean", "unknown"]);
    expect(dealCheckCompCategories(null)).toEqual(["clean", "unknown"]);
  });

  it("classifies sold rows by headline and asks by condition", () => {
    expect(
      dealCheckCompTitle({ title: "2019 Accord, clean title" }, "sold"),
    ).toBe("clean");
    expect(dealCheckCompTitle({ title: "2019 Accord EX" }, "sold")).toBe(
      "unknown",
    );
    expect(dealCheckCompTitle({ title: "2019 Accord flood" }, "sold")).toBe(
      "salvage",
    );
    expect(
      dealCheckCompTitle(
        { condition: "salvage_title", title: "2019 Accord" },
        "ask",
      ),
    ).toBe("salvage");
    expect(dealCheckCompTitle({ condition: "run_drive" }, "ask")).toBe(
      "unknown",
    );
  });

  it("never values a clean vehicle on salvage sales", () => {
    const m = dealCheckMarketValue({
      target: { titleCategory: "clean" },
      soldRows: [...cleanSold, ...salvageSold],
      now: NOW,
    });
    expect(m.aggregate).toMatchObject({ kind: "sold", value: 21000, n: 3 });
    expect(m.excludedTitle).toBe(3);
  });

  it("never values a salvage vehicle on clean sales or clean asks", () => {
    const m = dealCheckMarketValue({
      target: { titleCategory: "salvage" },
      soldRows: [...cleanSold, ...salvageSold],
      askRows: [ask("a", 20000), ask("b", 21000), ask("c", 22000)],
      now: NOW,
    });
    expect(m.aggregate).toMatchObject({ kind: "sold", value: 9500, n: 3 });
    expect(m.excludedTitle).toBe(6);
    const thin = dealCheckMarketValue({
      target: { titleCategory: "salvage" },
      soldRows: [...cleanSold, salvageSold[0]],
      askRows: [ask("a", 20000), ask("b", 21000), ask("c", 22000)],
      now: NOW,
    });
    expect(thin.aggregate.value).toBeNull();
    expect(thin.askRows).toEqual([]);
  });

  it("uses sold rows before asks inside the lane, same-state first", () => {
    const m = dealCheckMarketValue({
      target: { titleCategory: "clean", state: "MO" },
      soldRows: [
        ...cleanSold,
        { ...cleanSold[0], id: "m1", location_state: "MO", sold_price: 25000 },
        { ...cleanSold[0], id: "m2", location_state: "MO", sold_price: 26000 },
        { ...cleanSold[0], id: "m3", location_state: "MO", sold_price: 27000 },
      ],
      askRows: [ask("a", 30000), ask("b", 31000), ask("c", 32000)],
      now: NOW,
    });
    expect(m.aggregate).toMatchObject({
      kind: "sold",
      scope: "state",
      state: "MO",
      value: 26000,
    });
  });
});
