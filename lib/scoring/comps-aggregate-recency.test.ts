import { describe, expect, it } from "vitest";
import { aggregateComps, type CompObservation } from "./comps-aggregate";

const NOW = Date.parse("2026-10-10T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const sold = (
  price: number,
  age: number | null,
  state = "MO",
): CompObservation => ({
  price,
  kind: "sold",
  state,
  observedAt: age == null ? null : daysAgo(age),
});

// Deterministic pseudo-random comps for a no-regression sweep.
function lcg(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
}
function randomComps(seed: number): CompObservation[] {
  const r = lcg(seed);
  const n = Math.floor(r() * 15);
  return Array.from({ length: n }, () => ({
    price: Math.round(5000 + r() * 20000),
    kind: r() < 0.4 ? "sold" : "ask",
    state: ["MO", "KS", "TX", null][Math.floor(r() * 4)],
    observedAt: r() < 0.8 ? daysAgo(Math.floor(r() * 200)) : null,
    mileage: Math.round(r() * 150000),
  })) as CompObservation[];
}

describe("aggregateComps recency option", () => {
  it("default off: output identical to no option (and no recency key)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const comps = randomComps(seed);
      const t = { state: "MO" };
      const a = aggregateComps(t, comps, { now: NOW, maxAgeDays: 180 });
      const b = aggregateComps(t, comps, {
        now: NOW,
        maxAgeDays: 180,
        recency: null,
      });
      expect(b).toEqual(a);
      expect("recency" in a).toBe(false);
    }
  });

  it("a very long half-life with no adjustment reproduces the plain median (equal weights)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const comps = randomComps(seed);
      const a = aggregateComps({ state: "MO" }, comps, { now: NOW });
      const b = aggregateComps({ state: "MO" }, comps, {
        now: NOW,
        // Undated comps weigh like a half-life-old comp by default; neutralise that here.
        recency: { halfLifeDays: 1e12, undatedAgeDays: 0 },
      });
      expect(b.value).toBe(a.value);
      expect(b.n).toBe(a.n);
      expect(b.scope).toBe(a.scope);
      expect(b.kind).toBe(a.kind);
      expect(b.confidence).toBe(a.confidence);
    }
  });

  it("undated comps count at half weight by default", () => {
    const comps = [
      sold(10000, null),
      sold(10000, null),
      sold(14000, 0),
      sold(14000, 0),
      sold(12000, 0),
    ];
    const w = aggregateComps({ state: "MO" }, comps, {
      now: NOW,
      recency: { halfLifeDays: 1e12 },
    });
    // weights 0.5,0.5 | 1 | 1,1 → cumulative hits half (2) at 12000 → (12000+14000)/2; plain median is 12000.
    expect(w.value).toBe(13000);
  });

  it("recent comps dominate; tier choice and n still count raw rows", () => {
    const comps = [
      sold(10000, 170),
      sold(10000, 160),
      sold(14000, 5),
      sold(14000, 3),
      sold(10000, 150),
    ];
    const plain = aggregateComps({ state: "MO" }, comps, { now: NOW });
    expect(plain.value).toBe(10000);
    const w = aggregateComps({ state: "MO" }, comps, {
      now: NOW,
      recency: { halfLifeDays: 30 },
    });
    expect(w.value).toBe(14000);
    expect(w.n).toBe(5);
    expect(w.recency).toMatchObject({
      halfLifeDays: 30,
      unweightedValue: 10000,
    });
    expect(w.recency!.effectiveN).toBeLessThan(5);
  });

  it("depreciation brings old comps down to today; ask haircut still applies", () => {
    const comps: CompObservation[] = [100, 100, 100].map((age) => ({
      price: 10000,
      kind: "ask",
      observedAt: daysAgo(age),
    }));
    const r = aggregateComps({}, comps, {
      now: NOW,
      recency: { halfLifeDays: 90, depreciationPerMonth: 0.01 },
    });
    const months = 100 / 30.4375;
    expect(r.value).toBe(Math.round(10000 * 0.99 ** months * 0.95));
    expect(r.recency!.unweightedValue).toBe(9500);
  });
});
