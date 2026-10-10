import { describe, expect, it } from "vitest";
import type { ArbitrageComp } from "@/lib/arbitrage";
import { readListing, targetProfitFor } from "./check-listing";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const day = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const asks = (state: string, prices: number[], title = "clean_title"): ArbitrageComp[] =>
  prices.map((price, i) => ({
    id: `${state}-${i}-${price}`,
    price,
    kind: "ask",
    state,
    year: 2018,
    observedAt: day(2 + i),
    title,
  }));

const civic = {
  year: 2018,
  make: "Honda",
  model: "Civic",
  mileage: 71000,
  state: "IL",
  zip: "60432",
  title: "clean",
};

describe("check any listing", () => {
  it("cheap car with good comps: Buy, with max buy, resale market and profit from the engine", () => {
    const comps = [...asks("IL", [15000, 15500, 16000, 15200]), ...asks("TX", [17500, 18000, 17800])];
    const r = readListing({ ...civic, price: 9000 }, comps, { now: NOW });
    expect(r.verdict).toBe("buy");
    expect(r.resale.state).toBe("TX");
    expect(r.resale.basis).toBe("estimate"); // asks × 0.95, not sold
    expect(r.profit.net).toBeGreaterThan(targetProfitFor(r.resale.value!));
    expect(r.maxBuy.value).toBeGreaterThan(9000);
    expect(r.maxBuy.value! % 50).toBe(0);
    expect(r.fairValue.state).toBe("IL");
    expect(r.why.length).toBeGreaterThanOrEqual(2);
    expect(r.why.length).toBeLessThanOrEqual(4);
  });

  it("max buy is the highest ask that still clears the target profit", () => {
    const comps = asks("IL", [15000, 15500, 16000, 15200]);
    const r = readListing({ ...civic, price: 9000 }, comps, { now: NOW });
    const atMax = readListing({ ...civic, price: r.maxBuy.value! }, comps, { now: NOW });
    expect(atMax.profit.net!).toBeGreaterThanOrEqual(r.maxBuy.targetProfit!);
    const over = readListing({ ...civic, price: r.maxBuy.value! + 100 }, comps, { now: NOW });
    expect(over.profit.net!).toBeLessThan(r.maxBuy.targetProfit!);
  });

  it("overpriced car: Pass with the loss in the headline", () => {
    const r = readListing({ ...civic, price: 17000 }, asks("IL", [15000, 15500, 16000]), { now: NOW });
    expect(r.verdict).toBe("pass");
    expect(r.headline).toMatch(/^Pass/);
    expect(r.profit.net).toBeLessThan(0);
  });

  it("thin profit: Wait and offer the max buy", () => {
    const comps = asks("IL", [15000, 15500, 16000]);
    const probe = readListing({ ...civic, price: 9000 }, comps, { now: NOW });
    const r = readListing({ ...civic, price: probe.maxBuy.value! + 400 }, comps, { now: NOW });
    expect(r.verdict).toBe("wait");
    expect(r.headline).toContain(`$${probe.maxBuy.value!.toLocaleString("en-US")}`);
  });

  it("falling market turns a Buy into Wait and says why", () => {
    const comps = asks("IL", [15000, 15500, 16000, 15200]);
    const r = readListing({ ...civic, price: 9000 }, comps, {
      now: NOW,
      timing: { pctChange: -7.5, dataPoints: 12 },
    });
    expect(r.verdict).toBe("wait");
    expect(r.why.join(" ")).toContain("down 7.5%");
  });

  it("fewer than 3 comps: not enough data, never a number", () => {
    const r = readListing({ ...civic, price: 9000 }, asks("IL", [15000, 15500]), { now: NOW });
    expect(r.verdict).toBe("not_enough_data");
    expect(r.fairValue.value).toBeNull();
    expect(r.maxBuy.value).toBeNull();
    expect(r.resale.value).toBeNull();
    expect(r.profit.net).toBeNull();
  });

  it("the pasted listing is never its own comp", () => {
    const comps = [
      ...asks("IL", [15000, 15500]),
      { id: "self", price: 9000, kind: "ask", state: "IL", year: 2018, observedAt: day(1), url: "https://x.com/car/1" } as ArbitrageComp,
    ];
    const r = readListing({ ...civic, price: 9000, url: "https://x.com/car/1" }, comps, { now: NOW });
    expect(r.verdict).toBe("not_enough_data");
    expect(r.comps.asks).toBe(2);
  });

  it("salvage car is valued on salvage comps, not clean ones", () => {
    const comps = [
      ...asks("IL", [15000, 15500, 16000]),
      ...asks("IL", [8000, 8200, 8400], "salvage_title"),
    ];
    const r = readListing({ ...civic, title: "salvage", price: 4000 }, comps, { now: NOW });
    expect(r.resale.value!).toBeLessThan(9000);
    expect(r.why.join(" ")).toMatch(/salvage-title/);
  });

  it("reports the listing's own price drops from price history", () => {
    const r = readListing({ ...civic, price: 9000 }, asks("IL", [15000, 15500, 16000]), {
      now: NOW,
      priceHistory: [
        { price: 10500, observedAt: day(20) },
        { price: 9800, observedAt: day(10) },
        { price: 9000, observedAt: day(1) },
      ],
    });
    expect(r.priceHistory).toMatchObject({ firstPrice: 10500, changes: 2 });
    expect(r.why.join(" ")).toContain("dropped $1,500");
  });
});
