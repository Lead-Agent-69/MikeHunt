import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SWEEP_STATE_CODES } from "@/lib/geo/metro-zips";
import {
  emptyRotation,
  getSweepPlan,
  loadRotation,
  planSweepStates,
  recordSweepPlan,
  resolveSweepStatesPerRun,
  resolveSweepZipsPerState,
  saveRotation,
  sweepPlanZips,
  withSweepPlan,
} from "./sweep-plan";
import { craigslistSitesForRun } from "./sources/index";
import { autotempestRegionalZips } from "./sources/autotempest";

describe("planSweepStates", () => {
  it("starts with the thinnest states when nothing was swept yet", () => {
    const plan = planSweepStates(emptyRotation(), {
      perSweep: 3,
      zipsPerState: 1,
      counts: { FL: 270, MO: 265, SD: 1, WY: 3, RI: 2, TX: 194 },
      states: ["FL", "MO", "SD", "WY", "RI", "TX"],
    });
    expect(plan.states).toEqual(["SD", "RI", "WY"]);
    expect(plan.zipsByState.SD).toEqual(["57104"]);
  });

  it("never starves a state: every state is planned within ceil(N/K) sweeps", () => {
    let rotation = emptyRotation();
    const seen = new Set<string>();
    const perSweep = 10;
    const sweeps = Math.ceil(SWEEP_STATE_CODES.length / perSweep);
    // Skewed counts must not keep big states out forever.
    const counts = { FL: 100000, TX: 90000, CA: 80000 };
    for (let i = 0; i < sweeps; i++) {
      const plan = planSweepStates(rotation, {
        perSweep,
        zipsPerState: 2,
        counts,
      });
      plan.states.forEach((s) => seen.add(s));
      rotation = recordSweepPlan(
        rotation,
        plan,
        new Date(Date.UTC(2026, 9, 5, i)),
      );
    }
    expect(seen.size).toBe(SWEEP_STATE_CODES.length);
  });

  it("rotates metro ZIPs inside a state across sweeps", () => {
    let rotation = emptyRotation();
    const zips: string[][] = [];
    for (let i = 0; i < 3; i++) {
      const plan = planSweepStates(rotation, {
        perSweep: 1,
        zipsPerState: 2,
        states: ["TX"],
      });
      zips.push(plan.zipsByState.TX);
      rotation = recordSweepPlan(
        rotation,
        plan,
        new Date(Date.UTC(2026, 9, 5, i)),
      );
    }
    expect(zips).toEqual([
      ["75201", "77002"],
      ["78205", "78701"],
      ["79901", "79401"],
    ]);
  });
});

describe("sweep plan context", () => {
  const plan = {
    states: ["SD", "TX"],
    zipsByState: { SD: ["57104", "57701"], TX: ["75201", "77002"] },
  };

  it("is only visible inside withSweepPlan", async () => {
    expect(getSweepPlan()).toBeUndefined();
    await withSweepPlan(plan, async () => {
      expect(getSweepPlan()?.states).toEqual(["SD", "TX"]);
    });
    expect(getSweepPlan()).toBeUndefined();
  });

  it("lists planned ZIPs, optionally one per state", () => {
    expect(sweepPlanZips(plan)).toEqual(["57104", "57701", "75201", "77002"]);
    expect(sweepPlanZips(plan, 1)).toEqual(["57104", "75201"]);
    expect(sweepPlanZips(undefined)).toEqual([]);
  });

  it("points AutoTempest's regional pass at the planned metros", () => {
    expect(autotempestRegionalZips(plan)).toEqual([
      "57104",
      "57701",
      "75201",
      "77002",
    ]);
    expect(autotempestRegionalZips(undefined, () => 0)).toHaveLength(12);
  });

  it("limits Craigslist to sites in the planned states", () => {
    const sites = craigslistSitesForRun(plan, undefined);
    expect(sites.length).toBeGreaterThan(0);
    expect(sites).toContain("dallas");
    expect(sites).not.toContain("chicago");
  });
});

describe("rotation settings and file", () => {
  it("defaults to 10 states and 2 ZIPs per state", () => {
    expect(resolveSweepStatesPerRun(undefined)).toBe(10);
    expect(resolveSweepStatesPerRun("500")).toBe(51);
    expect(resolveSweepZipsPerState(undefined)).toBe(2);
    expect(resolveSweepZipsPerState("3")).toBe(3);
  });

  it("round-trips and tolerates a missing file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "rotation-"));
    const file = path.join(dir, "state-rotation.json");
    expect(await loadRotation(file)).toEqual(emptyRotation());
    const rotation = recordSweepPlan(
      emptyRotation(),
      { states: ["SD"], zipsByState: { SD: ["57104"] } },
      new Date("2026-10-05T00:00:00Z"),
    );
    await saveRotation(rotation, file);
    expect(await loadRotation(file)).toEqual(rotation);
  });
});
