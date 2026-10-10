import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeDeal, hasResaleEvidence } from "./deal-analyzer";
import type { CompObservation } from "./comps-aggregate";

// Verdict rules (lib/scoring/deal-analyzer.ts EVIDENCE GATE):
//   • go/hold/pass only with ≥3 live comps (or a third-party market value)
//   • otherwise "not_enough_data", never "pass"
//   • asking-price comps report at most "medium" confidence
//   • a well-priced retail listing backed by comps can be "go"

const asks = (n: number, price: number, extra: Partial<CompObservation> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    price: price + (i % 3) * 200 - 200,
    kind: "ask" as const,
    mileage: 20000,
    id: `comp-${i}`,
    source: "cars_com",
    ...extra,
  }));

const truck = {
  id: "target-1",
  year: 2024,
  make: "Ford",
  model: "F-150",
  trim: "XLT",
  mileage: 20000,
  condition: "clean_title",
  title: "2024 Ford F-150 XLT",
  source: "independent_dealer",
};

describe("evidence gate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("a well-priced retail listing with ≥3 live ask comps can be GO, at most medium confidence", () => {
    const a = analyzeDeal({ ...truck, ask_price: 32000 } as any, {
      comps: asks(8, 48000),
    });
    expect(a.valuation?.compCount).toBe(8);
    expect(a.sellBasis).toBe("comps");
    expect(a.valuation?.source).toBe("comparables");
    expect(a.profit).toBeGreaterThan(1500);
    expect(a.verdict).toBe("go");
    expect(["low", "medium"]).toContain(a.valuation?.confidence);
    // Bounded uplift: never booked above 1.3× the ask on medium comps.
    expect(a.sellEstimate).toBeLessThanOrEqual(Math.round(32000 * 1.3));
  });

  it("deep (12+) ask comps never report high confidence", () => {
    const a = analyzeDeal({ ...truck, ask_price: 32000 } as any, {
      comps: asks(14, 48000),
    });
    expect(a.valuation?.compConfidence).toBe("high");
    expect(a.valuation?.confidence).toBe("medium");
  });

  it("completed-sale comps can still report high confidence", () => {
    const a = analyzeDeal({ ...truck, ask_price: 32000 } as any, {
      comps: asks(14, 45000, { kind: "sold" }),
    });
    expect(a.valuation?.compKind).toBe("sold");
    expect(a.valuation?.confidence).toBe("high");
  });

  it("enough comps and priced at market → PASS (we checked; it's not a deal)", () => {
    const a = analyzeDeal({ ...truck, ask_price: 46000 } as any, {
      comps: asks(8, 46000),
    });
    expect(a.valuation?.compCount).toBe(8);
    expect(a.verdict).toBe("pass");
  });

  it("fewer than 3 comps and no market value → not_enough_data, not pass", () => {
    const a = analyzeDeal({ ...truck, ask_price: 46000 } as any, {
      comps: asks(2, 46000),
    });
    expect(a.verdict).toBe("not_enough_data");
    expect(a.score).toBeLessThanOrEqual(40);
    expect(a.warnings[0]).toMatch(/not enough data|isn't enough data/i);
  });

  it("baseline-only (no comps at all) is not_enough_data even when it pencils", () => {
    const a = analyzeDeal({
      ...truck,
      source: "copart",
      condition: "repairable",
      damage_type: "MINOR DENT/SCRATCHES",
      ask_price: 5000,
      buy_now_price: 5000,
    } as any);
    expect(a.sellBasis).toBe("baseline");
    expect(a.verdict).toBe("not_enough_data");
  });

  it("unknown resale (no year/make baseline) is not_enough_data", () => {
    const a = analyzeDeal({
      ask_price: 9000,
      source: "craigslist",
      title: "car for sale",
    } as any);
    expect(a.verdict).toBe("not_enough_data");
  });

  it("a third-party market value counts as evidence: overpriced → pass", () => {
    const a = analyzeDeal({
      ...truck,
      source: "autotrader",
      ask_price: 52000,
      mmr_value: 42000,
    } as any);
    expect(a.valuation?.source).not.toBe("comparables");
    expect(["pass", "hold"]).toContain(a.verdict);
    expect(a.verdict).not.toBe("not_enough_data");
  });

  it("an implausible / bait price keeps PASS even without comps", () => {
    const a = analyzeDeal({
      ...truck,
      ask_price: 999,
      title: "2024 Ford F-150 WE FINANCE $999 down",
      source: "craigslist",
    } as any);
    expect(a.priceImplausible).toBe(true);
    expect(a.verdict).toBe("pass");
  });

  it("a current gov-auction bid is never GO (bid is not the final price)", () => {
    const a = analyzeDeal(
      { ...truck, source: "gov_auction", ask_price: 20000 } as any,
      {
        comps: asks(8, 48000),
      },
    );
    expect(a.verdict).not.toBe("go");
    expect(a.warnings.join(" ")).toMatch(/auction bid/i);
  });

  it("run_drive on a retail ask books used-retail recon, not $1,500 auction repair", () => {
    const retail = analyzeDeal({
      ...truck,
      condition: "run_drive",
      ask_price: 30000,
    } as any);
    const auction = analyzeDeal({
      ...truck,
      condition: "run_drive",
      source: "copart",
      ask_price: 30000,
    } as any);
    expect(retail.repairCost).toBe(400);
    expect(auction.repairCost).toBeGreaterThanOrEqual(1500);
  });
});

describe("hasResaleEvidence", () => {
  it("needs ≥3 usable comps or a third-party value", () => {
    expect(hasResaleEvidence("comps", "comparables", 3, "low")).toBe(true);
    expect(hasResaleEvidence("comps", "comparables", 2, "low")).toBe(false);
    expect(hasResaleEvidence("comps", "comparables", 8, "none")).toBe(false);
    expect(hasResaleEvidence("market", "third_party", 0)).toBe(true);
    expect(hasResaleEvidence("market", "asking_price", 9, "medium")).toBe(
      false,
    );
    expect(hasResaleEvidence("baseline", "baseline", 0)).toBe(false);
  });
});
