// lib/scrapers/tools/executor.ts
// Executes a single scraper with retry, error handling, and result normalization.

import { ScrapeResult, Deal } from "@/types";
import { RegisteredScraper, ScraperArgs } from "./registry";
import { CostGuard, CostGuardOptions } from "./cost-guard";
import {
  CircuitBreakerRegistry,
  CircuitBreakerOptions,
} from "./circuit-breaker";
import { withPoliteSource } from "../polite/source-context";

export interface ExecutorOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  dryRun?: boolean;
  costGuard?: CostGuard;
  costGuardOptions?: CostGuardOptions;
  circuitBreaker?: CircuitBreakerRegistry;
  circuitBreakerOptions?: CircuitBreakerOptions;
}

export interface ExecutorResult {
  success: boolean;
  dealsFound: number;
  dealsSaved: number;
  durationMs: number;
  error?: string;
  deals?: Deal[];
}

export class ScraperExecutor {
  async execute(
    scraper: RegisteredScraper,
    options: ExecutorOptions = {},
  ): Promise<ExecutorResult> {
    const {
      maxRetries = 2,
      retryDelayMs = 2000,
      timeoutMs = 300000,
      abortSignal,
      dryRun = false,
      costGuard,
      costGuardOptions,
      circuitBreaker,
      circuitBreakerOptions,
    } = options;
    const guard = costGuard || new CostGuard(costGuardOptions);
    const breaker =
      circuitBreaker || new CircuitBreakerRegistry(circuitBreakerOptions);
    const start = Date.now();
    let lastError: Error | null = null;

    const budget = guard.check("time");
    if (!budget.allowed) {
      return {
        success: false,
        dealsFound: 0,
        dealsSaved: 0,
        durationMs: 0,
        error: budget.why,
      };
    }

    const circuit = breaker.canExecute(scraper.id);
    if (!circuit.allowed) {
      return {
        success: false,
        dealsFound: 0,
        dealsSaved: 0,
        durationMs: 0,
        error: circuit.reason,
      };
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (abortSignal?.aborted) {
        return {
          success: false,
          dealsFound: 0,
          dealsSaved: 0,
          durationMs: Date.now() - start,
          error: "Aborted by user",
        };
      }

      try {
        if (dryRun) {
          await this.simulateScrape(scraper);
          return {
            success: true,
            dealsFound:
              scraper.estimatedDealsPerRun || Math.floor(Math.random() * 50),
            dealsSaved:
              scraper.estimatedDealsPerRun || Math.floor(Math.random() * 50),
            durationMs: Date.now() - start,
          };
        }

        const result = await this.runWithTimeout(
          scraper,
          timeoutMs,
          abortSignal,
        );
        const durationMs = Date.now() - start;

        const dealsFound = this.countResult(result);
        const remaining = guard.snapshot().remainingDeals;
        const cappedDeals = Math.min(dealsFound, remaining);
        guard.trackDeals(cappedDeals);

        breaker.recordSuccess(scraper.id);
        return {
          success: true,
          dealsFound: cappedDeals,
          dealsSaved: cappedDeals,
          durationMs,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Timed-out work may still be closing network/browser resources. Never overlap it with a retry.
        if (
          abortSignal?.aborted ||
          lastError.message.startsWith(`Scraper ${scraper.id} timed out`)
        )
          break;
        if (attempt < maxRetries) {
          console.warn(
            `[Executor] ${scraper.id} attempt ${attempt + 1} failed, retrying in ${retryDelayMs}ms...`,
            lastError.message,
          );
          await this.delay(retryDelayMs * (attempt + 1));
        }
      }
    }

    const durationMs = Date.now() - start;
    breaker.recordFailure(scraper.id);
    return {
      success: false,
      dealsFound: 0,
      dealsSaved: 0,
      durationMs,
      error: abortSignal?.aborted
        ? "Aborted by user"
        : lastError?.message || "Unknown error",
    };
  }

  private async runWithTimeout(
    scraper: RegisteredScraper,
    timeoutMs: number,
    abortSignal?: AbortSignal,
  ): Promise<number | Deal[]> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout>;
    let onAbort: () => void;
    const stopped = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(
          `Scraper ${scraper.id} timed out after ${timeoutMs}ms`,
        );
        controller.abort(error);
        reject(error);
      }, timeoutMs);
      onAbort = () => {
        controller.abort();
        reject(new Error("Aborted"));
      };
      abortSignal?.addEventListener("abort", onAbort, { once: true });
      if (abortSignal?.aborted) onAbort();
    });
    try {
      return await Promise.race([
        stopped,
        Promise.resolve().then(() => {
          controller.signal.throwIfAborted();
          // Scope polite-layer exemptions to this source (Ren #269: source-plus-path).
          return withPoliteSource(scraper.id, () =>
            scraper.fn({
              ...scraper.args,
              abortSignal: controller.signal,
              deadlineAt: Date.now() + timeoutMs,
            }),
          );
        }),
      ]);
    } finally {
      clearTimeout(timeoutId!);
      abortSignal?.removeEventListener("abort", onAbort!);
    }
  }

  private async simulateScrape(scraper: RegisteredScraper): Promise<void> {
    const delay = Math.min(
      500 + Math.random() * 1000,
      scraper.averageDurationMs || 2000,
    );
    await this.delay(delay);
  }

  private countResult(result: number | Deal[]): number {
    if (typeof result === "number") return result;
    if (Array.isArray(result)) return result.length;
    return 0;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
