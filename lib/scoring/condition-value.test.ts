import { describe, it, expect } from "vitest";
import { pickSoldAnchor } from "./market-value";
import {
  titleSeverityMultiplier,
  mileageMultiplier,
  conditionAdjustedSell,
} from "./condition-value";

describe("titleSeverityMultiplier", () => {
  it("prices damage/title as a fraction of clean — the dominant lever", () => {
    expect(titleSeverityMultiplier({ condition: "clean" }).mult).toBe(1.0);
    expect(titleSeverityMultiplier({ condition: "certified" }).mult).toBe(1.05);
    expect(titleSeverityMultiplier({ condition: "salvage_title" }).tag).toBe(
      "salvage",
    );
    expect(titleSeverityMultiplier({ condition: "salvage_title" }).mult).toBe(
      0.5,
    );
    expect(
      titleSeverityMultiplier({ damage_type: "WATER/FLOOD" } as any).tag,
    ).toBe("flood");
    expect(titleSeverityMultiplier({ condition: "rebuilt_title" }).tag).toBe(
      "rebuilt",
    );
    expect(titleSeverityMultiplier({ damage_type: "HAIL" } as any).mult).toBe(
      0.85,
    );
    expect(
      titleSeverityMultiplier({ damage_type: "FRONT END" } as any).tag,
    ).toBe("damaged");
  });

  it("treats 'prior salvage' (branded but clean now) as a smaller discount than active salvage", () => {
    const prior = titleSeverityMultiplier({
      title: "Prior Salvage, runs great",
    } as any);
    expect(prior.tag).toBe("prior-salvage");
    expect(prior.mult).toBe(0.82);
    expect(prior.mult).toBeGreaterThan(
      titleSeverityMultiplier({ condition: "salvage" }).mult,
    );
  });
});

describe("mileageMultiplier", () => {
  it("discounts high miles and rewards low miles, vs ~12k/yr expected", () => {
    // 2020 car in 2026 → ~72k expected. 150k = way high → discount.
    expect(
      mileageMultiplier({ year: 2020, mileage: 150000 }, 2026),
    ).toBeLessThan(1);
    // 20k miles on a 2020 → premium.
    expect(
      mileageMultiplier({ year: 2020, mileage: 20000 }, 2026),
    ).toBeGreaterThan(1);
    // no mileage data → a mild age-based estimate, NOT neutral (salvage fix: a car with no odometer
    // shouldn't be valued as if it had average miles). 2020 in 2026 ⇒ age 6 ⇒ 1 − 6·0.012 = 0.928.
    expect(mileageMultiplier({ year: 2020 }, 2026)).toBeCloseTo(0.928, 3);
  });
});

describe("conditionAdjustedSell", () => {
  it("a flood-damaged late model is NOT worth clean retail", () => {
    const clean = 30000;
    const adj = conditionAdjustedSell(
      clean,
      { year: 2023, condition: "flood", mileage: 30000 } as any,
      null,
      2026,
    );
    expect(adj.sell).toBeLessThan(clean * 0.5);
    expect(adj.titleTag).toBe("flood");
  });

  it("anchors damaged cars toward real sold prices when enough real sales exist", () => {
    const clean = 20000;
    const noAnchor = conditionAdjustedSell(
      clean,
      { year: 2018, condition: "salvage", mileage: 90000 } as any,
      null,
      2026,
    );
    const anchored = conditionAdjustedSell(
      clean,
      { year: 2018, condition: "salvage", mileage: 90000 } as any,
      { median: 6000, n: 20 },
      2026,
    );
    expect(anchored.soldAnchored).toBe(true);
    expect(noAnchor.soldAnchored).toBe(false);
    // real sold pulls the estimate toward the actual market for that segment
    expect(Math.abs(anchored.sell - 6000)).toBeLessThan(
      Math.abs(noAnchor.sell - 6000),
    );
  });

  it("uses a sold median for clean cars when n is at least 3, and ignores a thinner sample", () => {
    const car = { year: 2021, condition: "clean", mileage: 60000 } as any;
    const thin = conditionAdjustedSell(
      25000,
      car,
      { median: 18000, n: 2 },
      2026,
    );
    expect(thin.soldAnchored).toBe(false);
    expect(thin.sell).toBe(25000);

    const adj = conditionAdjustedSell(
      25000,
      car,
      { median: 18000, n: 3 },
      2026,
    );
    expect(adj.soldAnchored).toBe(true);
    expect(adj.titleTag).toBe("clean");
    // Age-expected miles for 2021 in 2026 are 60k, so mileage does not move the sold median.
    expect(adj.sell).toBe(18000);
  });
});
describe("sold anchor state preference", () => {
  it("prefers the same state at n >= 3 and does not invent a sold under that floor", () => {
    const national = { median: 20000, n: 10 };
    const state = { median: 15000, n: 3 };
    expect(pickSoldAnchor(national, state)).toEqual(state);
    expect(pickSoldAnchor(national, { median: 15000, n: 2 })).toEqual(national);
    expect(
      pickSoldAnchor({ median: 20000, n: 2 }, { median: 15000, n: 2 }),
    ).toBeNull();
    expect(pickSoldAnchor(null, null)).toBeNull();
  });
});
