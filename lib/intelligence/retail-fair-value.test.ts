import { describe, expect, it } from "vitest";
import type { ArbitrageComp } from "@/lib/arbitrage";
import { retailConfidence, retailFairValue, retailVerdict } from "./retail-fair-value";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const day = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
let seq = 0;
const comp = (
  kind: "sold" | "ask",
  price: number,
  o: Partial<ArbitrageComp> = {},
): ArbitrageComp => ({
  id: `c${++seq}`,
  price,
  kind,
  state: "IL",
  year: 2018,
  mileage: 70000,
  observedAt: day(kind === "sold" ? 20 : 1),
  source: kind === "sold" ? "ebay_motors" : "cars_com",
  title: "clean_title",
  ...o,
});
const many = (kind: "sold" | "ask", prices: number[], o: Partial<ArbitrageComp> = {}) =>
  prices.map((p) => comp(kind, p, o));
const car = { state: "IL", mileage: 71000, title: "clean" };

describe("retailFairValue basis ladder", () => {
  it("sold, same state, n >= 3 wins: median, no haircut, labelled with the state", () => {
    const fv = retailFairValue(car, [
      ...many("sold", [14000, 14400, 14800]),
      ...many("sold", [19000, 19500, 20000], { state: "TX" }),
      ...many("ask", [16000, 16500, 17000]),
    ], { now: NOW });
    expect(fv).toMatchObject({ basis: "sold", scope: "state", state: "IL", value: 14400, n: 3 });
    expect(fv.label).toBe("Typical selling price · 3 recent sales in IL");
    expect(fv.range).toEqual({ p25: 14200, p75: 14600 });
  });

  it("thin same-state sales fall back to national sales (n >= 3)", () => {
    const fv = retailFairValue(car, [
      ...many("sold", [14000, 14400]),
      ...many("sold", [15000], { state: "TX" }),
      ...many("ask", [16000, 16500, 17000]),
    ], { now: NOW });
    expect(fv).toMatchObject({ basis: "sold", scope: "national", state: null, value: 14400, n: 3 });
    expect(fv.label).toBe("Typical selling price · 3 recent sales");
  });

  it("no qualifying sales: live retail asks, median with NO 0.95 haircut", () => {
    const fv = retailFairValue(car, [
      ...many("sold", [14000, 14400]),
      ...many("ask", [16000, 16500, 17000, 17500]),
    ], { now: NOW });
    expect(fv).toMatchObject({ basis: "ask", scope: "state", value: 16750, n: 4 });
    expect(fv.label).toBe("Typical asking price · 4 live listings (asking prices, not sales)");
  });

  it("auction / wholesale sales are not retail sales", () => {
    const fv = retailFairValue(car, [
      ...many("sold", [8000, 8200, 8400], { source: "copart" }),
      ...many("sold", [9000], { source: "iaa" }),
      ...many("sold", [9100], { source: "manheim" }),
      ...many("ask", [16000, 16500, 17000]),
    ], { now: NOW });
    expect(fv.basis).toBe("ask");
    expect(fv.excluded.wholesale).toBe(5);
  });

  it("sales older than 180 days or undated do not count", () => {
    const fv = retailFairValue(car, [
      ...many("sold", [14000, 14400, 14800], { observedAt: day(200) }),
      ...many("sold", [14000], { observedAt: null }),
    ], { now: NOW });
    expect(fv.basis).toBe("none");
    expect(fv.excluded.old).toBe(4);
  });

  it("title lane: a salvage car is valued only on salvage comps", () => {
    const comps = [
      ...many("ask", [16000, 16500, 17000]),
      ...many("sold", [7000, 7400, 7800], { title: "salvage_title" }),
    ];
    const fv = retailFairValue({ ...car, title: "salvage" }, comps, { now: NOW });
    expect(fv).toMatchObject({ basis: "sold", value: 7400, titleCategory: "Salvage" });
    expect(retailFairValue({ ...car, title: "rebuilt" }, comps, { now: NOW }).basis).toBe("none");
  });

  it("±25k miles when the car's mileage is known (comps without mileage are left out)", () => {
    const comps = [
      ...many("ask", [16000, 16500], { mileage: 80000 }),
      ...many("ask", [9000, 9500], { mileage: 150000 }),
      ...many("ask", [12000], { mileage: null }),
    ];
    const fv = retailFairValue(car, comps, { now: NOW });
    expect(fv.basis).toBe("none");
    expect(fv.excluded.mileage).toBe(3);
    const noMiles = retailFairValue({ ...car, mileage: null }, comps, { now: NOW });
    expect(noMiles.n).toBe(5);
  });

  it("never its own comp (id, or source + source id)", () => {
    const comps = [
      ...many("sold", [14000, 14400]),
      comp("sold", 9000, { id: "sold:99", sourceDealId: "99" }),
    ];
    const fv = retailFairValue({ ...car, source: "ebay_motors", sourceDealId: "99" }, comps, { now: NOW });
    expect(fv.basis).toBe("none");
    expect(fv.excluded.self).toBe(1);
  });
});

describe("retail confidence", () => {
  it("12 / 6 / 3 → high / medium / low; < 3 → none", () => {
    const c = (n: number) => retailConfidence({ n, basis: "sold", medianAgeDays: 10, titleCategory: "Clean" }).label;
    expect([c(12), c(6), c(3), c(2)]).toEqual(["high", "medium", "low", "none"]);
  });
  it("asking basis caps at medium", () => {
    expect(retailConfidence({ n: 20, basis: "ask", medianAgeDays: 1, titleCategory: "Clean" }).label).toBe("medium");
  });
  it("median comp older than 90 days drops one step", () => {
    expect(retailConfidence({ n: 12, basis: "sold", medianAgeDays: 120, titleCategory: "Clean" }).label).toBe("medium");
    expect(retailConfidence({ n: 6, basis: "sold", medianAgeDays: 120, titleCategory: "Clean" }).label).toBe("low");
  });
  it("unknown title caps at low", () => {
    expect(retailConfidence({ n: 20, basis: "sold", medianAgeDays: 5, titleCategory: "Unknown" }).label).toBe("low");
  });
  it("end to end: 12 recent same-state sales are high; 12 asks are medium", () => {
    const sold = retailFairValue(car, many("sold", Array.from({ length: 12 }, (_, i) => 14000 + i * 50)), { now: NOW });
    expect(sold.confidence.label).toBe("high");
    const asks = retailFairValue(car, many("ask", Array.from({ length: 12 }, (_, i) => 16000 + i * 50)), { now: NOW });
    expect(asks.confidence.label).toBe("medium");
    const unknown = retailFairValue({ ...car, title: null }, many("sold", Array.from({ length: 12 }, (_, i) => 14000 + i * 50)), { now: NOW });
    expect(unknown.confidence.label).toBe("low");
  });
});

describe("retailVerdict", () => {
  const soldFv = retailFairValue(car, many("sold", [14000, 14400, 14800]), { now: NOW });
  const askFv = retailFairValue(car, many("ask", [15000, 15200, 15500, 15800, 16000]), { now: NOW });

  it("sold basis: <= fair Buy, <= fair × 1.05 Wait, above Pass", () => {
    expect(retailVerdict(14000, soldFv)).toMatchObject({ verdict: "buy", rating: "good" });
    expect(retailVerdict(14400, soldFv)).toMatchObject({ verdict: "buy", rating: "fair" });
    expect(retailVerdict(15100, soldFv)).toMatchObject({ verdict: "wait", rating: "negotiate" });
    expect(retailVerdict(15200, soldFv)).toMatchObject({ verdict: "pass", rating: "over" });
  });

  it("ask basis: <= p25 good, <= median fair, <= median × 1.05 negotiate, above over market", () => {
    expect(askFv.range).toEqual({ p25: 15200, p75: 15800 });
    expect(retailVerdict(15100, askFv)).toMatchObject({ verdict: "buy", rating: "good" });
    expect(retailVerdict(15500, askFv)).toMatchObject({ verdict: "buy", rating: "fair" });
    expect(retailVerdict(16200, askFv)).toMatchObject({ verdict: "wait", rating: "negotiate" });
    expect(retailVerdict(16300, askFv)).toMatchObject({ verdict: "pass", rating: "over" });
  });

  it("no value: not enough data", () => {
    const none = retailFairValue(car, [], { now: NOW });
    expect(retailVerdict(9000, none)).toMatchObject({ verdict: "not_enough_data", rating: null });
  });
});
