import { describe, expect, it } from "vitest";
import type { ArbitrageComp } from "@/lib/arbitrage";
import { evaluateOpportunity } from "@/lib/arbitrage";
import { maxBuyFor, readListing, readPersonal, targetProfitFor } from "./check-listing";

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

const mileaged = (cs: ArbitrageComp[], mileage = 70000): ArbitrageComp[] =>
  cs.map((c) => ({ ...c, mileage }));

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
    expect(r.profit!.net).toBeGreaterThan(targetProfitFor(r.resale.value!));
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
    expect(atMax.profit!.net!).toBeGreaterThanOrEqual(r.maxBuy.targetProfit!);
    const over = readListing({ ...civic, price: r.maxBuy.value! + 100 }, comps, { now: NOW });
    expect(over.profit!.net!).toBeLessThan(r.maxBuy.targetProfit!);
  });

  it("overpriced car: Pass with the loss in the headline", () => {
    const r = readListing({ ...civic, price: 17000 }, asks("IL", [15000, 15500, 16000]), { now: NOW });
    expect(r.verdict).toBe("pass");
    expect(r.headline).toMatch(/^Pass/);
    expect(r.profit!.net).toBeLessThan(0);
  });

  it("thin profit: Wait and offer the max buy", () => {
    const comps = asks("IL", [15000, 15500, 16000]);
    const probe = readListing({ ...civic, price: 9000 }, comps, { now: NOW });
    const r = readListing({ ...civic, price: probe.maxBuy.value! + 400 }, comps, { now: NOW });
    expect(r.verdict).toBe("wait");
    expect(r.headline).toContain(`$${probe.maxBuy.value!.toLocaleString("en-US")}`);
  });

  it("timing gate: a falling model-wide trend never changes the verdict or the why lines", () => {
    const comps = asks("IL", [15000, 15500, 16000, 15200]);
    const plain = readListing({ ...civic, price: 9000 }, comps, { now: NOW });
    const r = readListing({ ...civic, price: 9000 }, comps, {
      now: NOW,
      timing: { pctChange: -7.5, dataPoints: 12 },
    });
    expect(r.verdict).toBe(plain.verdict);
    expect(r.headline).toBe(plain.headline);
    expect(r.why).toEqual(plain.why);
    expect(r.why.join(" ")).not.toMatch(/7\.5%|this week/);
    expect(r.trend).toEqual({ pctChange: -7.5, dataPoints: 12, usedInVerdict: false });
    const personal = readPersonal({ ...civic, price: 15000 }, mileaged(comps), {
      now: NOW,
      timing: { pctChange: -7.5, dataPoints: 12 },
    });
    expect(personal.verdict).toBe(readPersonal({ ...civic, price: 15000 }, mileaged(comps), { now: NOW }).verdict);
  });

  it("fewer than 3 comps: not enough data, never a number", () => {
    const r = readListing({ ...civic, price: 9000 }, asks("IL", [15000, 15500]), { now: NOW });
    expect(r.verdict).toBe("not_enough_data");
    expect(r.fairValue.value).toBeNull();
    expect(r.maxBuy.value).toBeNull();
    expect(r.resale.value).toBeNull();
    expect(r.profit!.net).toBeNull();
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

  it("max buy comes from the engine helper and matches the old fee math", () => {
    const comps = asks("IL", [15000, 15500, 16000, 15200]);
    const o = evaluateOpportunity(
      { id: "x", ask: 9000, source: "copart", title: "clean", location: { state: "IL" } },
      comps,
      { sellMarket: { state: "IL" }, now: NOW },
    ) as any;
    const s = o.spread;
    const old = Math.max(
      0,
      Math.floor((s.expectedResale - (s.transport + s.recon + s.repair + s.sellingCost + 130 + 100) - 1500) / 1.1 / 50) * 50,
    );
    expect(maxBuyFor(o, "copart", 1500)).toBe(old);
  });

  it("flip: unknown title says the title is not stated, not that comps are thin", () => {
    const comps = asks("IL", [15000, 15500, 16000, 15200, 15100, 15900]);
    const r = readListing({ ...civic, title: null, price: 9000 }, comps, { now: NOW, fetchedNow: true });
    expect(r.verdict).toBe("wait");
    expect(r.headline).toMatch(/title is not stated/);
    expect(r.headline).not.toMatch(/comps are thin/);
  });

  it("flip: a tracked listing that is frozen or ended is Not live, with the numbers kept", () => {
    const comps = asks("IL", [15000, 15500, 16000, 15200]);
    const frozen = readListing({ ...civic, price: 9000, url: "https://www.copart.com/lot/1" }, comps, {
      now: NOW,
      fetchedNow: true,
      self: { id: "d1", source: "copart", sourceDealId: "1", sourceUrl: "https://www.copart.com/lot/1", lastSeenAt: day(8), auctionEndAt: null },
    });
    expect(frozen.verdict).toBe("not_live");
    expect(frozen.live.state).toBe("frozen");
    expect(frozen.headline).toMatch(/^Not live/);
    expect(frozen.resale.value).toBeGreaterThan(0);
    const ended = readPersonal({ ...civic, price: 15000 }, mileaged(comps), {
      now: NOW,
      self: { id: "d2", source: "independent_dealer", sourceDealId: "2", sourceUrl: null, lastSeenAt: day(0.1), auctionEndAt: day(1) },
    });
    expect(ended.verdict).toBe("not_live");
    expect(ended.live.state).toBe("ended");
  });

  it("a freshly fetched page counts as seen now (no last-seen confidence penalty)", () => {
    const comps = asks("IL", [15000, 15500, 16000, 15200]);
    const typed = readListing({ ...civic, price: 9000 }, comps, { now: NOW });
    const fetched = readListing({ ...civic, price: 9000 }, comps, { now: NOW, fetchedNow: true });
    expect(fetched.live.state).toBe("live");
    expect(fetched.confidence.score!).toBeGreaterThan(typed.confidence.score!);
    expect(fetched.assumptions.join(" ")).not.toMatch(/last-seen time unknown/);
  });
});

describe("check any listing: personal desk (retail fair value)", () => {
  const il = mileaged(asks("IL", [15000, 15500, 16000, 15200, 15800]));
  const tx = mileaged(asks("TX", [17500, 18000, 17800, 18200]));

  it("regression: a car priced at the typical ask is Fair / Buy, not Pass", () => {
    const r = readPersonal({ ...civic, price: 15500 }, il, { now: NOW });
    expect(r.fairValue.value).toBe(15500); // median ask, no 0.95 haircut
    expect(r.fairValue.kind).toBe("ask");
    expect(r.priceRating).toBe("fair");
    expect(r.verdict).toBe("buy");
    expect(r.fairValue.label).toBe("Typical asking price · 5 live listings (asking prices, not sales)");
    expect(r.fairValue.range).toEqual({ p25: 15200, p75: 15800 });
    const slightlyOver = readPersonal({ ...civic, price: 16000 }, il, { now: NOW });
    expect(slightlyOver.verdict).toBe("wait");
    expect(slightlyOver.priceRating).toBe("negotiate");
    const over = readPersonal({ ...civic, price: 17000 }, il, { now: NOW });
    expect(over.verdict).toBe("pass");
    expect(over.priceRating).toBe("over");
  });

  it("regression: no sell state, resale, profit or flip evidence anywhere on the personal card", () => {
    const r = readPersonal({ ...civic, price: 9000 }, [...il, ...tx], {
      now: NOW,
      buyerHome: { state: "TX" },
    });
    expect(r.desk).toBe("personal");
    expect(r.resale).toEqual({ value: null, basis: "insufficient", state: null });
    expect(r.profit).toBeNull();
    expect(r.maxBuy.targetProfit).toBeNull();
    const text = JSON.stringify({ ...r, vehicle: undefined, profit: undefined, maxBuy: undefined });
    expect(text).not.toMatch(/\bTX\b/);
    expect(text).not.toMatch(/sell in|Sells ~|less 5%|profit/i);
    // Valued where the car sits: IL comps only.
    expect(r.fairValue.state).toBe("IL");
    expect(r.fairValue.value).toBe(15500);
  });

  it("personal confidence is the retail one: asks cap at medium", () => {
    const many = mileaged(asks("IL", Array.from({ length: 14 }, (_, i) => 15000 + i * 100)));
    const r = readPersonal({ ...civic, price: 15000 }, many, { now: NOW });
    expect(r.confidence).toEqual({ label: "medium", score: null });
  });

  it("regression: an eBay listing is never its own sold comp (item id, URL query ignored)", () => {
    const sold = (id: string, price: number, url: string): ArbitrageComp =>
      ({ id: `sold:${id}`, price, kind: "sold", state: "IL", year: 2018, mileage: 70000, observedAt: day(10), source: "ebay_motors", sourceDealId: id, title: "clean_title", url } as ArbitrageComp);
    const comps = [
      sold("111", 14000, "https://www.ebay.com/itm/111"),
      sold("222", 14200, "https://www.ebay.com/itm/222"),
      sold("333", 9000, "https://www.ebay.com/itm/333"),
    ];
    const input = { ...civic, price: 9000, source: "ebay_motors", sourceDealId: "333", url: "https://www.ebay.com/itm/333?hash=item4d&var=0" };
    const r = readPersonal(input, comps, { now: NOW, fetchedNow: true });
    expect(r.comps.sold).toBe(2); // ebay_motors + item id drops it (the URL query differs)
    expect(r.verdict).toBe("not_enough_data");
    // No URL at all: source + item id still drops it.
    const r2 = readPersonal({ ...input, url: null }, comps, { now: NOW });
    expect(r2.fairValue.value).toBeNull();
  });
});

