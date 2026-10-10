import { describe, expect, it } from "vitest";
import { netProfitRange } from "./net-range";
import { estimateRepairRange } from "./repair-baseline";

const base = { ask: 10000, fees: 800, transport: 400, recon: 500 };

describe("netProfitRange", () => {
  it("null when there is no comp-backed resale (engine rule)", () => {
    expect(
      netProfitRange({
        ...base,
        expectedResale: null,
        repair: { low: 0, mid: 0, high: 0 },
      }),
    ).toBeNull();
  });

  it("expected matches the engine formula with repair.mid", () => {
    const repair = estimateRepairRange({ damageType: "FRONT END" }); // 1500 / 2500 / 4000
    const r = netProfitRange({ ...base, expectedResale: 20000, repair })!;
    // 20000 - (10000+800+400+500+2500) - 9% of 20000 = 4000
    expect(r.expected).toBe(4000);
    expect(r.low).toBe(20000 - 11700 - repair.high - 1800);
    expect(r.high).toBe(20000 - 11700 - repair.low - 1800);
    expect(r.low).toBeLessThan(r.expected);
    expect(r.high).toBeGreaterThan(r.expected);
    expect(r.holdingIncluded).toBe(false);
  });

  it("uses a resale band when given and holding only when opted in", () => {
    const r = netProfitRange({
      ...base,
      expectedResale: 20000,
      resaleLow: 18000,
      resaleHigh: 21000,
      repair: { low: 1000, mid: 1000, high: 1000 },
      holdingCost: 490,
    })!;
    expect(r.holdingIncluded).toBe(true);
    expect(r.expected).toBe(20000 - 11700 - 490 - 1000 - 1800);
    expect(r.low).toBe(18000 - 11700 - 490 - 1000 - 1620);
    expect(r.high).toBe(21000 - 11700 - 490 - 1000 - 1890);
  });
});
