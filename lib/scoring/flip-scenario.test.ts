import { describe, expect, it } from "vitest";
import {
  calculateFlipScenario,
  emptyScenario,
  readScenarioDraft,
  scenarioFields,
  type ScenarioInput,
} from "./flip-scenario";

const complete: ScenarioInput = {
  purchase: 10000,
  resale: 16000,
  buyerFees: 500,
  buyerFeeRate: 5,
  taxTitle: 500,
  repair: 1000,
  transport: 300,
  holding: 200,
  sellingFees: 100,
  sellingFeeRate: 2,
  otherCosts: 400,
  targetProfit: 2000,
};
describe("explicit flip scenario", () => {
  it("includes every cost and distinguishes ROI from sale margin", () => {
    const r = calculateFlipScenario(complete);
    expect(r.status).toBe("complete");
    expect(r.acquisitionReady).toBe(false);
    expect(r.metrics).toMatchObject({
      totalCost: 13820,
      investedBeforeSale: 13400,
      buyerCost: 1000,
      sellingCost: 420,
      profit: 2180,
      breakEvenResale: 13775.52,
      purchaseCeiling: 10171.42,
      targetMet: true,
      targetGap: 180,
    });
    expect(r.metrics!.roiPct).toBeCloseTo((2180 / 13820) * 100);
    expect(r.metrics!.marginPct).toBeCloseTo(13.625);
    expect(r.metrics!.stress.map((s) => s.profit)).toEqual([2180, 612, 412]);
  });
  it.each(scenarioFields)("does not calculate when %s is missing", (field) => {
    const r = calculateFlipScenario({ ...complete, [field]: "" });
    expect(r.status).toBe("needs_inputs");
    expect(r.missing).toEqual([field]);
    expect(r.metrics).toBeNull();
  });
  it("accepts explicit zero costs without treating null, whitespace or undefined as zero", () => {
    const zero = Object.fromEntries(scenarioFields.map((f) => [f, 0]));
    expect(
      calculateFlipScenario({ ...zero, purchase: 100, resale: 200 }).metrics
        ?.profit,
    ).toBe(100);
    for (const value of [null, undefined, "  "])
      expect(
        calculateFlipScenario({ ...complete, repair: value }).metrics,
      ).toBeNull();
  });
  it.each([
    -1,
    true,
    false,
    [],
    {},
    "1e3",
    "0x10",
    "10,000",
    "NaN",
    Infinity,
    "12.345",
    100000001,
  ])("rejects invalid amounts: %s", (value) => {
    const r = calculateFlipScenario({ ...complete, repair: value });
    expect(r.status).toBe("invalid");
    expect(r.errors.repair).toBeTruthy();
    expect(r.metrics).toBeNull();
  });
  it("validates rate bounds and positive vehicle prices", () => {
    for (const [field, value] of [
      ["sellingFeeRate", 100],
      ["buyerFeeRate", 101],
      ["purchase", 0],
      ["resale", 0],
    ] as const) {
      expect(
        calculateFlipScenario({ ...complete, [field]: value }).errors[field],
      ).toBeTruthy();
    }
  });
  it("keeps losses negative and does not invent a viable ceiling", () => {
    const r = calculateFlipScenario({ ...complete, resale: 1000 });
    expect(r.metrics!.profit).toBeLessThan(0);
    expect(r.metrics!.purchaseCeiling).toBeNull();
    expect(r.metrics!.targetMet).toBe(false);
  });
  it("never rounds an offer ceiling above the target or break-even below costs", () => {
    for (const rate of [0, 0.01, 2.75, 9.99, 33.33, 99.99]) {
      const input = { ...complete, buyerFeeRate: rate, sellingFeeRate: 3.17 };
      const m = calculateFlipScenario(input).metrics!;
      if (m.purchaseCeiling != null) {
        const atLimit = calculateFlipScenario({
          ...input,
          purchase: m.purchaseCeiling,
        }).metrics!;
        expect(atLimit.profit).toBeGreaterThanOrEqual(
          Number(input.targetProfit),
        );
      }
      expect(
        calculateFlipScenario({ ...input, resale: m.breakEvenResale }).metrics!
          .profit,
      ).toBeGreaterThanOrEqual(0);
    }
  });
  it("only seeds a profit goal, never invented resale or costs", () => {
    const d = emptyScenario(2500);
    expect(d.targetProfit).toBe("2500");
    expect(
      scenarioFields
        .filter((f) => f !== "targetProfit")
        .every((f) => d[f] === ""),
    ).toBe(true);
    expect(emptyScenario(null).targetProfit).toBe("3000");
  });
  it("restores only versioned, finite, complete-shaped drafts (partial entries allowed)", () => {
    const savedAt = "2026-10-19T01:00:00Z";
    const draft = emptyScenario(0);
    expect(
      readScenarioDraft(JSON.stringify({ version: 1, savedAt, draft })),
    ).toEqual({ savedAt, draft });
    for (const raw of [
      null,
      "{",
      JSON.stringify({ version: 2, savedAt, draft }),
      JSON.stringify({ version: 1, savedAt: "bad", draft }),
      JSON.stringify({
        version: 1,
        savedAt,
        draft: { ...draft, repair: true },
      }),
      JSON.stringify({
        version: 1,
        savedAt,
        draft: { ...draft, repair: "-1" },
      }),
    ])
      expect(readScenarioDraft(raw)).toBeNull();
  });
});
