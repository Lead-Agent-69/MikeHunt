import { describe, expect, it } from "vitest";
import { valuationExplanation, valuationInputs } from "./explanation";

describe("recorded valuation inputs", () => {
  it("explains asking-price observations and exact stored adjustments without inventing sales", () => {
    const rows = Object.fromEntries(
      valuationExplanation({
        source: "comparables",
        compCount: 20,
        compKind: "ask",
        compScope: "state",
        cleanComp: 20000,
        mileageMult: 0.97,
        titleMult: 0.5,
        soldCount: 0,
        resaleEvidence: false,
      }),
    );
    expect(rows["Comparable observations"]).toBe("20");
    expect(rows["Comparable price type"]).toBe(
      "Seller asking prices, not sales",
    );
    expect(rows["Mileage adjustment"]).toBe("-3% (x0.970)");
    expect(rows["Comparable reference price"]).toBe("$20,000");
    expect(rows["Recorded model threshold"]).toBe("No");
  });
  it("leaves unavailable measurements unknown, not zero or a fabricated multiplier", () => {
    const rows = Object.fromEntries(
      valuationExplanation({ compCount: NaN, cleanComp: 0 }),
    );
    expect(rows["Comparable observations"]).toBe("Not recorded");
    expect(rows["Mileage adjustment"]).toBe("Not recorded");
    expect(rows["Comparable reference price"]).toBe("Not recorded");
  });
  it("allowlists fields and rejects arbitrary source text or private blobs", () => {
    expect(
      valuationInputs({
        compCount: 3,
        source: "private SQL",
        contact: "private",
        platformCounts: { fake: 20 },
        mileageMult: Infinity,
      }),
    ).toEqual({ compCount: 3 });
  });
});
