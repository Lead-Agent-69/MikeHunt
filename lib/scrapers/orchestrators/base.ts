// lib/scrapers/orchestrators/base.ts
// Base orchestrator that all other orchestrators extend.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ScrapeResult, ScraperRun } from "@/types";
import { CostGuard, CostGuardOptions } from "../tools/cost-guard";
import {
  CircuitBreakerRegistry,
  CircuitBreakerOptions,
} from "../tools/circuit-breaker";

export type OrchestratorStatus =
  | "idle"
  | "running"
  | "paused"
  | "error"
  | "completed";

export interface OrchestratorOptions {
  supabaseUrl?: string;
  supabaseKey?: string;
  logToConsole?: boolean;
  dryRun?: boolean;
  onProgress?: (progress: OrchestratorProgress) => void;
  onSourceComplete?: (result: ScrapeResult) => void;
  onError?: (error: Error, source: string) => void;
  costGuard?: CostGuard;
  costGuardOptions?: CostGuardOptions;
  circuitBreaker?: CircuitBreakerRegistry;
  circuitBreakerOptions?: CircuitBreakerOptions;
}

export interface OrchestratorProgress {
  total: number;
  completed: number;
  running: number;
  failed: number;
  currentSource?: string;
  percentage: number;
  results: ScrapeResult[];
  status: OrchestratorStatus;
}

export abstract class BaseScraperOrchestrator {
  protected supabase: SupabaseClient;
  protected options: OrchestratorOptions;
  protected status: OrchestratorStatus = "idle";
  protected abortController: AbortController | null = null;
  protected runs: ScrapeResult[] = [];
  protected startTime: number = 0;
  protected costGuard: CostGuard;
  protected circuitBreaker: CircuitBreakerRegistry;

  constructor(options: OrchestratorOptions = {}) {
    this.options = {
      logToConsole: true,
      dryRun: false,
      ...options,
    };
    this.costGuard =
      options.costGuard || new CostGuard(options.costGuardOptions);
    this.circuitBreaker =
      options.circuitBreaker ||
      new CircuitBreakerRegistry(options.circuitBreakerOptions);

    const supabaseUrl =
      options.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (this.options.dryRun) {
      // Create a stub client for dry-run / tests
      this.supabase = createClient(
        "http://localhost:54321",
        "dummy-key-for-dry-run",
      );
    } else if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase URL and key are required for orchestrator");
    } else {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  getStatus(): OrchestratorStatus {
    return this.status;
  }

  protected log(message: string, level: "info" | "warn" | "error" = "info") {
    if (!this.options.logToConsole) return;
    const prefix = `[Orchestrator:${this.constructor.name}]`;
    if (level === "error") console.error(prefix, message);
    else if (level === "warn") console.warn(prefix, message);
    else console.log(prefix, message);
  }

  protected async logScrapeStart(source: string): Promise<string> {
    if (this.options.dryRun) return `dry-run-${source}-${Date.now()}`;

    const { data, error } = await this.supabase
      .from("scraper_runs")
      .insert({
        source,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      // Run-tracking is observability, NOT the job. A failure here (e.g. a source id that isn't a valid
      // deal_source enum, like "publicsurplus") must never crash the actual scrape — that once took the
      // whole run down with it. Warn and continue with a synthetic id so deals still get scraped + saved.
      this.log(
        `Failed to create scraper run for ${source} (${error?.message}); continuing without run tracking`,
        "warn",
      );
      return `untracked-${source}-${Date.now()}`;
    }

    return data.id;
  }

  protected async logScrapeComplete(
    runId: string,
    source: string,
    dealsFound: number,
    dealsSaved: number,
    duration: number,
    status: "success" | "error" = "success",
  ) {
    this.log(
      `${source}: ${status} in ${duration}ms, found ${dealsFound}, saved ${dealsSaved}`,
    );

    if (this.options.dryRun) return;
    // Run was never tracked (logScrapeStart fell back to a synthetic id) — nothing to update, and the
    // id isn't a uuid so the query would just log a noisy error. Skip cleanly.
    if (runId.startsWith("untracked-")) return;

    const { error } = await this.supabase
      .from("scraper_runs")
      .update({
        status,
        deals_found: dealsFound,
        deals_new: dealsSaved,
        duration_ms: duration,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (error) {
      this.log(
        `Failed to mark scraper run ${runId} complete: ${error.message}`,
        "error",
      );
    }
  }

  protected async logScrapeError(runId: string, error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    this.log(`Run failed: ${message}`, "error");

    if (this.options.dryRun) return;
    if (runId.startsWith("untracked-")) return;

    const { error: updateError } = await this.supabase
      .from("scraper_runs")
      .update({
        status: "error",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (updateError) {
      this.log(
        `Failed to mark scraper run ${runId} errored: ${updateError.message}`,
        "error",
      );
    }
  }

  protected async recordResult(result: ScrapeResult) {
    this.runs.push(result);
    this.options.onSourceComplete?.(result);
  }

  protected buildProgress(): OrchestratorProgress {
    const completed = this.runs.filter((r) => r.success).length;
    const failed = this.runs.filter((r) => !r.success).length;
    const total = this.runs.length + (this.status === "running" ? 1 : 0);
    return {
      total,
      completed,
      running: this.status === "running" ? total - completed - failed : 0,
      failed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      results: this.runs,
      status: this.status,
    };
  }

  protected emitProgress() {
    const progress = this.buildProgress();
    this.options.onProgress?.(progress);
  }

  abstract run(sourceIds?: string[]): Promise<ScrapeResult[]>;
  abstract stop(): Promise<void>;
}
