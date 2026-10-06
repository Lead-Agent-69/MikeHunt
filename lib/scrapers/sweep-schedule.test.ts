import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SWEEP_SOURCES,
  TOS_RESTRICTED_SOURCES,
  optedInRestrictedSources,
  advanceSweep,
  claimBackoffMs,
  emptySweepState,
  loadSweepState,
  nextSweepStep,
  resolveScraperExecutionMode,
  resolveSweepIntervalMs,
  resolveSweepSources,
  saveSweepState,
} from "./sweep-schedule";

const HOUR = 60 * 60 * 1000;

describe("scraper execution mode", () => {
  it("knows queue, hybrid, and the direct default", () => {
    expect(resolveScraperExecutionMode("queue")).toBe("queue");
    expect(resolveScraperExecutionMode(" Hybrid ")).toBe("hybrid");
    expect(resolveScraperExecutionMode(undefined)).toBe("direct");
    expect(resolveScraperExecutionMode("bogus")).toBe("direct");
  });
});

describe("sweep sources and cadence", () => {
  it("defaults to the free sweep set minus ToS-restricted sources, and honors SCRAPE_SOURCES", () => {
    const defaults = resolveSweepSources(undefined);
    expect(defaults).toEqual(
      DEFAULT_SWEEP_SOURCES.filter((id) => !TOS_RESTRICTED_SOURCES[id]),
    );
    expect(defaults).toEqual(
      expect.arrayContaining(["curated_dealers", "gsa_auctions"]),
    );
    for (const id of ["cars_com", "craigslist", "copart", "autotempest"])
      expect(defaults).not.toContain(id);
    expect(optedInRestrictedSources(["copart", "gsa_auctions"])).toEqual([
      "copart",
    ]);
    expect(resolveSweepSources("cars_com, autotrader,cars_com")).toEqual([
      "cars_com",
      "autotrader",
    ]);
  });

  it("defaults to 4h and never goes under 1h", () => {
    expect(resolveSweepIntervalMs(undefined)).toBe(4 * HOUR);
    expect(resolveSweepIntervalMs("0.1")).toBe(1 * HOUR);
    expect(resolveSweepIntervalMs("6")).toBe(6 * HOUR);
    expect(resolveSweepIntervalMs("nope")).toBe(4 * HOUR);
  });
});

describe("nextSweepStep", () => {
  const now = new Date("2026-10-05T12:00:00Z");

  it("starts a sweep right away when none ever ran", () => {
    const step = nextSweepStep(emptySweepState(), ["a", "b"], 4 * HOUR, now);
    expect(step.kind).toBe("run");
    if (step.kind !== "run") return;
    expect(step.source).toBe("a");
    expect(step.state.startedAt).toBe(now.toISOString());
  });

  it("stays idle until the interval after the last sweep has passed", () => {
    const prior = {
      ...emptySweepState(),
      lastCompletedAt: new Date(now.getTime() - 1 * HOUR).toISOString(),
    };
    const step = nextSweepStep(prior, ["a"], 4 * HOUR, now);
    expect(step).toEqual({
      kind: "idle",
      nextAt: new Date(now.getTime() + 3 * HOUR).toISOString(),
    });
    const due = nextSweepStep(
      prior,
      ["a"],
      4 * HOUR,
      new Date(now.getTime() + 3 * HOUR),
    );
    expect(due.kind).toBe("run");
  });

  it("resumes an in-progress sweep where it stopped", () => {
    const prior = {
      version: 1 as const,
      startedAt: now.toISOString(),
      sources: ["a", "b", "c"],
      index: 2,
    };
    const step = nextSweepStep(prior, ["x"], 4 * HOUR, now);
    expect(step.kind === "run" && step.source).toBe("c");
  });

  it("walks every source once, then records completion", () => {
    let step = nextSweepStep(emptySweepState(), ["a", "b"], HOUR, now);
    const ran: string[] = [];
    while (step.kind === "run") {
      ran.push(step.source);
      const next = advanceSweep(step.state, now);
      step = nextSweepStep(next, ["a", "b"], HOUR, now);
      if (!next.startedAt) {
        expect(next.lastCompletedAt).toBe(now.toISOString());
        break;
      }
    }
    expect(ran).toEqual(["a", "b"]);
  });
});

describe("claim backoff", () => {
  it("doubles from 5s and caps at 5 minutes", () => {
    expect(claimBackoffMs(1)).toBe(5_000);
    expect(claimBackoffMs(2)).toBe(10_000);
    expect(claimBackoffMs(4)).toBe(40_000);
    expect(claimBackoffMs(50)).toBe(300_000);
  });
});

describe("sweep state file", () => {
  it("round-trips and tolerates a missing file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sweep-"));
    const file = path.join(dir, "sweep-state.json");
    expect(await loadSweepState(file)).toEqual(emptySweepState());
    const state = {
      version: 1 as const,
      startedAt: "2026-10-05T00:00:00.000Z",
      sources: ["a", "b"],
      index: 1,
    };
    await saveSweepState(state, file);
    expect(await loadSweepState(file)).toEqual(state);
  });
});
