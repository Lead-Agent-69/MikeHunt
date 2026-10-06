import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SWEEP_SOURCES,
  TOS_RESTRICTED_SOURCES,
  optedInRestrictedSources,
  isAutomationAllowedSource,
  advanceSweep,
  claimBackoffMs,
  emptySweepState,
  loadSweepState,
  nextSweepStep,
  resolveScraperExecutionMode,
  resolveSweepIntervalMs,
  orderSourcesByTier,
  resolveSweepSources,
  saveSweepState,
  sourceTier,
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

  it("orders primary sources before secondary (terms-safe + opt-in)", () => {
    expect(sourceTier("curated_dealers")).toBe("primary");
    expect(sourceTier("gsa_auctions")).toBe("secondary");
    expect(orderSourcesByTier(["gsa_auctions", "curated_dealers", "independent_dealer"])).toEqual([
      "curated_dealers",
      "independent_dealer",
      "gsa_auctions",
    ]);
    // Opted-in restricted primaries still sort ahead of secondary.
    expect(resolveSweepSources("gsa_auctions,craigslist,curated_dealers")).toEqual([
      "craigslist",
      "curated_dealers",
      "gsa_auctions",
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

describe("automation allow-list for public preview routes", () => {
  it("blocks terms-restricted sources unless SCRAPE_SOURCES opts in", () => {
    expect(isAutomationAllowedSource("copart", "")).toBe(false);
    expect(isAutomationAllowedSource("publicsurplus", undefined)).toBe(false);
    expect(isAutomationAllowedSource("copart", "craigslist, copart")).toBe(
      true,
    );
    expect(isAutomationAllowedSource("gsa_auctions", "")).toBe(true);
    expect(isAutomationAllowedSource("govdeals", "")).toBe(false);
    expect(isAutomationAllowedSource("govdeals", "govdeals")).toBe(true);
    expect(isAutomationAllowedSource("allsurplus", "")).toBe(false);
    expect(isAutomationAllowedSource("carparts_com", undefined)).toBe(false);
    expect(isAutomationAllowedSource("municibid", "")).toBe(false);
    expect(isAutomationAllowedSource("offerup", undefined)).toBe(false);
    expect(isAutomationAllowedSource("municibid", "municibid")).toBe(true);
  });

  it("keeps municibid and offerup out of the default sweep", () => {
    expect(TOS_RESTRICTED_SOURCES.municibid).toMatch(/automated/);
    expect(TOS_RESTRICTED_SOURCES.offerup).toMatch(/automated/);
    expect(resolveSweepSources("")).not.toContain("municibid");
    expect(resolveSweepSources("")).not.toContain("offerup");
  });

  it("keeps Liquidity Services sites (govdeals, allsurplus) and carparts_com out of the default sweep", () => {
    expect(TOS_RESTRICTED_SOURCES.govdeals).toMatch(/spiders|robots/);
    expect(TOS_RESTRICTED_SOURCES.allsurplus).toMatch(/spiders|robots/);
    expect(TOS_RESTRICTED_SOURCES.carparts_com).toMatch(/automated|scrap/);
    expect(resolveSweepSources("")).not.toContain("govdeals");
    expect(resolveSweepSources("")).toEqual([
      "curated_dealers",
      "independent_dealer",
      "gsa_auctions",
    ]);
  });
});
