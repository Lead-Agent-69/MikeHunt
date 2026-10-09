import { describe, expect, it } from "vitest";
import { analyzeDeal, selfInclusionGuard } from "./deal-analyzer";
import { categorize } from "@/lib/discovery/categorize";
import type { CompObservation } from "./comps-aggregate";

describe("analyzeDeal — no circular valuation", () => {
  it("does not mark up the ask into a resale value when there is no evidence", () => {
    const a = analyzeDeal({
      title: "Mystery car",
      make: "Ford",
      ask_price: 10000,
      source: "craigslist",
    } as any);
    // Used to be ask × 1.15 (= $11,500) — profit invented from the price being graded.
    expect(a.sellEstimate).toBe(10000);
    expect(a.valuation?.source).toBe("asking_price");
    expect(a.valuation?.confidence).toBe("none");
    expect(a.verdict).not.toBe("go");
    expect(a.warnings.join(" ")).toMatch(/resale is unknown/i);
    const tags = categorize({
      ask_price: 10000,
      sell_estimate: a.sellEstimate,
      sellBasis: a.sellBasis,
      valuationSource: a.valuation?.source,
    });
    expect(tags.grade).toBe("unknown");
  });
});

describe("selfInclusionGuard", () => {
  const comps = {
    retail: 20000,
    wholesale: null,
    nRetail: 3,
    nWholesale: 0,
    confidence: "low" as const,
  };
  it("drops a 3-comp retail bucket that contains the listing itself", () => {
    const g = selfInclusionGuard(comps, {
      source: "cars_com",
      ask_price: 15000,
    } as any);
    expect(g).toMatchObject({ retail: null, nRetail: 2, confidence: "none" });
  });
  it("lowers confidence by one sample when the listing is in a deeper pool", () => {
    const g = selfInclusionGuard(
      { ...comps, nRetail: 12, confidence: "high" },
      {
        source: "autotrader",
        ask_price: 15000,
      } as any,
    );
    expect(g).toMatchObject({
      retail: 20000,
      nRetail: 11,
      confidence: "medium",
    });
  });
  it("leaves comps alone for channels that are not in the ask index", () => {
    expect(
      selfInclusionGuard(comps, { source: "copart", ask_price: 5000 } as any),
    ).toBe(comps);
    expect(selfInclusionGuard(null, { source: "cars_com" } as any)).toBeNull();
  });
});

describe("analyzeDeal — supplied comp feed (same-state first)", () => {
  const deal = {
    id: "self-1",
    year: 2018,
    make: "Toyota",
    model: "Camry",
    mileage: 60000,
    condition: "clean",
    title: "2018 Toyota Camry SE",
    ask_price: 15000,
    source: "copart",
    location_state: "MO",
  } as any;

  it("values off same-state sold comps when n >= 3 and reports the scope", () => {
    const feed: CompObservation[] = [
      { price: 17000, kind: "sold", state: "MO", mileage: 60000 },
      { price: 17500, kind: "sold", state: "MO", mileage: 60000 },
      { price: 18000, kind: "sold", state: "MO", mileage: 60000 },
      { price: 30000, kind: "sold", state: "CA", mileage: 60000 },
      { price: 9000, kind: "ask", state: "MO", id: "self-1" },
    ];
    const a = analyzeDeal(deal, { comps: feed });
    expect(a.valuation?.compScope).toBe("state");
    expect(a.valuation?.compKind).toBe("sold");
    expect(a.valuation?.compCount).toBe(3);
    expect(a.valuation?.cleanComp).toBe(17500);
  });

  it("falls back to the index (not a guess) when the feed is too thin", () => {
    const a = analyzeDeal(deal, {
      comps: [{ price: 17000, kind: "sold", state: "MO" }],
    });
    expect(a.valuation?.compScope).not.toBe("state");
    expect(a.valuation?.compScope).not.toBe("national");
  });
});

describe("analyzeDeal — haversine transport from buyer home", () => {
  it("uses buyer + listing coordinates when present", () => {
    const deal = {
      year: 2018,
      make: "Ford",
      model: "F-150",
      ask_price: 14000,
      mileage: 90000,
      condition: "run_drive",
      title: "2018 Ford F-150 XLT",
      source: "craigslist",
      location_state: "MO",
      lat: 39.0997,
      lng: -94.5786,
    } as any;
    const a = analyzeDeal(deal, {
      home: { lat: 38.627, lng: -90.1994, state: "MO" },
    });
    expect(a.distanceBasis).toBe("coords");
    expect(a.miles!).toBeGreaterThan(300);
    expect(a.transportCost).toBe(
      Math.max(150, Math.round(a.miles! * 0.78) + 50),
    );
  });
});
