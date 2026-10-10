import { describe, expect, it } from "vitest";
import type { CompObservation } from "@/lib/scoring/comps-aggregate";
import { transportCostForMiles } from "@/lib/geo";
import { marketLocalValue, regionalRatio } from "./market-local";

const c = (
  price: number,
  state: string,
  kind: "sold" | "ask" = "ask",
  extra: Partial<CompObservation> = {},
): CompObservation => ({ price, state, kind, ...extra });

const target = { id: "self" };
const MO = { state: "MO" };

describe("regionalRatio — only from our own comps", () => {
  it("state median / national median when n >= 3 on each side", () => {
    const comps = [
      c(9000, "MO"),
      c(9500, "MO"),
      c(10000, "MO"),
      c(11000, "TX"),
      c(12000, "TX"),
      c(13000, "CA"),
    ];
    const r = regionalRatio(target, comps, MO);
    // MO median 9500; national median of all 6 = (10000+11000)/2 = 10500
    expect(r.ratio).toBeCloseTo(0.905, 3);
    expect(r).toMatchObject({
      kind: "ask",
      nState: 3,
      nNational: 6,
      confidence: "low",
    });
  });

  it("no ratio with fewer than 3 same-state comps (no invented regional multiplier)", () => {
    const r = regionalRatio(
      target,
      [
        c(9000, "MO"),
        c(9500, "MO"),
        c(11000, "TX"),
        c(12000, "TX"),
        c(13000, "CA"),
      ],
      MO,
    );
    expect(r.ratio).toBeNull();
    expect(r.reason).toMatch(/no regional adjustment/);
  });

  it("no ratio without a buyer state", () => {
    expect(regionalRatio(target, [c(1, "MO")], null).ratio).toBeNull();
  });

  it("prefers sold over ask when sold qualifies on both sides, never mixes kinds", () => {
    const comps = [
      c(8000, "MO", "sold"),
      c(8000, "MO", "sold"),
      c(8000, "MO", "sold"),
      c(10000, "TX", "sold"),
      c(10000, "TX", "sold"),
      c(10000, "TX", "sold"),
      c(50000, "MO"),
      c(50000, "MO"),
      c(50000, "MO"),
    ];
    const r = regionalRatio(target, comps, MO);
    expect(r.kind).toBe("sold");
    expect(r.ratio).toBe(0.889); // 8000 / median(8000×3,10000×3)=9000
  });

  it("excludes the target itself and stale comps", () => {
    const now = Date.parse("2026-10-10T00:00:00Z");
    const old = "2026-01-01T00:00:00Z";
    const comps = [
      c(9000, "MO"),
      c(9000, "MO"),
      c(1, "MO", "ask", { id: "self" }),
      c(9000, "MO", "ask", { observedAt: old }),
      c(10000, "TX"),
    ];
    const r = regionalRatio(target, comps, MO, { now, maxAgeDays: 180 });
    expect(r.ratio).toBeNull();
    expect(r.nState).toBe(2);
  });

  it("resolves the state from a ZIP (resolveBuyerHome shape)", () => {
    const comps = [c(9000, "MO"), c(9000, "MO"), c(9000, "MO"), c(9000, "KS")];
    expect(regionalRatio(target, comps, { zip: "63101" }).state).toBe("MO");
  });
});

describe("marketLocalValue", () => {
  const ratio = regionalRatio(
    target,
    [
      c(9000, "MO"),
      c(9000, "MO"),
      c(9000, "MO"),
      c(11000, "TX"),
      c(11000, "TX"),
      c(11000, "TX"),
    ],
    MO,
  );

  it("applies the ratio only to national values", () => {
    const nat = marketLocalValue({
      value: 10000,
      valueScope: "national",
      ratio,
    });
    expect(nat.adjusted).toBe(true);
    expect(nat.value).toBe(Math.round(10000 * ratio.ratio!));
    const st = marketLocalValue({ value: 10000, valueScope: "state", ratio });
    expect(st).toMatchObject({ adjusted: false, value: 10000 });
  });

  it("no ratio → unchanged value and the reason in assumptions", () => {
    const none = regionalRatio(target, [], MO);
    const r = marketLocalValue({
      value: 10000,
      valueScope: "national",
      ratio: none,
    });
    expect(r).toMatchObject({ adjusted: false, value: 10000 });
    expect(r.assumptions.join(" ")).toMatch(/no regional adjustment/);
  });

  it("transport uses the haversine buyerDistance and the existing carrier rate", () => {
    const r = marketLocalValue({
      value: 10000,
      valueScope: "state",
      ratio,
      home: { lat: 38.627, lng: -90.199, state: "MO" },
      listing: { lat: 39.0997, lng: -94.5786, state: "MO" },
    });
    expect(r.distance.basis).toBe("coords");
    expect(r.transport).toBe(transportCostForMiles(r.distance.miles!));
    const unk = marketLocalValue({ value: 10000, valueScope: "state", ratio });
    expect(unk.transport).toBe(600);
  });

  it("null value stays null", () => {
    expect(
      marketLocalValue({ value: null, valueScope: "none", ratio }).value,
    ).toBeNull();
  });
});
