import { describe, it, expect } from "vitest";
import { briefCandidate } from "@/lib/deals/__fixtures__/brief-candidate";
import {
  comparisonSample,
  exactVehicleModel,
  modelVariants,
} from "./comparison-sample";
import { recommendationText } from "@/lib/deals/recommendation-evidence";
const candidate = () => ({
  ...briefCandidate(),
  mileage: 10000,
  trim: "EX",
  fuel_type: "Gas",
  drivetrain: "FWD",
  transmission: "Automatic",
  location_state: "MO",
});
describe("evidence-backed comparison", () => {
  it("uses the same purchase gate for zero-mileage evidence while keeping it out of mileage fitting", () => {
    const sample = comparisonSample(
      [briefCandidate()],
      { make: "Honda", model: "Accord", year: 2003 },
      1,
    );
    expect(sample.goDeals).toBe(1);
    expect(sample.avgProfit).toBe(4100);
    expect(sample.depreciationPer1000Miles).toBeNull();
  });
  it("does not combine Model 3 and Model Y or adjacent requested years", () => {
    expect(
      exactVehicleModel(
        { make: "Tesla", model: "Model Y", year: 2020 },
        "Tesla",
        "Model 3",
        2020,
      ),
    ).toBe(false);
    expect(
      exactVehicleModel(
        { make: "Honda", model: "Accord", year: 2004 },
        "Honda",
        "Accord",
        2003,
      ),
    ).toBe(false);
    expect(
      exactVehicleModel({ make: "Ford", model: "F-150" }, "Ford", "F150"),
    ).toBe(true);
    expect(modelVariants("F150")).toContain("F-150");
  });
  it("withholds profit, bids and mileage estimates from teasers and unknown specifications", () => {
    const r = candidate();
    const s = comparisonSample(
      [{ ...r, price_evidence: { kind: "down_payment", listedAmount: 10000 } }],
      { make: "Honda", model: "Accord", year: 2003 },
      1,
    );
    expect(s.avgProfit).toBeNull();
    expect(s.goDeals).toBe(0);
    expect(s.sample.eligible).toBe(0);
    expect(s.depreciationPer1000Miles).toBeNull();
    expect(recommendationText({ ...r, deal_analysis: {} }, true)).not.toContain(
      "maximum bid:",
    );
    expect(recommendationText({ ...r, deal_analysis: {} }, true)).toContain(
      "not established",
    );
  });
  it("requires the complete existing evidence and reports sample limits", () => {
    const s = comparisonSample(
      [candidate()],
      { make: "Honda", model: "Accord", year: 2003 },
      1000,
    );
    expect(s.avgProfit).toBe(4100);
    expect(s.sample.truncated).toBe(true);
    expect(s.sample.decisionReady).toBe(1);
    expect(s.pctChange30d).toBeNull();
    const stale = { ...candidate(), last_seen_at: "2020-01-01" };
    expect(
      comparisonSample([stale], { make: "Honda", model: "Accord" }, 1)
        .avgProfit,
    ).toBeNull();
    expect(recommendationText(candidate(), false)).not.toContain(
      "maximum bid:",
    );
    expect(recommendationText(candidate(), true)).toContain(
      "maximum bid: $10,400",
    );
  });
  it("does not fit a curve across mixed years or unknown trim even with eight rows", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      ...candidate(),
      year: i % 2 ? 2004 : 2003,
      mileage: 10000 + i * 1000,
      ask_price: 10000 - i * 100,
      price_evidence: { kind: "asking", askingPrice: 10000 - i * 100 },
    }));
    expect(
      comparisonSample(rows, { make: "Honda", model: "Accord" }, 8)
        .depreciationPer1000Miles,
    ).toBeNull();
    expect(
      comparisonSample(
        rows.map((r) => ({ ...r, year: 2003, trim: null })),
        { make: "Honda", model: "Accord" },
        8,
      ).depreciationPer1000Miles,
    ).toBeNull();
  });
});
