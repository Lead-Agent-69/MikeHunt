import { describe, expect, it } from "vitest";
import { scopedWorkerIdleState } from "./job-queue";
import { readFileSync } from "node:fs";

describe("scoped worker quota pause", () => {
  it("distinguishes a live idle worker from a quota-blocked or manually paused worker", () => {
    expect(scopedWorkerIdleState(false, false)).toBe("running");
    expect(scopedWorkerIdleState(false, true)).toBe("quota_paused");
    expect(scopedWorkerIdleState(true, false)).toBe("paused");
    expect(scopedWorkerIdleState(true, true)).toBe("paused");
  });
  it("checks write capacity before claiming another buyer job without changing quota limits", () => {
    const source = readFileSync("scripts/scrape-local.ts", "utf8");
    const loop = source.slice(
      source.indexOf("async function runQueuedJobLoop"),
    );
    expect(loop.indexOf("if (quotaReached())")).toBeLessThan(
      loop.indexOf("job = await claimNextScopedScrapeJob"),
    );
    expect(loop).toContain("scopedWorkerIdleState(manualPaused, true)");
    expect(source).toContain("Math.floor(q.maxInserts * 0.8)");
    expect(source).toContain("Math.floor(q.maxUpdates * 0.8)");
  });
});
