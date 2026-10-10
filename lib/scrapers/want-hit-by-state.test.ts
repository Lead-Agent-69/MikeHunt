import { describe, expect, it } from "vitest";
import { wantHitByState, wantHitRatio } from "./sweep-demand";

describe("wantHitByState", () => {
  const input = {
    anchors: ["mo", "TX", "IA", "MO", "ZZ"],
    primaryCounts: { MO: 12, TX: 2, IA: 5 },
    minRows: 5,
  };
  it("reports each demanded state, gaps first", () => {
    expect(wantHitByState(input)).toEqual([
      { state: "TX", primaryRows: 2, hit: false, shortBy: 3 },
      { state: "IA", primaryRows: 5, hit: true, shortBy: 0 },
      { state: "MO", primaryRows: 12, hit: true, shortBy: 0 },
    ]);
  });
  it("agrees with the aggregate want-hit ratio", () => {
    const rows = wantHitByState(input);
    const agg = wantHitRatio(input);
    expect(rows.filter((r) => r.hit).length).toBe(agg.covered);
    expect(rows.length).toBe(agg.demanded);
  });
});
