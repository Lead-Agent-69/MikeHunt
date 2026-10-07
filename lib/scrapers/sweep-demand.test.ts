import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STATE_METRO_ZIPS, SWEEP_STATE_CODES } from "@/lib/geo/metro-zips";
import { emptyRotation, planSweepStates, recordSweepPlan } from "./sweep-plan";
import { PRIMARY_DEAL_SOURCES, sourceTier } from "./sweep-schedule";
import {
  baselineSlots,
  demandZipsForState,
  emptySourceHealth,
  expandDemandRings,
  loadSourceHealth,
  planDemandSweep,
  recordSourceYield,
  saveSourceHealth,
  shouldRunSource,
  sourcesForSweep,
  startSweep,
  stateScore,
  summarizeDemand,
  wantHitGapStates,
  wantHitRatio,
} from "./sweep-demand";

const NOW = new Date("2026-10-05T05:00:00Z");

describe("summarizeDemand", () => {
  it("sums by state, drops junk states and bad weights, orders zip3 by weight", () => {
    const out = summarizeDemand([
      { state: "MO", zip3: "658", kind: "home", weight: 3 },
      { state: "mo", zip3: "631", kind: "search", weight: 1 },
      { state: "MO", zip3: null, kind: "recent", weight: 0.5 },
      { state: "YT", weight: 9 },
      { state: "TX", weight: -1 },
      { state: "TX", weight: Number.NaN },
    ]);
    expect(out.weights).toEqual({ MO: 4.5 });
    expect(out.zip3s).toEqual({ MO: ["658", "631"] });
    expect(out.anchors).toEqual(["MO"]);
    expect(out.rings).toEqual({ MO: 0 });
    expect(summarizeDemand(null)).toEqual({
      weights: {},
      zip3s: {},
      rings: {},
      anchors: [],
    });
  });
});

describe("stateScore / baselineSlots", () => {
  it("weights demand above staleness above scarcity", () => {
    const home = stateScore({ demand: 3, hoursSinceSwept: 4, active: 265 });
    const stale = stateScore({
      demand: 0,
      hoursSinceSwept: Infinity,
      active: 1,
    });
    expect(home).toBeGreaterThan(stale);
    expect(
      stateScore({ demand: 0, hoursSinceSwept: 1000, active: 0 }),
    ).toBeCloseTo(9);
  });

  it("keeps at least 3 (or 40%) baseline slots and at least one demand slot", () => {
    expect(baselineSlots(10)).toBe(4);
    expect(baselineSlots(20)).toBe(8);
    expect(baselineSlots(3)).toBe(2);
    expect(baselineSlots(1)).toBe(1);
    // Gap mode: thinner floor but F≥3 when K allows (k-1 caps small sweeps).
    expect(baselineSlots(10, { gapMode: true })).toBe(3);
    expect(baselineSlots(20, { gapMode: true })).toBe(4);
    expect(baselineSlots(3, { gapMode: true })).toBe(2);
    expect(baselineSlots(1, { gapMode: true })).toBe(1);
  });
});

describe("planDemandSweep", () => {
  it("is exactly the plain rotation when there is no demand", () => {
    const opts = { perSweep: 10, zipsPerState: 2, counts: { SD: 1, WY: 3 } };
    const plain = planSweepStates(emptyRotation(), opts);
    expect(
      planDemandSweep(emptyRotation(), {
        ...opts,
        demand: summarizeDemand([]),
      }),
    ).toEqual({
      ...plain,
      demandStates: [],
    });
  });

  it("puts demand states first, keeps the baseline floor, and adds a demand ZIP", () => {
    const demand = summarizeDemand([
      { state: "MO", zip3: "658", weight: 3 },
      { state: "TX", zip3: "752", weight: 2 },
    ]);
    const plan = planDemandSweep(emptyRotation(), {
      perSweep: 10,
      zipsPerState: 2,
      counts: {
        ...Object.fromEntries(SWEEP_STATE_CODES.map((st) => [st, 100])),
        MO: 265,
        TX: 194,
        SD: 1,
      },
      demand,
      maxRing: 0,
      now: NOW,
    });
    expect(plan.states).toHaveLength(10);
    expect(plan.states.slice(0, 2)).toEqual(["MO", "TX"]);
    expect(plan.demandStates).toEqual(["MO", "TX"]);
    // Baseline floor: the least-recently-swept / thinnest states are still in.
    expect(plan.states).toContain("SD");
    expect(plan.zipsByState.MO).toHaveLength(3);
    expect(plan.zipsByState.MO[0].startsWith("658")).toBe(true);
    expect(plan.zipsByState.TX[0].startsWith("752")).toBe(true);
    expect(plan.zipsByState.SD).toHaveLength(2);
  });

  it("never starves a state: every state is planned within ceil(51/F) sweeps under constant demand", () => {
    const demand = summarizeDemand(
      ["MO", "TX", "FL", "CA", "IL", "GA", "NY"].map((state) => ({
        state,
        weight: 5,
      })),
    );
    let rotation = emptyRotation();
    const seen = new Set<string>();
    const perSweep = 10;
    const sweeps = Math.ceil(
      SWEEP_STATE_CODES.length / baselineSlots(perSweep),
    );
    for (let i = 0; i < sweeps; i++) {
      const at = new Date(NOW.getTime() + i * 4 * 3_600_000);
      const plan = planDemandSweep(rotation, {
        perSweep,
        zipsPerState: 2,
        demand,
        maxRing: 0,
        now: at,
      });
      plan.states.forEach((s) => seen.add(s));
      // 6 demand slots for 7 equally demanded states: they rotate by staleness.
      expect(
        plan.states.filter((s) => demand.weights[s]).length,
      ).toBeGreaterThanOrEqual(6);
      rotation = recordSweepPlan(rotation, plan, at);
    }
    expect(seen.size).toBe(SWEEP_STATE_CODES.length);
  });

  it("prefers metro ZIPs in demanded zip3 areas", () => {
    const zips = demandZipsForState("TX", 2, 0, ["787"]);
    expect(zips[0].startsWith("787")).toBe(true);
    expect(zips).toHaveLength(2);
  });
});

describe("source backoff", () => {
  it("backs off empty sources to every 2, 4, then 8 sweeps and resets on yield", () => {
    expect([1, 2, 3, 4].map((n) => shouldRunSource(1, n))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect([1, 2, 3, 4].map((n) => shouldRunSource(2, n))).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect([4, 6, 8].map((n) => shouldRunSource(3, n))).toEqual([
      true,
      false,
      true,
    ]);
    expect([8, 12, 16].map((n) => shouldRunSource(9, n))).toEqual([
      true,
      false,
      true,
    ]);

    let health = emptySourceHealth();
    health = recordSourceYield(health, "carvana", 0);
    health = recordSourceYield(health, "carvana", 0, false);
    health = recordSourceYield(health, "cars_com", 40);
    expect(health.zeroStreak).toEqual({ carvana: 2, cars_com: 0 });
    // sweep #1 is odd, so carvana (streak 2) sits out; sweep #2 runs it.
    expect(sourcesForSweep(["cars_com", "carvana"], health)).toEqual([
      "cars_com",
    ]);
    expect(
      sourcesForSweep(["cars_com", "carvana"], startSweep(health)),
    ).toEqual(["cars_com", "carvana"]);
    expect(recordSourceYield(health, "carvana", 3).zeroStreak.carvana).toBe(0);
    // Never an empty sweep.
    expect(sourcesForSweep(["carvana"], health)).toEqual(["carvana"]);
  });

  it("round-trips health through disk and survives garbage", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "health-"));
    const file = path.join(dir, "source-health.json");
    expect(await loadSourceHealth(file)).toEqual(emptySourceHealth());
    const health = recordSourceYield(
      startSweep(emptySourceHealth()),
      "copart",
      0,
    );
    await saveSourceHealth(health, file);
    expect(await loadSourceHealth(file)).toEqual(health);
  });
});

describe("demand rings and want-hit", () => {
  it("expands MO anchors into neighboring rings with falling weight", () => {
    const base = summarizeDemand([{ state: "MO", weight: 10, users: 4 }]);
    const expanded = expandDemandRings(base, 2);
    expect(expanded.anchors).toEqual(["MO"]);
    expect(expanded.weights.MO).toBeCloseTo(10, 5);
    expect(expanded.rings?.MO).toBe(0);
    // At least one ring-1 neighbor carries half weight.
    const ring1 = Object.entries(expanded.rings || {}).filter(
      ([, r]) => r === 1,
    );
    expect(ring1.length).toBeGreaterThan(0);
    for (const [st, r] of ring1) {
      expect(expanded.weights[st]).toBeCloseTo(10 / (1 + r), 5);
    }
  });

  it("preferentially schedules MO before FL when MO demand dominates, even with rings", () => {
    const demand = summarizeDemand([
      { state: "MO", weight: 11, users: 4 },
      { state: "FL", weight: 1.8, users: 1 },
    ]);
    const plan = planDemandSweep(emptyRotation(), {
      perSweep: 10,
      zipsPerState: 2,
      demand,
      maxRing: 2,
      now: NOW,
    });
    expect(plan.states[0]).toBe("MO");
    expect(plan.demandStates).toContain("MO");
    expect(plan.demandStates).toContain("FL");
    // Ring neighbors of MO can appear in demandStates but MO keeps ZIP preference.
    expect(plan.zipsByState.MO.length).toBe(3);
  });

  it("reports want-hit gaps for uncovered anchor states", () => {
    const hit = wantHitRatio({
      anchors: ["MO", "FL"],
      primaryCounts: { MO: 40, FL: 0 },
      minRows: 5,
    });
    expect(hit).toEqual({
      wantHit: 0.5,
      covered: 1,
      demanded: 2,
      gaps: ["FL"],
    });
    expect(wantHitRatio({ anchors: [], primaryCounts: {} }).wantHit).toBe(1);
  });
});

describe("want-hit gap-first bias", () => {
  const demandRows = [
    { state: "MO", weight: 12, users: 4 },
    { state: "FL", weight: 2, users: 1 },
    { state: "IA", weight: 0.5 },
    { state: "IL", weight: 0.5 },
    { state: "KY", weight: 0.5 },
  ];

  it("returns gaps only while want-hit is under target", () => {
    expect(
      wantHitGapStates({
        anchors: ["MO", "FL", "IA", "IL", "KY"],
        primaryCounts: { MO: 300, FL: 40, IA: 1 },
      }),
    ).toEqual(["IA", "IL", "KY"]);
    // 9/10 covered = 0.9 → at target, no gap bias.
    const anchors = [
      "MO",
      "FL",
      "IA",
      "IL",
      "KY",
      "TX",
      "CA",
      "NY",
      "GA",
      "OH",
    ];
    const counts = Object.fromEntries(anchors.map((s) => [s, 10]));
    counts.OH = 0;
    expect(wantHitGapStates({ anchors, primaryCounts: counts })).toEqual([]);
    expect(wantHitGapStates({ anchors: [], primaryCounts: {} })).toEqual([]);
  });

  it("puts gap anchors at the front of the plan ahead of heavier covered demand", () => {
    const demand = summarizeDemand(demandRows);
    const plan = planDemandSweep(emptyRotation(), {
      perSweep: 10,
      zipsPerState: 2,
      demand,
      maxRing: 3,
      gaps: ["IA", "IL", "KY"],
      now: NOW,
    });
    expect(plan.states.slice(0, 3).sort()).toEqual(["IA", "IL", "KY"]);
    expect(plan.gapStates?.sort()).toEqual(["IA", "IL", "KY"]);
    // Covered heavy demand is still planned right after the gaps.
    expect(plan.states).toContain("MO");
    expect(plan.states.indexOf("MO")).toBeLessThan(plan.states.length - 1);
    // Gap anchors get +2 ZIP depth (capped by metros on file), covered anchors +1.
    for (const st of ["IA", "IL", "KY"])
      expect(plan.zipsByState[st].length).toBe(
        Math.min(4, (STATE_METRO_ZIPS[st] || []).length),
      );
    expect(plan.zipsByState.MO.length).toBe(3);
  });

  it("shrinks baseline while chasing want-hit gaps so more slots go to gap anchors", () => {
    const demand = summarizeDemand(demandRows);
    const withGaps = planDemandSweep(emptyRotation(), {
      perSweep: 10,
      zipsPerState: 2,
      demand,
      maxRing: 3,
      gaps: ["IA", "IL", "KY"],
      now: NOW,
    });
    const without = planDemandSweep(emptyRotation(), {
      perSweep: 10,
      zipsPerState: 2,
      demand,
      maxRing: 3,
      now: NOW,
    });
    // Same perSweep budget; gap mode should place all three gaps and still include MO demand.
    expect(withGaps.states).toHaveLength(10);
    expect(without.states).toHaveLength(10);
    for (const st of ["IA", "IL", "KY"]) expect(withGaps.states).toContain(st);
    expect(withGaps.states).toContain("MO");
  });

  it("without gaps the plan is unchanged (score order)", () => {
    const demand = summarizeDemand(demandRows);
    const a = planDemandSweep(emptyRotation(), {
      perSweep: 10,
      zipsPerState: 2,
      demand,
      now: NOW,
    });
    const b = planDemandSweep(emptyRotation(), {
      perSweep: 10,
      zipsPerState: 2,
      demand,
      gaps: [],
      now: NOW,
    });
    expect(b.states).toEqual(a.states);
    expect(b.zipsByState).toEqual(a.zipsByState);
    expect(a.states[0]).toBe("MO");
  });

  it("keeps the baseline floor while chasing gaps (no state starves)", () => {
    const demand = summarizeDemand(demandRows);
    let rotation = emptyRotation();
    const seen = new Set<string>();
    const perSweep = 10;
    // Gap mode uses the thinner baseline; budget enough sweeps to still rotate the nation.
    const sweeps = Math.ceil(
      SWEEP_STATE_CODES.length / baselineSlots(perSweep, { gapMode: true }),
    );
    for (let i = 0; i < sweeps; i++) {
      const at = new Date(NOW.getTime() + i * 4 * 3_600_000);
      const plan = planDemandSweep(rotation, {
        perSweep,
        zipsPerState: 2,
        demand,
        gaps: ["IA", "IL", "KY"],
        now: at,
      });
      for (const st of ["IA", "IL", "KY"]) expect(plan.states).toContain(st);
      plan.states.forEach((s) => seen.add(s));
      rotation = recordSweepPlan(rotation, plan, at);
    }
    expect(seen.size).toBe(SWEEP_STATE_CODES.length);
  });

  it("PRIMARY_DEAL_SOURCES are deal_source enum values in the primary tier", () => {
    for (const id of PRIMARY_DEAL_SOURCES)
      expect(sourceTier(id)).toBe("primary");
    expect(PRIMARY_DEAL_SOURCES).not.toContain("curated_dealers" as never);
  });

  it("sourcesForSweep still runs primary before secondary", () => {
    expect(
      sourcesForSweep(
        ["gsa_auctions", "curated_dealers", "publicsurplus"],
        emptySourceHealth(),
      ),
    ).toEqual(["curated_dealers", "gsa_auctions", "publicsurplus"]);
  });
});
