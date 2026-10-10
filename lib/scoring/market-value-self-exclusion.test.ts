import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetMarketIndexForTest,
  loadMarketIndex,
  lookupMarketValue,
} from "./market-value";
import { analyzeDeal } from "./deal-analyzer";

const YEAR = 2018;
const row = (id: string, ask_price: number, extra: any = {}) => ({
  id,
  source_deal_id: `CC-${id}`,
  make: "Honda",
  model: "Accord",
  year: YEAR,
  trim: null,
  source: "cars_com",
  ask_price,
  condition: "used",
  damage_type: null,
  title: "2018 Honda Accord",
  mileage: 40000,
  // main's 7-day ask window (#166): comps must have been seen live recently.
  last_seen_at: new Date().toISOString(),
  auction_end_at: null,
  ...extra,
});

function client(rows: any[]) {
  return {
    from(table: string) {
      const q: any = {};
      for (const m of ["select", "eq", "gt", "lt", "gte", "order"])
        q[m] = () => q;
      q.range = async (from: number) =>
        table === "deals" && from === 0
          ? { data: rows, error: null }
          : { data: [], error: null };
      return q;
    },
  } as any;
}

beforeEach(__resetMarketIndexForTest);

describe("market-value exact self-exclusion", () => {
  it("removes the graded listing's own ask by deal id", async () => {
    await loadMarketIndex(
      client([
        row("self", 9000),
        row("b", 20000),
        row("c", 21000),
        row("d", 22000),
      ]),
    );
    const all = lookupMarketValue("Honda", "Accord", YEAR)!;
    expect(all.nRetail).toBe(4);
    const loo = lookupMarketValue("Honda", "Accord", YEAR, null, {
      id: "self",
    })!;
    expect(loo.nRetail).toBe(3);
    expect(loo.excludedSelf).toBe(1);
    expect(loo.selfChecked).toBe(true);
    expect(loo.retail).toBe(Math.round(21000 * 0.95));
  });

  it("matches by source + source_deal_id, case-insensitively", async () => {
    await loadMarketIndex(
      client([
        row("self", 9000),
        row("b", 20000),
        row("c", 21000),
        row("d", 22000),
      ]),
    );
    const loo = lookupMarketValue("Honda", "Accord", YEAR, null, {
      source: "CARS_COM",
      sourceDealId: "cc-self",
    })!;
    expect(loo.nRetail).toBe(3);
    expect(loo.excludedSelf).toBe(1);
  });

  it("a listing outside the pool is checked exactly and nothing is removed", async () => {
    await loadMarketIndex(
      client([row("b", 20000), row("c", 21000), row("d", 22000)]),
    );
    const r = lookupMarketValue("Honda", "Accord", YEAR, null, {
      id: "elsewhere",
    })!;
    expect(r.nRetail).toBe(3);
    expect(r.excludedSelf ?? 0).toBe(0);
    expect(r.selfChecked).toBe(true);
  });

  it("n < 3 after exclusion → no retail value (unknown), confidence none", async () => {
    await loadMarketIndex(
      client([row("self", 9000), row("b", 20000), row("c", 21000)]),
    );
    expect(lookupMarketValue("Honda", "Accord", YEAR)!.retail).not.toBeNull();
    const loo = lookupMarketValue("Honda", "Accord", YEAR, null, {
      id: "self",
    });
    expect(loo?.retail ?? null).toBeNull();
    expect(loo?.confidence ?? "none").toBe("none");
  });

  it("confidence never goes up when the excluded row was the outlier", async () => {
    // 6 widely spread asks: dispersion drops confidence to none. Removing the 5k outlier would
    // otherwise read as n=5 → "low"; exclusion may only lower confidence.
    const rows = [
      row("self", 5000),
      row("b", 6000),
      row("c", 15000),
      row("d", 20000),
      row("e", 30000),
      row("f", 31000),
    ];
    await loadMarketIndex(client(rows));
    expect(lookupMarketValue("Honda", "Accord", YEAR)!.confidence).toBe("none");
    const loo = lookupMarketValue("Honda", "Accord", YEAR, null, {
      id: "self",
    })!;
    expect(loo.nRetail).toBe(5);
    expect(loo.confidence).toBe("none");
  });

  it("excludes a wholesale-channel listing from the wholesale median", async () => {
    await loadMarketIndex(
      client([
        row("b", 20000),
        row("c", 21000),
        row("d", 22000),
        row("w1", 4000, { source: "copart" }),
        row("w2", 12000, { source: "copart" }),
        row("w3", 13000, { source: "copart" }),
      ]),
    );
    const all = lookupMarketValue("Honda", "Accord", YEAR)!;
    const loo = lookupMarketValue("Honda", "Accord", YEAR, null, { id: "w1" })!;
    expect(all.nWholesale).toBe(3);
    expect(loo.nWholesale).toBe(2);
    expect(loo.nRetail).toBe(3);
  });
});

describe("self-exclusion composes with main's ask-comp filters", () => {
  it("a stale row never enters the pool, so excluding it removes nothing", async () => {
    await loadMarketIndex(
      client([
        row("stale", 9000, {
          last_seen_at: new Date(Date.now() - 9 * 86400000).toISOString(),
        }),
        row("b", 20000),
        row("c", 21000),
        row("d", 22000),
      ]),
    );
    const r = lookupMarketValue("Honda", "Accord", YEAR, null, {
      id: "stale",
    })!;
    expect(r.nRetail).toBe(3);
    expect(r.excludedSelf ?? 0).toBe(0);
  });

  it("an independent_dealer clean row is a retail comp and is excluded exactly", async () => {
    await loadMarketIndex(
      client([
        row("self", 9000, { source: "independent_dealer", condition: "clean" }),
        row("b", 20000),
        row("c", 21000),
        row("d", 22000),
      ]),
    );
    expect(lookupMarketValue("Honda", "Accord", YEAR)!.nRetail).toBe(4);
    const r = lookupMarketValue("Honda", "Accord", YEAR, null, { id: "self" })!;
    expect(r.nRetail).toBe(3);
    expect(r.excludedSelf).toBe(1);
  });
});

describe("analyzeDeal uses exact exclusion", () => {
  const deal = (extra: any = {}) => ({
    make: "Honda",
    model: "Accord",
    year: YEAR,
    mileage: 40000,
    source: "cars_com",
    ask_price: 9000,
    condition: "used",
    title: "2018 Honda Accord",
    ...extra,
  });

  it("identified listing: exact leave-one-out, n<3 → no comp value", async () => {
    await loadMarketIndex(
      client([row("self", 9000), row("b", 20000), row("c", 21000)]),
    );
    const a = analyzeDeal(
      deal({ id: "self", source_deal_id: "CC-self" }) as any,
    );
    expect(a.valuation?.compExcludedSelf).toBe(1);
    expect(a.valuation?.cleanComp ?? null).toBeNull();
  });

  it("identified listing not in the pool: no approximate discount", async () => {
    await loadMarketIndex(
      client([row("b", 20000), row("c", 21000), row("d", 22000)]),
    );
    const a = analyzeDeal(deal({ id: "new-one" }) as any);
    expect(a.valuation?.compExcludedSelf).toBe(0);
    expect(a.valuation?.compCount).toBe(3);
  });

  it("unidentifiable listing still gets the approximate guard", async () => {
    await loadMarketIndex(
      client([
        row("b", 20000),
        row("c", 21000),
        row("d", 22000),
        row("e", 23000),
      ]),
    );
    const a = analyzeDeal(deal() as any);
    expect(a.valuation?.compExcludedSelf).toBe(1);
    expect(a.valuation?.compCount).toBe(3);
  });

  it("a supplied comp feed still prefers sold over ask", () => {
    const comps = [
      ...[15000, 15500, 16000].map((price, i) => ({
        price,
        kind: "sold" as const,
        id: `s${i}`,
      })),
      ...[20000, 21000, 22000].map((price, i) => ({
        price,
        kind: "ask" as const,
        id: `a${i}`,
      })),
    ];
    const a = analyzeDeal(deal({ id: "x" }) as any, { comps });
    expect(a.valuation?.compKind).toBe("sold");
  });
});
