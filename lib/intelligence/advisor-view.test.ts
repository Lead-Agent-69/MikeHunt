import { describe, expect, it } from "vitest";
import type { CheckListingRead } from "@/lib/intelligence/check-listing";
import {
  advisorRequestFor,
  advisorView,
  NOT_ENOUGH_DATA,
} from "@/lib/intelligence/advisor-view";

const read = (over: Partial<CheckListingRead> = {}): CheckListingRead => ({
  desk: "flip",
  live: { state: "live", label: "Seen today" } as CheckListingRead["live"],
  priceRating: null,
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
  fairValue: { value: 11400, basis: "estimate", state: "IL", comps: 9, label: null, kind: "ask", range: null },
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
          label: null,
          kind: "none" as const,
          range: null,
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
          label: null,
          kind: "none" as const,
          range: null,
        },
      },
    ],
  ])("%s → Not enough data, no verdict or price", (_label, over) => {
    const v = advisorView(read(over), { flipDesk: true });
    expect(v.state).toBe("insufficient");
    expect(v.headline).toBe(NOT_ENOUGH_DATA);
    expect(JSON.stringify(v)).not.toMatch(/11,?400|10,?200|2,?100|14,?900/);
  });

  it("medium confidence keeps the verdict with a caveat; high has none", () => {
    const v = advisorView(read(), { flipDesk: false });
    if (v.state !== "ready") throw new Error("expected ready");
    expect(v.confidenceNote).toBe("Medium confidence");
    const h = advisorView(read({ confidence: { label: "high", score: 90 } }), { flipDesk: false });
    if (h.state !== "ready") throw new Error("expected ready");
    expect(h.confidenceNote).toBeNull();
  });

  it("flip breakdown lists only returned lines; personal gets none", () => {
    const v = advisorView(read(), { flipDesk: true });
    if (v.state !== "ready") throw new Error("expected ready");
    expect(v.breakdown.map((l) => l.label)).toEqual([
      "Buy", "Fees", "Transport", "Recon", "Selling cost", "Expected sale in TX", "Profit",
    ]);
    const noSelling = advisorView(
      read({ profit: { net: 2100, basis: "estimate", fees: 300, transport: 0, recon: 400, repair: 0, sellingCost: null } }),
      { flipDesk: true },
    );
    if (noSelling.state !== "ready") throw new Error("expected ready");
    expect(noSelling.breakdown.map((l) => l.label)).toEqual(["Buy", "Fees", "Recon", "Expected sale in TX", "Profit"]);
    const p = advisorView(read(), { flipDesk: false });
    if (p.state !== "ready") throw new Error("expected ready");
    expect(p.breakdown).toEqual([]);
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

describe("new verdicts from #254", () => {
  it("not_live: Listing not live, no verdict or price on any desk", () => {
    for (const flipDesk of [true, false]) {
      const v = advisorView(
        read({
          verdict: "not_live",
          headline: "This listing left the market 3 days ago.",
          live: { state: "gone", label: "Gone" } as unknown as CheckListingRead["live"],
        }),
        { flipDesk },
      );
      expect(v.state).toBe("not_live");
      expect(v.headline).toBe("Listing not live");
      expect(JSON.stringify(v)).not.toMatch(/11,?400|10,?200|"Buy"/);
    }
  });

  it("personal not_enough_data with a labelled fair value shows it without a verdict", () => {
    const v = advisorView(
      read({
        desk: "personal",
        verdict: "not_enough_data",
        headline: "Not enough sales to call it.",
        profit: null,
        fairValue: {
          value: 11400,
          basis: "estimate",
          state: "IL",
          comps: 4,
          label: "Typical asking price · 4 listings in IL",
          kind: "ask",
          range: null,
        },
      }),
      { flipDesk: false },
    );
    expect(v.state).toBe("fair_only");
    if (v.state !== "fair_only") return;
    expect(v.fairValue).toEqual({
      value: 11400,
      basisLabel: "Typical asking price · 4 listings in IL",
    });
    expect(v).not.toHaveProperty("verdict");
  });

  it("the same read on the flip desk stays Not enough data", () => {
    expect(
      advisorView(read({ verdict: "not_enough_data" }), { flipDesk: true }).state,
    ).toBe("insufficient");
  });

  it("a null profit (personal redaction) never breaks the view", () => {
    const v = advisorView(read({ profit: null }), { flipDesk: true });
    if (v.state !== "ready") throw new Error("expected ready");
    expect(v.profit).toBeNull();
    expect(v.breakdown).toEqual([]);
  });
});

describe("advisorRequestFor (tracked deal → check-listing body)", () => {
  it("sends only the dealId (server reads the stored row, no scrape), plus homeState", () => {
    expect(
      advisorRequestFor(
        {
          id: "7F1C2D3E-1111-4222-8333-944455556666",
          make: "Honda",
          askPrice: 9500,
          vin: "1HGBH41JXMN109186",
          sourceUrl: "https://example.com/x",
        },
        { homeState: "tx" },
      ),
    ).toEqual({ dealId: "7f1c2d3e-1111-4222-8333-944455556666", homeState: "TX" });
  });

  it("returns null without a tracked id (no loose-field guessing)", () => {
    expect(advisorRequestFor({ make: "Ford", model: "F-150", ask_price: 5000 })).toBeNull();
    expect(advisorRequestFor({ id: "not-a-uuid" })).toBeNull();
    expect(advisorRequestFor(null)).toBeNull();
  });
});
