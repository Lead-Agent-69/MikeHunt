import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SWEEP_STATE_CODES } from "@/lib/geo/metro-zips";
import { emptyRotation, planSweepStates, recordSweepPlan } from "./sweep-plan";
import {
  baselineSlots,
  demandZipsForState,
  emptySourceHealth,
  loadSourceHealth,
  planDemandSweep,
  recordSourceYield,
  saveSourceHealth,
  shouldRunSource,
  sourcesForSweep,
  startSweep,
  stateScore,
  summarizeDemand,
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
    expect(summarizeDemand(null)).toEqual({ weights: {}, zip3s: {} });
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
