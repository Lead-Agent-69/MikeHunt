// lib/scrapers/tools/registry.ts
// Dynamic registry of scraper sources. Add or remove sources at runtime.

import { ScrapeResult, Deal } from "@/types";
import { ScraperStateManager } from "./state";
import { crossRunBackoffMultiplier } from "./circuit-breaker";

export type ScraperFunction = (args?: ScraperArgs) => Promise<number | Deal[]>;

export interface ScraperArgs {
  states?: string[];
  cities?: string[];
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  page?: number;
  dealerUrl?: string;
  [key: string]: unknown;
}

export interface RegisteredScraper {
  id: string;
  name: string;
  type: "auction" | "marketplace" | "dealer" | "parts";
  priority: "high" | "medium" | "low";
  frequencyMinutes: number;
  requiresAuth: boolean;
  stealthRequired: boolean;
  fn: ScraperFunction;
  args?: ScraperArgs;
  enabled: boolean;
  lastRun?: Date;
  runCount: number;
  averageDurationMs: number;
  successRate: number;
  estimatedDealsPerRun: number;
  consecutiveFailures: number;
  autoDisableThreshold: number;
}

export class ScraperRegistry {
  private scrapers: Map<string, RegisteredScraper> = new Map();
  private stateManager?: ScraperStateManager;

  constructor(stateManager?: ScraperStateManager) {
    this.stateManager = stateManager;
  }

  async loadState(): Promise<void> {
    await this.stateManager?.loadState(this);
  }

  async persistState(sourceId?: string): Promise<void> {
    if (!this.stateManager) return;
    if (sourceId) {
      const scraper = this.get(sourceId);
      if (scraper) await this.stateManager.saveSourceState(scraper);
    } else {
      await this.stateManager.saveState(this);
    }
  }

  register(
    scraper: Omit<
      RegisteredScraper,
      | "runCount"
      | "averageDurationMs"
      | "successRate"
      | "consecutiveFailures"
      | "autoDisableThreshold"
    > & {
      runCount?: number;
      averageDurationMs?: number;
      successRate?: number;
      consecutiveFailures?: number;
      autoDisableThreshold?: number;
    },
  ): RegisteredScraper {
    const full: RegisteredScraper = {
      runCount: 0,
      averageDurationMs: 0,
      successRate: 1,
      consecutiveFailures: 0,
      autoDisableThreshold: 5,
      ...scraper,
    };
    this.scrapers.set(full.id, full);
    return full;
  }

  unregister(id: string): boolean {
    return this.scrapers.delete(id);
  }

  get(id: string): RegisteredScraper | undefined {
    return this.scrapers.get(id);
  }

  getAll(): RegisteredScraper[] {
    return Array.from(this.scrapers.values());
  }

  getEnabled(): RegisteredScraper[] {
    return this.getAll().filter((s) => s.enabled);
  }

  getByType(type: RegisteredScraper["type"]): RegisteredScraper[] {
    return this.getEnabled().filter((s) => s.type === type);
  }

  getByPriority(priority: RegisteredScraper["priority"]): RegisteredScraper[] {
    return this.getEnabled().filter((s) => s.priority === priority);
  }

  getDueForRun(lookbackMinutes: number = 60): RegisteredScraper[] {
    const now = new Date();
    return this.getEnabled().filter((s) => {
      if (!s.lastRun) return true;
      // Persistent cross-run circuit breaker: a source with consecutive failures backs off
      // exponentially (its consecutive_failures is hydrated from scraper_state across runs).
      const backoff = crossRunBackoffMultiplier(s.consecutiveFailures || 0);
      const waitMs = s.frequencyMinutes * 60 * 1000 * backoff;
      const diffMs = now.getTime() - s.lastRun.getTime();
      if (diffMs < waitMs) {
        if (backoff > 1) {
          console.log(
            `[ScraperRegistry] ${s.id} in cross-run cooldown (${s.consecutiveFailures} fails → ${backoff}× backoff)`,
          );
        }
        return false;
      }
      return true;
    });
  }

  async updateStats(
    id: string,
    success: boolean,
    durationMs: number,
    dealsFound: number,
  ): Promise<void> {
    const scraper = this.scrapers.get(id);
    if (!scraper) return;

    scraper.runCount += 1;
    scraper.lastRun = new Date();

    if (success) {
      scraper.consecutiveFailures = 0;
    } else {
      scraper.consecutiveFailures += 1;
      if (
        scraper.consecutiveFailures >= scraper.autoDisableThreshold &&
        scraper.enabled
      ) {
        scraper.enabled = false;
        console.warn(
          `[ScraperRegistry] Auto-disabled ${scraper.id} after ${scraper.consecutiveFailures} consecutive failures`,
        );
      }
    }

    // Rolling average duration
    const prevWeight = scraper.runCount - 1;
    scraper.averageDurationMs =
      (scraper.averageDurationMs * prevWeight + durationMs) / scraper.runCount;

    // Rolling success rate
    const successCount =
      Math.round(scraper.successRate * prevWeight) + (success ? 1 : 0);
    scraper.successRate = successCount / scraper.runCount;

    // Rolling deals per run
    scraper.estimatedDealsPerRun =
      (scraper.estimatedDealsPerRun * prevWeight + dealsFound) /
      scraper.runCount;

    await this.persistState(id);
  }

  getAutoDisabled(): RegisteredScraper[] {
    return this.getAll().filter((s) => !s.enabled && s.consecutiveFailures > 0);
  }

  resetConsecutiveFailures(id: string): boolean {
    const scraper = this.scrapers.get(id);
    if (!scraper) return false;
    scraper.consecutiveFailures = 0;
    return true;
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const scraper = this.scrapers.get(id);
    if (!scraper) return false;
    scraper.enabled = enabled;
    return true;
  }

  sortByPriority(scrapers: RegisteredScraper[]): RegisteredScraper[] {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return [...scrapers].sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return (
        b.successRate * b.estimatedDealsPerRun -
        a.successRate * a.estimatedDealsPerRun
      );
    });
  }
}
