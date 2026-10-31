import { describe, it, expect } from "vitest";
import {
  aggregateLiveDealsForMarketPulse,
  buildDeterministicMarketPulse,
} from "@/app/api/market/analyst/route";
import { briefCandidate } from "@/lib/deals/__fixtures__/brief-candidate";
describe("free evidence-backed market note", () => {
  it("does not turn legacy timing and aggregate profit into recommendations", () => {
    const report = buildDeterministicMarketPulse({
      timing: [
        { make: "Ford", model: "Explorer", signal: "BUY_NOW", pct_change: 8 },
      ],
      aggs: [
        { make: "Ford", model: "Explorer", avg_profit: 2100, unit_count: 12 },
      ],
    });
    expect(report).toContain("No purchase recommendation");
    expect(report).not.toContain("$2,100");
    expect(report).not.toContain("BUY_NOW");
  });
  it("excludes stored profit when purchase checks are incomplete", () => {
    expect(
      aggregateLiveDealsForMarketPulse([
        { ...briefCandidate(), deal_analysis: {} },
      ]),
    ).toEqual([]);
  });
  it("derives claims from the existing current evidence gate", () => {
    const rows = [{ ...briefCandidate(), location_state: "MO" }];
    const aggs = aggregateLiveDealsForMarketPulse(rows);
    expect(aggs[0]).toMatchObject({
      unit_count: 1,
      avg_profit: 4100,
      evidenceVerified: true,
    });
    const report = buildDeterministicMarketPulse({ aggs });
    expect(report).toContain("$4,100");
    expect(report).toContain("bounded inventory sample");
  });
});
