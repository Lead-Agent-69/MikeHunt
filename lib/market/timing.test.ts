import { describe, expect, it } from "vitest";
import {
  computeMarketTiming,
  mileageBand,
  TIMING_THRESHOLDS,
  type TimingObservation,
} from "./timing";

const NOW = new Date("2026-10-10T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function listing(
  id: string,
  points: Array<[number, number]>, // [daysAgo, price]
  attrs: Partial<TimingObservation> = {},
): TimingObservation[] {
  return points.map(([d, price]) => ({
    dealId: id,
    price,
    observedAt: daysAgo(d),
    year: 2018,
    mileage: 90_000,
    trim: "XLT",
    source: "independent_dealer",
    lastSeenAt: daysAgo(0.5),
    ...attrs,
  }));
}

/** Prod-shaped Explorer mix shift: older high-mile units 7-30d ago, newer low-mile trims now. */
function mixShiftFixture(): TimingObservation[] {
  const rows: TimingObservation[] = [];
  for (let i = 0; i < 12; i++)
    rows.push(
      ...listing(`old${i}`, [[15 + i, 13_000 + i * 150]], {
        year: 2016 + (i % 3),
        mileage: 110_000 + i * 2_000,
        trim: "XLT",
        lastSeenAt: daysAgo(12), // sold / gone before the recent window
      }),
    );
  for (let i = 0; i < 30; i++)
    rows.push(
      ...listing(`new${i}`, [[1 + (i % 5), 30_000 + i * 400]], {
        year: 2022 + (i % 3),
        mileage: 15_000 + i * 500,
        trim: i % 2 ? "Platinum" : "ST",
      }),
    );
  return rows;
}

describe("computeMarketTiming", () => {
  it("mix shift (newer low-mile trims entering) does NOT produce BUY_NOW", () => {
    const obs = mixShiftFixture();
    // Sanity: the naive cross-listing average is a big "rise", like prod's +44.7%.
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const recent = obs.filter((o) => Date.parse(o.observedAt) >= Date.parse(daysAgo(7)));
    const prior = obs.filter((o) => Date.parse(o.observedAt) < Date.parse(daysAgo(7)));
    expect(avg(recent.map((o) => o.price)) / avg(prior.map((o) => o.price)) - 1).toBeGreaterThan(0.4);

    const r = computeMarketTiming(obs, NOW);
    expect(r.signal).toBeNull();
    expect(r.confidence).toBe("none");
    expect(r.basis).toBe("none");
    expect(r.trendPct).toBeNull();
    expect(r.reason).toMatch(/Not enough like-for-like data/);
  });

  it("mix shift plus a stable like-for-like core reads NEUTRAL, not BUY_NOW", () => {
    const core: TimingObservation[] = [];
    for (let i = 0; i < 10; i++) core.push(...listing(`core${i}`, [[20, 15_000 + i * 100]]));
    const r = computeMarketTiming([...mixShiftFixture(), ...core], NOW);
    expect(r.basis).toBe("same_listing");
    expect(r.confidence).toBe("medium");
    expect(r.trendPct).toBe(0);
    expect(r.signal).toBe("NEUTRAL");
  });

  it("a real same-listing drop gives WAIT; a real rise gives BUY_NOW", () => {
    const drop: TimingObservation[] = [];
    const rise: TimingObservation[] = [];
    for (let i = 0; i < 20; i++) {
      drop.push(...listing(`d${i}`, [[20, 20_000], [3, 18_800]])); // -6%
      rise.push(...listing(`r${i}`, [[20, 20_000], [3, 21_200]])); // +6%
    }
    const d = computeMarketTiming(drop, NOW);
    expect(d).toMatchObject({ basis: "same_listing", confidence: "high", signal: "WAIT", trendPct: -6, sampleSize: 20, medianAsk: 18_800, priorMedianAsk: 20_000 });
    const r = computeMarketTiming(rise, NOW);
    expect(r).toMatchObject({ basis: "same_listing", confidence: "high", signal: "BUY_NOW", trendPct: 6 });
  });

  it("unchanged listings count as 0% (change-logged history: one row, still listed)", () => {
    const obs: TimingObservation[] = [];
    for (let i = 0; i < 6; i++) obs.push(...listing(`s${i}`, [[20, 20_000]]));
    for (let i = 0; i < 2; i++) obs.push(...listing(`c${i}`, [[20, 20_000], [2, 18_000]]));
    const r = computeMarketTiming(obs, NOW);
    expect(r.sampleSize).toBe(8);
    expect(r.trendPct).toBe(-2.5);
    expect(r.signal).toBe("NEUTRAL");
  });

  it("below the minimum sample: no signal", () => {
    const obs: TimingObservation[] = [];
    for (let i = 0; i < TIMING_THRESHOLDS.sameListing.low - 1; i++)
      obs.push(...listing(`d${i}`, [[20, 20_000], [3, 15_000]]));
    const r = computeMarketTiming(obs, NOW);
    expect(r).toMatchObject({ signal: null, confidence: "none", basis: "none", trendPct: null });
  });

  it("low confidence shows the trend but carries no verdict", () => {
    const obs: TimingObservation[] = [];
    for (let i = 0; i < TIMING_THRESHOLDS.sameListing.medium - 1; i++)
      obs.push(...listing(`d${i}`, [[20, 20_000], [3, 17_000]]));
    const r = computeMarketTiming(obs, NOW);
    expect(r.confidence).toBe("low");
    expect(r.basis).toBe("same_listing");
    expect(r.trendPct).toBe(-15);
    expect(r.signal).toBeNull();
    expect(r.reason).toMatch(/low confidence/);
  });

  it("auction bids and sub-$500 placeholders are ignored", () => {
    const obs: TimingObservation[] = [];
    for (let i = 0; i < 25; i++) {
      obs.push(...listing(`a${i}`, [[20, 1_000], [2, 9_000]], { source: "copart" }));
      obs.push(...listing(`g${i}`, [[20, 2_000], [2, 6_000]], { source: "independent_dealer", auctionEndAt: daysAgo(-3) }));
      obs.push(...listing(`p${i}`, [[20, 100], [2, 3_000]]));
    }
    const r = computeMarketTiming(obs, NOW);
    expect(r.signal).toBeNull();
    expect(r.confidence).toBe("none");
  });

  it("listings gone before the recent window don't form pairs", () => {
    const obs: TimingObservation[] = [];
    for (let i = 0; i < 25; i++) obs.push(...listing(`x${i}`, [[20, 20_000]], { lastSeenAt: daysAgo(10) }));
    expect(computeMarketTiming(obs, NOW).detail.sameListingPairs).toBe(0);
  });

  it("per-listing changes are clipped to ±30%", () => {
    const obs: TimingObservation[] = [];
    for (let i = 0; i < 20; i++) obs.push(...listing(`d${i}`, [[20, 20_000], [3, 20_000]]));
    obs.push(...listing("typo", [[20, 2_000], [3, 20_000]])); // 10x data error
    expect(computeMarketTiming(obs, NOW).trendPct).toBe(1.4); // 0.3 / 21
  });

  it("mix-adjusted: compares within year/mileage/trim cohorts, capped at medium", () => {
    // No listing spans both windows; 6 cohorts each with a real 10% rise between windows.
    const obs: TimingObservation[] = [];
    for (let c = 0; c < 6; c++)
      for (let k = 0; k < 2; k++) {
        const attrs = { year: 2015 + c, mileage: 70_000, trim: "XLT" };
        obs.push(...listing(`p${c}${k}`, [[20, 10_000 + c * 1000]], { ...attrs, lastSeenAt: daysAgo(15) }));
        obs.push(...listing(`r${c}${k}`, [[2, (10_000 + c * 1000) * 1.1]], attrs));
      }
    const r = computeMarketTiming(obs, NOW);
    expect(r.basis).toBe("mix_adjusted");
    expect(r.confidence).toBe("medium");
    expect(r.trendPct).toBe(10);
    expect(r.signal).toBe("BUY_NOW");
    expect(r.detail.mixCohorts).toBe(6);
    expect(r.priorMedianAsk).toBe(12_500);
    expect(r.medianAsk).toBe(13_750);
  });

  it("mix-adjusted ignores cohorts seen in only one window", () => {
    const obs: TimingObservation[] = [];
    for (let c = 0; c < 6; c++) {
      const attrs = { year: 2015 + c, mileage: 70_000, trim: "XLT" };
      for (let k = 0; k < 2; k++) {
        obs.push(...listing(`p${c}${k}`, [[20, 10_000]], { ...attrs, lastSeenAt: daysAgo(15) }));
        obs.push(...listing(`r${c}${k}`, [[2, 10_000]], attrs));
      }
    }
    for (let k = 0; k < 20; k++)
      obs.push(...listing(`n${k}`, [[2, 60_000]], { year: 2025, mileage: 5_000, trim: "King Ranch" }));
    const r = computeMarketTiming(obs, NOW);
    expect(r.basis).toBe("mix_adjusted");
    expect(r.trendPct).toBe(0);
    expect(r.signal).toBe("NEUTRAL");
  });

  it("returns the window", () => {
    const r = computeMarketTiming([], NOW);
    expect(r.window).toMatchObject({ days: 30, recentDays: 7, to: NOW.toISOString() });
  });
});

describe("mileageBand", () => {
  it("bands miles", () => {
    expect([null, 10_000, 45_000, 80_000, 120_000, 200_000].map(mileageBand)).toEqual([
      "mi?", "0-30k", "30-60k", "60-100k", "100-150k", "150k+",
    ]);
  });
});
