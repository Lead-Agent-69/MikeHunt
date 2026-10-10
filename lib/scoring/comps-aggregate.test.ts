import { describe, expect, it } from "vitest";
import { aggregateComps, type CompObservation } from "./comps-aggregate";

const ask = (
  price: number,
  state: string,
  extra: Partial<CompObservation> = {},
) => ({ price, state, kind: "ask", ...extra }) as CompObservation;
const sold = (
  price: number,
  state: string,
  extra: Partial<CompObservation> = {},
) => ({ price, state, kind: "sold", ...extra }) as CompObservation;

describe("aggregateComps", () => {
  it("uses same-state comps when that state has n >= 3", () => {
    const comps = [
      ask(20000, "MO"),
      ask(21000, "MO"),
      ask(22000, "MO"),
      ask(40000, "CA"),
      ask(41000, "CA"),
    ];
    const a = aggregateComps({ state: "MO" }, comps);
    expect(a).toMatchObject({ scope: "state", kind: "ask", n: 3, state: "MO" });
    expect(a.value).toBe(Math.round(21000 * 0.95));
  });

  it("falls back to national when the home state is thin", () => {
    const comps = [
      ask(20000, "MO"),
      ask(30000, "CA"),
      ask(32000, "TX"),
      ask(34000, "FL"),
    ];
    const a = aggregateComps({ state: "MO" }, comps);
    expect(a).toMatchObject({ scope: "national", n: 4 });
    expect(a.value).toBe(Math.round(31000 * 0.95));
  });

  it("prefers completed sales over asks and does not haircut them", () => {
    const comps = [
      sold(18000, "TX"),
      sold(19000, "CA"),
      sold(20000, "FL"),
      ask(25000, "MO"),
      ask(25000, "MO"),
      ask(25000, "MO"),
    ];
    const a = aggregateComps({ state: "MO" }, comps);
    expect(a).toMatchObject({ kind: "sold", scope: "national", value: 19000 });
  });

  it("never counts the target listing as its own comp", () => {
    const comps = [
      ask(9000, "MO", { id: "self" }),
      ask(20000, "MO"),
      ask(21000, "MO"),
    ];
    const a = aggregateComps({ id: "self", state: "MO" }, comps);
    expect(a.excludedSelf).toBe(1);
    // Two other comps is not a market: no value rather than a fake discount.
    expect(a).toMatchObject({ value: null, scope: "none", confidence: "none" });
    const bySourceId = aggregateComps(
      { source: "cars_com", sourceDealId: "abc", state: "MO" },
      [
        ask(9000, "MO", { source: "Cars_Com", sourceDealId: "ABC" }),
        ask(20000, "MO"),
        ask(21000, "MO"),
        ask(22000, "MO"),
      ],
    );
    expect(bySourceId.excludedSelf).toBe(1);
    expect(bySourceId.n).toBe(3);
  });

  it("drops stale rows and junk prices", () => {
    const now = Date.parse("2026-10-09T00:00:00Z");
    const comps = [
      ask(20000, "MO", { observedAt: "2026-10-08T00:00:00Z" }),
      ask(21000, "MO", { observedAt: "2026-10-07T00:00:00Z" }),
      ask(22000, "MO", { observedAt: "2026-01-01T00:00:00Z" }),
      ask(0, "MO"),
      { price: 5000, state: "MO", kind: "lease" } as unknown as CompObservation,
    ];
    const a = aggregateComps({ state: "MO" }, comps, { maxAgeDays: 30, now });
    expect(a.excludedStale).toBe(1);
    expect(a.value).toBeNull();
  });

  it("reports sample confidence and comp mileage", () => {
    const comps = Array.from({ length: 12 }, (_, i) =>
      ask(20000 + i * 100, "MO", { mileage: 50000 + i * 1000 }),
    );
    const a = aggregateComps({ state: "MO" }, comps);
    expect(a.confidence).toBe("high");
    expect(a.mileageMed).toBe(55500);
  });
});
