import { describe, expect, it } from "vitest";
import type { CheckListingRead } from "@/lib/intelligence/check-listing";
import {
  advisorRequestFor,
  advisorView,
  NOT_ENOUGH_DATA,
} from "@/lib/intelligence/advisor-view";

const read = (over: Partial<CheckListingRead> = {}): CheckListingRead => ({
  vehicle: {
    year: 2018,
    make: "Honda",
    model: "Civic",
    trim: "EX",
    mileage: 71000,
    price: 9500,
    state: "IL",
  },
  verdict: "buy",
  headline: "Good price.",
  fairValue: { value: 11400, basis: "estimate", state: "IL", comps: 9 },
  maxBuy: { value: 10200, basis: "estimate", targetProfit: 1490 },
  resale: { value: 14900, basis: "estimate", state: "TX" },
  profit: {
    net: 2100,
    basis: "estimate",
    fees: 300,
    transport: 600,
    recon: 400,
    repair: 0,
    sellingCost: 250,
  },
  confidence: { label: "medium", score: 62 },
  why: ["9 comparable Civics listed nearby."],
  assumptions: ["Recon $400 baseline"],
  comps: {
    asks: 9,
    sold: 0,
    compKind: "ask",
    compScope: "state",
    newestAt: null,
  },
  trend: null,
  priceHistory: null,
  ...over,
});

describe("advisorView honesty gate", () => {
  it("flip desk sees verdict, Buy ≤, fair value, profit and sell market", () => {
    const v = advisorView(read(), { flipDesk: true });
    expect(v.state).toBe("ready");
    if (v.state !== "ready") return;
    expect(v.word).toBe("Buy");
    expect(v.buyCeiling?.value).toBe(10200);
    expect(v.fairValue.basisLabel).toBe("estimate from live asks");
    expect(v.profit?.value).toBe(2100);
    expect(v.sellMarket).toMatchObject({ value: 14900, state: "TX" });
  });

  it("personal/DIY/parts never see profit or the sell market, even if the API sent them", () => {
    const v = advisorView(read(), { flipDesk: false });
    if (v.state !== "ready") throw new Error("expected ready");
    expect(v.profit).toBeNull();
    expect(v.sellMarket).toBeNull();
    expect(v.fairValue.value).toBe(11400);
  });

  it.each([
    ["verdict not_enough_data", { verdict: "not_enough_data" as const }],
    ["low confidence", { confidence: { label: "low" as const, score: 20 } }],
    ["no confidence", { confidence: { label: "none" as const, score: 0 } }],
    [
      "no fair value",
      {
        fairValue: {
          value: null,
          basis: "insufficient" as const,
          state: null,
          comps: 1,
        },
      },
    ],
    [
      "insufficient basis",
      {
        fairValue: {
          value: 9000,
          basis: "insufficient" as const,
          state: null,
          comps: 2,
        },
      },
    ],
  ])("%s → Not enough data, no verdict or price", (_label, over) => {
    const v = advisorView(read(over), { flipDesk: true });
    expect(v.state).toBe("insufficient");
    expect(v.headline).toBe(NOT_ENOUGH_DATA);
    expect(JSON.stringify(v)).not.toMatch(/11,?400|10,?200|2,?100|14,?900/);
  });

  it("a missing read is Not enough data", () => {
    expect(advisorView(null, { flipDesk: true }).state).toBe("insufficient");
  });

  it("a number with insufficient basis is hidden, not guessed", () => {
    const v = advisorView(
      read({
        maxBuy: { value: 10200, basis: "insufficient", targetProfit: null },
      }),
      { flipDesk: true },
    );
    if (v.state !== "ready") throw new Error("expected ready");
    expect(v.buyCeiling).toBeNull();
  });
});

describe("advisorRequestFor (tracked deal → check-listing body)", () => {
  it("sends the car's own fields, no url, and the title bucket", () => {
    expect(
      advisorRequestFor({
        year: 2018,
        make: "Honda",
        model: "Civic",
        askPrice: 9500,
        mileage: 71000,
        vin: "1HGBH41JXMN109186",
        locationZip: "60432",
        condition: "salvage_title",
        sourceUrl: "https://example.com/x",
      }),
    ).toEqual({
      year: 2018,
      make: "Honda",
      model: "Civic",
      price: 9500,
      mileage: 71000,
      zip: "60432",
      vin: "1HGBH41JXMN109186",
      title: "salvage",
    });
  });

  it("omits an unknown title and returns null with nothing to price", () => {
    expect(
      advisorRequestFor({
        make: "Ford",
        model: "F-150",
        ask_price: 5000,
        condition: "run_drive",
      }),
    ).not.toHaveProperty("title");
    expect(
      advisorRequestFor({ make: "Ford", model: "F-150", ask_price: 0 }),
    ).toBeNull();
    expect(advisorRequestFor(null)).toBeNull();
  });
});
