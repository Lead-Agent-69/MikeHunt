import { describe, expect, it } from "vitest";
import {
  estimateDaysToSell,
  holdingCost,
  type LiquidityRow,
} from "./liquidity";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const gone = (
  listedDaysAgo: number,
  upDays: number,
  extra: Partial<LiquidityRow> = {},
): LiquidityRow => ({
  make: "Ford",
  model: "F-150",
  state: "MO",
  firstSeenAt: daysAgo(listedDaysAgo),
  lastSeenAt: daysAgo(listedDaysAgo - upDays),
  ...extra,
});
const live = (
  ageDays: number,
  extra: Partial<LiquidityRow> = {},
): LiquidityRow => ({
  make: "Ford",
  model: "F-150",
  state: "MO",
  firstSeenAt: daysAgo(ageDays),
  lastSeenAt: daysAgo(0),
  ...extra,
});
const key = { make: "ford", model: "f-150", state: "mo" };

describe("estimateDaysToSell", () => {
  it("delist proxy: median of last_seen − first_seen for rows that disappeared", () => {
    const r = estimateDaysToSell(
      [gone(40, 10), gone(40, 20), gone(40, 30), live(5)],
      key,
      { now: NOW },
    );
    expect(r).toMatchObject({
      daysToSell: 20,
      n: 3,
      basis: "delist_proxy",
      scope: "state",
      confidence: "low",
    });
    expect(r.delistRate).toBe(0.75);
    expect(r.notes.join(" ")).toMatch(/not proof of a sale/);
  });

  it("active=false counts as gone even if seen recently", () => {
    const r = estimateDaysToSell(
      [
        live(10, { active: false }),
        live(12, { active: false }),
        live(14, { active: false }),
      ],
      key,
      { now: NOW },
    );
    expect(r.daysToSell).toBe(12);
  });

  it("sold durations beat the delist proxy when n >= 3", () => {
    const sold = (listed: number, soldAgo: number): LiquidityRow => ({
      make: "Ford",
      model: "F-150",
      state: "MO",
      kind: "sold",
      listedAt: daysAgo(listed),
      soldAt: daysAgo(soldAgo),
    });
    const r = estimateDaysToSell(
      [
        sold(20, 10),
        sold(30, 25),
        sold(50, 20),
        gone(40, 30),
        gone(40, 31),
        gone(40, 32),
      ],
      key,
      { now: NOW },
    );
    expect(r).toMatchObject({ basis: "sold", daysToSell: 10, n: 3 });
    expect(r.soldLast30d).toBe(3);
  });

  it("falls back to national when the state is thin", () => {
    const r = estimateDaysToSell(
      [
        gone(40, 10, { state: "TX" }),
        gone(40, 12, { state: "TX" }),
        gone(40, 14, { state: "KS" }),
      ],
      key,
      { now: NOW },
    );
    expect(r).toMatchObject({ scope: "national", daysToSell: 12 });
  });

  it("no estimate below 3 completed durations", () => {
    const r = estimateDaysToSell([gone(40, 10), live(3)], key, { now: NOW });
    expect(r.daysToSell).toBeNull();
    expect(r.confidence).toBe("none");
    expect(r.notes[0]).toMatch(/no days-to-sell estimate/);
  });

  it("flags optimism and steps confidence down when live rows are older than the estimate", () => {
    const rows = [
      ...Array.from({ length: 6 }, () => gone(60, 5)),
      live(40),
      live(45),
      live(50),
    ];
    const r = estimateDaysToSell(rows, key, { now: NOW });
    expect(r.daysToSell).toBe(5);
    expect(r.confidence).toBe("low"); // medium (n=6) stepped down
    expect(r.notes.join(" ")).toMatch(/likely optimistic/);
  });

  it("delist proxy never reaches high confidence", () => {
    const rows = Array.from({ length: 20 }, (_, i) => gone(60, 5 + i));
    expect(estimateDaysToSell(rows, key, { now: NOW }).confidence).toBe(
      "medium",
    );
  });

  it("ignores rows outside the window and other models", () => {
    const r = estimateDaysToSell(
      [
        gone(400, 10),
        gone(400, 10),
        gone(400, 10),
        gone(40, 5, { model: "Ranger" }),
      ],
      key,
      { now: NOW },
    );
    expect(r.daysToSell).toBeNull();
  });
});

describe("holdingCost hook", () => {
  it("off by default: reports but does not include", () => {
    const h = holdingCost({ daysToSell: 20, basis: "delist_proxy", n: 5 });
    expect(h).toMatchObject({ cost: 700, included: false });
    expect(h.assumption).toMatch(/not included/);
  });
  it("opt-in includes it with the rate", () => {
    const h = holdingCost(
      { daysToSell: 20, basis: "sold", n: 5 },
      { enabled: true, dailyRate: 20 },
    );
    expect(h).toMatchObject({ cost: 400, included: true });
  });
  it("no estimate → no cost", () => {
    expect(
      holdingCost({ daysToSell: null, basis: "none", n: 0 }, { enabled: true })
        .cost,
    ).toBeNull();
  });
});
