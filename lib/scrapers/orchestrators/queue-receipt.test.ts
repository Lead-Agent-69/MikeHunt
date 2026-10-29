import { describe, expect, it, vi } from "vitest";
import { QueueOrchestrator } from "./queue";
import type { ScrapeJob } from "./queue";

const intake = {
  received: 10,
  normalized: 10,
  scopeMatched: 8,
  qualityEligible: 7,
  vehicleEligible: 6,
  fieldEligible: 5,
  photoEligible: 4,
  persisted: 1,
  renewed: 2,
  notUpserted: 3,
};

describe("durable queue intake receipts", () => {
  it("clears a previous attempt's receipt before publishing a retry as running", async () => {
    const published: (typeof intake | undefined)[] = [];
    const queue = Object.assign(Object.create(QueueOrchestrator.prototype), {
      registry: { get: () => ({ id: "dealer" }) },
      options: { dryRun: true },
      executor: {
        execute: async () => ({ success: true, dealsFound: 0, dealsSaved: 0 }),
      },
      updateJob: async (job: ScrapeJob) => {
        published.push(job.intake);
      },
      logScrapeStart: async () => "test-run",
      logScrapeComplete: async () => {},
      updateSourceStats: async () => {},
      recordResult: async () => {},
      emitProgress: () => {},
    }) as unknown as { processJob: (job: ScrapeJob) => Promise<void> };
    await queue.processJob({
      id: "retry",
      sourceId: "dealer",
      name: "Dealer",
      status: "pending",
      attempts: 1,
      maxAttempts: 2,
      intake,
    });
    expect(published.length).toBeGreaterThan(0);
    expect(published.every((value) => value === undefined)).toBe(true);
  });
  it.each([
    JSON.stringify(intake),
    "broken-json",
    "",
    JSON.stringify({ received: 10 }),
  ])(
    "reads persisted jobs without inventing missing receipts: %s",
    async (encoded) => {
      const stored = {
        sourceId: "dealer",
        status: "completed",
        intake: encoded,
      };
      // Exercise the real status methods without constructing a network connection.
      const queue = Object.assign(Object.create(QueueOrchestrator.prototype), {
        queueName: "test-only",
        redis: {
          hgetall: vi.fn().mockResolvedValue(stored),
          keys: vi.fn().mockResolvedValue(["test-only:jobs:one"]),
        },
      }) as QueueOrchestrator;
      const expected = encoded === JSON.stringify(intake) ? intake : undefined;
      expect((await queue.getJobStatus("one"))?.intake).toEqual(expected);
      expect((await queue.getJobStatuses())[0].intake).toEqual(expected);
    },
  );
});
