import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateOpportunity,
  findOpportunities,
  isExcluded,
  rankOpportunities,
  type ArbitrageComp,
  type ArbitrageListing,
  type ArbitrageOpportunity,
  type ScoredOpportunity,
} from "./engine";
import {
  COMP_MAX_AGE_DAYS,
  SELLING_FEE_PCT,
  TITLE_DISCOUNT,
  UNKNOWN_DISTANCE_TRANSPORT_COST,
} from "./constants";
import { titleLane } from "./title";
import { buyerDistance } from "@/lib/geo/buyer-distance";
import { transportCostForMiles } from "@/lib/geo";
import { SOLD_MEDIAN_WINDOW_DAYS } from "@/lib/scoring/market-value";

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const STL = { lat: 38.627, lng: -90.1994, state: "MO" };
const KC = { lat: 39.0997, lng: -94.5786, state: "MO" };

const sold = (
  price: number,
  state: string,
  title = "clean",
  age = 10,
): ArbitrageComp => ({
  price,
  state,
  kind: "sold",
  title,
  observedAt: daysAgo(age),
});
const listing = (extra: Partial<ArbitrageListing> = {}): ArbitrageListing => ({
  id: "d1",
  ask: 10000,
  source: "cars_com",
  title: "clean title",
  location: KC,
  lastSeenAt: daysAgo(0.5),
  ...extra,
});
const scored = (r: ReturnType<typeof evaluateOpportunity>) => {
  expect(isExcluded(r)).toBe(false);
  const o = r as ArbitrageOpportunity;
  expect(o.status).toBe("scored");
  return o as ScoredOpportunity;
};
const opts = { sellMarket: STL, now: NOW };

describe("arbitrage engine — needs_comps", () => {
  it("returns needs_comps with no profit when fewer than 3 comps", () => {
    const r = evaluateOpportunity(
      listing(),
      [sold(15000, "MO"), sold(15500, "IL")],
      opts,
    );
    expect(isExcluded(r)).toBe(false);
    const o = r as ArbitrageOpportunity;
    expect(o.status).toBe("needs_comps");
    expect(o).not.toHaveProperty("profit");
    expect(o).not.toHaveProperty("expectedResale");
    expect(o).not.toHaveProperty("costs");
    expect(o).not.toHaveProperty("rankKey");
  });

  it("never lets the listing be its own comp", () => {
    const comps = [
      sold(15000, "MO"),
      sold(15500, "MO"),
      { ...sold(30000, "MO"), id: "d1" },
    ];
    const r = evaluateOpportunity(
      listing(),
      comps,
      opts,
    ) as ArbitrageOpportunity;
    expect(r.status).toBe("needs_comps");
  });
});

describe("arbitrage engine — formula", () => {
  it("spread = resale − (ask + buyerFees + transport + recon + sellingFees)", () => {
    const comps = [sold(15000, "MO"), sold(16000, "MO"), sold(17000, "MO")];
    const o = scored(evaluateOpportunity(listing(), comps, opts));
    expect(o.expectedResale).toBe(16000);
    expect(o.comps).toMatchObject({
      scope: "state",
      kind: "sold",
      n: 3,
      sellState: "MO",
    });
    const c = o.costs;
    expect(c.sellingFees).toBe(Math.round(16000 * SELLING_FEE_PCT));
    expect(c.total).toBe(
      c.ask + c.buyerFees + c.transport + c.recon + c.sellingFees,
    );
    expect(o.profit).toBe(16000 - c.total);
    expect(o.assumptions.length).toBeGreaterThan(0);
  });

  it("prices transport from the haversine distance to the buyer's sell market", () => {
    const comps = [sold(15000, "MO"), sold(16000, "MO"), sold(17000, "MO")];
    const o = scored(evaluateOpportunity(listing(), comps, opts));
    const d = buyerDistance(STL, KC);
    expect(o.distance).toEqual({ miles: d.miles, basis: "coords" });
    expect(o.costs.transport).toBe(transportCostForMiles(d.miles!));
  });

  it("books the conservative default and loses confidence when distance is unknown", () => {
    const comps = [sold(15000, "MO"), sold(16000, "MO"), sold(17000, "MO")];
    const known = scored(evaluateOpportunity(listing(), comps, opts));
    const unknown = scored(
      evaluateOpportunity(listing({ location: null }), comps, opts),
    );
    expect(unknown.distance.basis).toBe("unknown");
    expect(unknown.costs.transport).toBe(UNKNOWN_DISTANCE_TRANSPORT_COST);
    expect(unknown.confidence.score).toBeLessThan(known.confidence.score);
    expect(unknown.confidence.reasons.join(" ")).toMatch(/distance unknown/);
  });

  it("applies the source fee model (Copart buyer fees + cleanup recon)", () => {
    const comps = [sold(15000, "MO"), sold(16000, "MO"), sold(17000, "MO")];
    const o = scored(
      evaluateOpportunity(
        listing({ source: "copart", damageType: "FRONT END" }),
        comps,
        opts,
      ),
    );
    expect(o.costs.buyerFees).toBe(Math.round(10000 * 0.1 + 130 + 100));
    expect(o.costs.recon).toBe(2500 + 500);
  });
});

describe("arbitrage engine — title lanes", () => {
  const clean = [sold(20000, "MO"), sold(21000, "MO"), sold(22000, "MO")];

  it("maps rebuildable onto the salvage lane", () => {
    expect(titleLane("Rebuildable")).toBe("salvage");
    expect(titleLane("SALVAGE CERTIFICATE")).toBe("salvage");
    expect(titleLane("rebuilt title")).toBe("rebuilt");
  });

  it("values salvage on salvage comps, never clean, when salvage comps exist", () => {
    const comps = [
      ...clean,
      sold(9000, "MO", "salvage"),
      sold(9500, "MO", "salvage"),
      sold(10000, "MO", "salvage"),
    ];
    const o = scored(
      evaluateOpportunity(
        listing({ title: "salvage", ask: 5000 }),
        comps,
        opts,
      ),
    );
    expect(o.expectedResale).toBe(9500);
    expect(o.comps.titleAdjusted).toBe("same_title");
  });

  it("only touches clean comps through the flagged discount fallback", () => {
    const comps = [...clean, sold(9000, "MO", "salvage")];
    const o = scored(
      evaluateOpportunity(
        listing({ title: "salvage", ask: 5000 }),
        comps,
        opts,
      ),
    );
    expect(o.comps.titleAdjusted).toBe("discount_fallback");
    expect(o.expectedResale).toBe(Math.round(21000 * TITLE_DISCOUNT.salvage));
    expect(o.expectedResale).toBeLessThan(21000);
    expect(o.assumptions.join(" ")).toMatch(/title discount/);
    const same = scored(
      evaluateOpportunity(
        listing({ title: "salvage", ask: 5000 }),
        [
          ...clean,
          sold(11550, "MO", "salvage"),
          sold(11550, "MO", "salvage"),
          sold(11550, "MO", "salvage"),
        ],
        opts,
      ),
    );
    expect(o.confidence.score).toBeLessThan(same.confidence.score);
  });

  it("rebuilt compares to rebuilt, not salvage", () => {
    const comps = [
      sold(9000, "MO", "salvage"),
      sold(9000, "MO", "salvage"),
      sold(9000, "MO", "salvage"),
      sold(14000, "MO", "rebuilt"),
      sold(14000, "MO", "rebuilt"),
      sold(14000, "MO", "rebuilt"),
    ];
    const o = scored(
      evaluateOpportunity(listing({ title: "rebuilt" }), comps, opts),
    );
    expect(o.expectedResale).toBe(14000);
  });

  it("needs_comps when neither same-title nor clean fallback qualifies; parts has no fallback", () => {
    const s = evaluateOpportunity(
      listing({ title: "salvage" }),
      [sold(20000, "MO"), sold(9000, "MO", "salvage")],
      opts,
    ) as ArbitrageOpportunity;
    expect(s.status).toBe("needs_comps");
    expect(s).not.toHaveProperty("profit");
    const p = evaluateOpportunity(
      listing({ title: "parts only" }),
      clean,
      opts,
    ) as ArbitrageOpportunity;
    expect(p.status).toBe("needs_comps");
  });

  it("never pools salvage comps into a clean listing's resale", () => {
    const comps = [
      sold(5000, "MO", "salvage"),
      sold(5000, "MO", "salvage"),
      sold(5000, "MO", "salvage"),
    ];
    const o = evaluateOpportunity(
      listing(),
      comps,
      opts,
    ) as ArbitrageOpportunity;
    expect(o.status).toBe("needs_comps");
  });
});

describe("arbitrage engine — exclusion", () => {
  const comps = [sold(15000, "MO"), sold(16000, "MO"), sold(17000, "MO")];

  it("excludes stale/frozen flags and an injected isStale predicate", () => {
    const rows = [
      listing({ id: "fresh" }),
      listing({ id: "a", stale: true }),
      listing({ id: "b", is_stale: true }),
      listing({ id: "c", frozen: true }),
      listing({ id: "d" }),
    ];
    const { ranked, excluded } = findOpportunities(rows, () => comps, {
      ...opts,
      isStale: (r) => r.id === "d",
    });
    expect(ranked.map((r) => r.id)).toEqual(["fresh"]);
    expect(excluded.map((e) => e.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(excluded.every((e) => e.reason === "stale")).toBe(true);
  });

  it("excludes rows with no usable price", () => {
    const r = evaluateOpportunity(listing({ ask: 0 }), comps, opts);
    expect(r).toEqual({ id: "d1", reason: "no_price" });
  });
});

describe("arbitrage engine — ranking", () => {
  it("puts higher confidence ahead at similar profit, and needs_comps last without profit", () => {
    const strong = [...Array.from({ length: 12 }, () => sold(16000, "MO"))];
    const weak: ArbitrageComp[] = [
      {
        price: 16900,
        kind: "ask",
        state: "TX",
        observedAt: daysAgo(150),
        title: "clean",
      },
      {
        price: 16900,
        kind: "ask",
        state: "TX",
        observedAt: daysAgo(150),
        title: "clean",
      },
      {
        price: 16900,
        kind: "ask",
        state: "TX",
        observedAt: daysAgo(150),
        title: "clean",
      },
    ];
    const hi = scored(evaluateOpportunity(listing({ id: "hi" }), strong, opts));
    const lo = scored(evaluateOpportunity(listing({ id: "lo" }), weak, opts));
    // Similar profit (within ~5%), very different confidence.
    expect(Math.abs(hi.profit - lo.profit)).toBeLessThan(hi.profit * 0.1);
    expect(lo.profit).toBeGreaterThan(hi.profit); // lo is even slightly richer on paper
    expect(hi.confidence.score).toBeGreaterThan(lo.confidence.score);
    const needs = evaluateOpportunity(
      listing({ id: "nc", ask: 100 }),
      [],
      opts,
    ) as ArbitrageOpportunity;
    const ranked = rankOpportunities([needs, lo, hi]);
    expect(ranked.map((r) => r.id)).toEqual(["hi", "lo", "nc"]);
    expect(ranked[2]).not.toHaveProperty("profit");
    expect(hi.confidence.label).toBe("high");
  });

  it("drops comps older than the comp window", () => {
    const old = [
      sold(15000, "MO", "clean", 400),
      sold(16000, "MO", "clean", 400),
      sold(17000, "MO", "clean", 400),
    ];
    const r = evaluateOpportunity(listing(), old, opts) as ArbitrageOpportunity;
    expect(r.status).toBe("needs_comps");
  });
});

describe("arbitrage constants mirror existing repo logic", () => {
  it("matches market-value / deal-analyzer defaults", () => {
    expect(COMP_MAX_AGE_DAYS).toBe(SOLD_MEDIAN_WINDOW_DAYS);
    const src = readFileSync("lib/scoring/deal-analyzer.ts", "utf8");
    expect(src).toMatch(/SELL_COST_PCT \|\| "0\.09"/);
    expect(SELLING_FEE_PCT).toBe(0.09);
    expect(src).toMatch(/DEFAULT_TRANSPORT_COST \|\| "600"/);
    expect(UNKNOWN_DISTANCE_TRANSPORT_COST).toBe(600);
    expect(src).toMatch(/titleFee: 100, reconCost: 500/);
    expect(src).toMatch(/titleFee: 100, reconCost: 300/);
  });
});
