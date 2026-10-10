import { describe, expect, it } from "vitest";
import { estimateRepairCost } from "@/lib/scoring/profit-calculator";
import { conditionReconBaseline } from "@/lib/arbitrage/constants";
import {
  REPAIR_SPREAD,
  estimateRepairRange,
  repairBucket,
  vehicleRepairFactor,
} from "./repair-baseline";

const DAMAGE = [
  "FRONT END",
  "REAR END",
  "SIDE",
  "ALL OVER",
  "TOTAL LOSS",
  "FRAME DAMAGE",
  "ROLLOVER",
  "BURN",
  "FIRE",
  "WATER/FLOOD",
  "MECHANICAL",
  "HAIL",
  "MINOR DENT/SCRATCHES",
  "VANDALISM",
  "none",
  "",
];

describe("estimateRepairRange — superset of estimateRepairCost", () => {
  it("baseMid equals estimateRepairCost for every damage string (no regression)", () => {
    for (const d of DAMAGE) {
      const r = estimateRepairRange({ damageType: d });
      if (repairBucket(d) === "none") continue;
      expect(r.baseMid).toBe(estimateRepairCost(d));
    }
  });

  it("mid equals estimateRepairCost when no vehicle factor applies", () => {
    for (const d of DAMAGE.filter((x) => repairBucket(x) !== "none")) {
      expect(estimateRepairRange({ damageType: d }).mid).toBe(
        estimateRepairCost(d),
      );
      expect(
        estimateRepairRange(
          { damageType: d, make: "BMW", year: 1990 },
          { vehicleFactors: false },
        ).mid,
      ).toBe(estimateRepairCost(d));
    }
  });

  it("low <= mid <= high for every bucket", () => {
    for (const d of DAMAGE) {
      const r = estimateRepairRange({
        damageType: d,
        make: "Audi",
        year: 2020,
      });
      expect(r.low).toBeLessThanOrEqual(r.mid);
      expect(r.mid).toBeLessThanOrEqual(r.high);
    }
  });

  it("hidden-damage buckets skew further up than visible body damage", () => {
    expect(REPAIR_SPREAD.flood[1]).toBeGreaterThan(REPAIR_SPREAD.front[1]);
    const flood = estimateRepairRange({ damageType: "WATER/FLOOD" });
    expect(flood.high).toBe(7000);
    expect(flood.low).toBe(1750);
  });

  it("no damage + no condition = zero with confidence none (not a no-damage claim)", () => {
    const r = estimateRepairRange({});
    expect(r).toMatchObject({ low: 0, mid: 0, high: 0, confidence: "none" });
  });

  it("falls back to the arbitrage condition baseline when damage is absent (engine parity)", () => {
    const r = estimateRepairRange({ condition: "salvage_title" });
    expect(r.baseMid).toBe(conditionReconBaseline("salvage_title"));
    expect(r.mid).toBe(2500);
    expect(r.basis).toBe("condition_baseline");
  });

  it("a stated repair estimate becomes the mid with medium confidence", () => {
    const r = estimateRepairRange({
      damageType: "FRONT END",
      statedRepair: 3200,
    });
    expect(r).toMatchObject({
      mid: 3200,
      confidence: "medium",
      basis: "listing_estimate",
    });
    expect(r.low).toBeLessThan(3200);
    expect(r.high).toBeGreaterThan(3200);
  });

  it("keyword estimates are always low confidence and list their reasons", () => {
    const r = estimateRepairRange({ damageType: "SOMETHING ODD" });
    expect(r.bucket).toBe("unrecognized");
    expect(r.mid).toBe(1500);
    expect(r.confidence).toBe("low");
    expect(r.reasons.join(" ")).toMatch(/not recognised/);
  });

  it("vehicle factors: premium make up, old car down, both compose", () => {
    expect(vehicleRepairFactor("Toyota", 2020, 2026).factor).toBe(1);
    expect(vehicleRepairFactor("bmw", 2020, 2026).factor).toBe(1.3);
    expect(vehicleRepairFactor("Ford", 2008, 2026).factor).toBe(0.85);
    expect(vehicleRepairFactor("Lexus", 2005, 2026).factor).toBeCloseTo(1.105);
    const r = estimateRepairRange(
      { damageType: "FRONT END", make: "BMW", year: 2021 },
      { currentYear: 2026 },
    );
    expect(r.mid).toBe(3250);
    expect(r.baseMid).toBe(2500);
  });
});
