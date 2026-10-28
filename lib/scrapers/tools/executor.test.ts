import { describe, it, expect, vi } from "vitest";
import { ScraperExecutor } from "./executor";
import { ScraperRegistry } from "./registry";
import {
  getScrapeSourceId,
  recordScrapePersistence,
} from "../source-run-context";

describe("ScraperExecutor", () => {
  it("aborts timed-out work without starting overlapping retries", async () => {
    const scraper = new ScraperRegistry().register({
      id: "timeout",
      name: "Timeout",
      type: "dealer",
      priority: "medium",
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      enabled: true,
      estimatedDealsPerRun: 10,
      fn: vi.fn(async (args) => {
        await new Promise((resolve) =>
          args?.abortSignal?.addEventListener("abort", resolve, { once: true }),
        );
        args?.abortSignal?.throwIfAborted();
        return 1;
      }),
    });
    const result = await new ScraperExecutor().execute(scraper, {
      timeoutMs: 20,
      maxRetries: 2,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
    expect(scraper.fn).toHaveBeenCalledTimes(1);
  });

  it.each(["timeout", "later-page-error"])(
    "keeps committed batches visible after %s without replaying them",
    async (failure) => {
      const scraper = new ScraperRegistry().register({
        id: "partial",
        estimatedDealsPerRun: 30,
        name: "Partial",
        type: "dealer",
        priority: "medium",
        frequencyMinutes: 60,
        requiresAuth: false,
        stealthRequired: false,
        enabled: true,
        fn: vi.fn(async (args) => {
          recordScrapePersistence(30, 7);
          if (failure === "later-page-error")
            throw new Error("Next page failed");
          await new Promise((resolve) =>
            args?.abortSignal?.addEventListener("abort", resolve, {
              once: true,
            }),
          );
          args?.abortSignal?.throwIfAborted();
          return 30;
        }),
      });
      const result = await new ScraperExecutor().execute(scraper, {
        timeoutMs: 20,
        maxRetries: 2,
      });
      expect(result).toMatchObject({
        success: false,
        dealsFound: 30,
        dealsSaved: 7,
      });
      expect(result.error).toContain(
        failure === "timeout" ? "timed out" : "Next page failed",
      );
      expect(scraper.fn).toHaveBeenCalledTimes(1);
    },
  );

  it("executes a successful scraper and returns count", async () => {
    const executor = new ScraperExecutor();
    const scraper = new ScraperRegistry().register({
      id: "success",
      name: "Success",
      type: "marketplace",
      priority: "medium",
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => 42,
      enabled: true,
      estimatedDealsPerRun: 10,
    });

    const result = await executor.execute(scraper, { timeoutMs: 1000 });
    expect(result.success).toBe(true);
    expect(result.dealsFound).toBe(42);
    expect(result.dealsSaved).toBe(0);
    expect(result.persistenceVerified).toBe(false);
  });

  it("reports actual persistence instead of copying the discovered count", async () => {
    const scraper = new ScraperRegistry().register({
      id: "quota-limited",
      name: "Quota limited",
      type: "marketplace",
      priority: "medium",
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => {
        recordScrapePersistence(54, 0);
        // Several adapters return the persistence count rather than their discovered count.
        return 0;
      },
      enabled: true,
      estimatedDealsPerRun: 54,
    });

    const result = await new ScraperExecutor().execute(scraper, {
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({
      success: true,
      dealsFound: 54,
      dealsSaved: 0,
    });
  });

  it("combines persistence receipts from paged intake calls", async () => {
    const scraper = new ScraperRegistry().register({
      id: "paged",
      name: "Paged",
      type: "dealer",
      priority: "medium",
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => {
        recordScrapePersistence(20, 4);
        recordScrapePersistence(10, 2);
        return 30;
      },
      enabled: true,
      estimatedDealsPerRun: 30,
    });

    const result = await new ScraperExecutor().execute(scraper, {
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({
      success: true,
      dealsFound: 30,
      dealsSaved: 6,
    });
  });

  it("makes the registered adapter id available to persistence work", async () => {
    let observedSourceId: string | undefined;
    const scraper = new ScraperRegistry().register({
      id: "govdeals",
      name: "GovDeals",
      type: "auction",
      priority: "high",
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => {
        await Promise.resolve();
        observedSourceId = getScrapeSourceId();
        return 1;
      },
      enabled: true,
      estimatedDealsPerRun: 1,
    });

    const result = await new ScraperExecutor().execute(scraper, {
      timeoutMs: 1000,
    });

    expect(result.success).toBe(true);
    expect(observedSourceId).toBe("govdeals");
    expect(getScrapeSourceId()).toBeUndefined();
  });

  it("returns error after exhausting retries", async () => {
    const executor = new ScraperExecutor();
    const scraper = new ScraperRegistry().register({
      id: "failing",
      name: "Failing",
      type: "marketplace",
      priority: "medium",
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => {
        throw new Error("network error");
      },
      enabled: true,
      estimatedDealsPerRun: 10,
    });

    const result = await executor.execute(scraper, {
      maxRetries: 1,
      retryDelayMs: 10,
      timeoutMs: 1000,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("network error");
    expect(result.dealsFound).toBe(0);
  });

  it("respects abort signal", async () => {
    const executor = new ScraperExecutor();
    const scraper = new ScraperRegistry().register({
      id: "slow",
      name: "Slow",
      type: "marketplace",
      priority: "medium",
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return 1;
      },
      enabled: true,
      estimatedDealsPerRun: 10,
    });

    const controller = new AbortController();
    const promise = executor.execute(scraper, {
      abortSignal: controller.signal,
      timeoutMs: 2000,
    });
    controller.abort();

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe("Aborted by user");
  });

  it("does not invent inventory or execute an adapter in dry run", async () => {
    const executor = new ScraperExecutor();
    const scraper = new ScraperRegistry().register({
      id: "dry",
      name: "Dry",
      type: "marketplace",
      priority: "medium",
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: vi.fn(async () => 0),
      enabled: true,
      estimatedDealsPerRun: 50,
    });

    const result = await executor.execute(scraper, { dryRun: true });
    expect(result.success).toBe(true);
    expect(result).toMatchObject({
      simulated: true,
      dealsFound: 0,
      dealsSaved: 0,
      persistenceVerified: false,
    });
    expect(scraper.fn).not.toHaveBeenCalled();
  });

  it("enforces a cost guard deal budget", async () => {
    const executor = new ScraperExecutor();
    const scraper = new ScraperRegistry().register({
      id: "budget",
      name: "Budget",
      type: "marketplace",
      priority: "medium",
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => 100,
      enabled: true,
      estimatedDealsPerRun: 100,
    });

    const result = await executor.execute(scraper, {
      timeoutMs: 1000,
      costGuardOptions: { maxDealsPerRun: 5 },
    });
    expect(result.success).toBe(true);
    expect(result.dealsFound).toBeLessThanOrEqual(5);
  });
});
