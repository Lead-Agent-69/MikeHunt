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
  it("reserves insert capacity for buyer jobs while allowing marked refreshes to use touch capacity", () => {
    const source = readFileSync("scripts/scrape-local.ts", "utf8");
    const loop = source.slice(
      source.indexOf("async function runQueuedJobLoop"),
    );
    expect(loop.indexOf("if (quotaReached())")).toBeLessThan(
      loop.indexOf("await claimNextScopedScrapeJob"),
    );
    expect(loop).toContain("scopedWorkerIdleState(manualPaused, true)");
    expect(source).toContain("writeCapacity(effectiveWriteQuota()).paused");
    const directWait = source.slice(
      source.indexOf("async function waitForNextJob"),
      source.indexOf("async function initializeRuntime"),
    );
    expect(
      directWait.indexOf("await refreshStorageBudget(client)"),
    ).toBeLessThan(directWait.indexOf("const hitQuota = quotaReached()"));
    expect(source).toContain("waitForNextJob: () => waitForNextJob(supabase)");
    expect(loop.indexOf("await refreshStorageBudget(supabase)")).toBeLessThan(
      loop.indexOf("await claimNextScopedScrapeJob"),
    );
    expect(loop).toContain(
      "const capacity = writeCapacity(effectiveWriteQuota())",
    );
    expect(loop.replace(/\s+/g, "")).toContain(
      "recordPendingCapacityWait(supabase,effectiveWriteQuota(),now,waiting,)",
    );
    expect(loop).toContain("capacity.insertsRemaining > 0");
    expect(loop).toContain("claimNextScopedScrapeJob(supabase, WORKER_ID)");
    expect(loop).toContain(
      "claimNextRefreshScopedScrapeJob(supabase, WORKER_ID)",
    );
    expect(loop).toContain(
      "capacity.updatesRemaining + capacity.touchesRemaining > 0",
    );
  });
});
