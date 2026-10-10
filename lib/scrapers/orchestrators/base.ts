// lib/scrapers/orchestrators/base.ts
// Base orchestrator that all other orchestrators extend.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ScrapeResult, ScraperRun } from "@/types";
import { CostGuard, CostGuardOptions } from "../tools/cost-guard";
import {
  CircuitBreakerRegistry,
  CircuitBreakerOptions,
} from "../tools/circuit-breaker";
import {
  classifyFetchError,
  newRunTelemetry,
  recordError,
  withRunTelemetry,
  type RunTelemetry,
  type ScanMode,
} from "../ops/run-telemetry";
import {
  runSummaryColumns,
  updateRunRow,
  writeRunTelemetry,
} from "../ops/run-log";

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
  skipSupabaseRunTracking?: boolean;
  /** Per-source scan mode for this run (lib/scrapers/ops/scan-mode.ts). Default: full. */
  scanModes?: Record<string, ScanMode>;
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
  /** Telemetry of each source's current/last run in this orchestrator (job-level failure log). */
  protected telemetry = new Map<string, RunTelemetry>();

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
    if (this.options.dryRun || this.options.skipSupabaseRunTracking)
      return `untracked-${source}-${Date.now()}`;

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

  /**
   * Run one source's work inside a telemetry scope, so every fetch / parse / validation failure it
   * hits is captured where it happens (before the processor) and written with the run row.
   */
  protected executeWithTelemetry<T>(
    source: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const t = newRunTelemetry(
      source,
      this.options.scanModes?.[source] ?? "full",
    );
    this.telemetry.set(source, t);
    return withRunTelemetry(t, fn);
  }

  /** Telemetry for a source's last run in this orchestrator (tests, /status job results). */
  getRunTelemetry(source: string): RunTelemetry | undefined {
    return this.telemetry.get(source);
  }

  protected async logScrapeComplete(
    runId: string,
    source: string,
    dealsFound: number,
    dealsSaved: number,
    duration: number,
    status: "success" | "error" = "success",
    errorMessage?: string,
  ) {
    if (this.options.skipSupabaseRunTracking) return;
    this.log(
      `${source}: ${status} in ${duration}ms, found ${dealsFound}, saved ${dealsSaved}`,
    );

    if (this.options.dryRun) return;
    // Run was never tracked (logScrapeStart fell back to a synthetic id) — nothing to update, and the
    // id isn't a uuid so the query would just log a noisy error. Skip cleanly.
    if (runId.startsWith("untracked-")) return;

    const t = this.telemetry.get(source);
    const error = await updateRunRow(
      this.supabase,
      runId,
      {
        status,
        deals_found: dealsFound,
        deals_new: dealsSaved,
        duration_ms: duration,
        completed_at: new Date().toISOString(),
        error_message:
          status === "error"
            ? errorMessage || "Scraper failed without an error message"
            : null,
      },
      runSummaryColumns(t, dealsFound, status === "success"),
    );
    await writeRunTelemetry(this.supabase, runId, t);

    if (error) {
      this.log(
        `Failed to mark scraper run ${runId} complete: ${error.message}`,
        "error",
      );
    }
  }

  protected async logScrapeError(
    runId: string,
    error: unknown,
    source?: string,
  ) {
    const message = error instanceof Error ? error.message : "Unknown error";
    this.log(`Run failed: ${message}`, "error");

    const t = source ? this.telemetry.get(source) : undefined;
    // The throw itself is a failure of this run (timeout / network / anything else).
    if (t) {
      const cls = classifyFetchError(error);
      withRunTelemetry(t, async () => recordError(cls, { message }));
    }

    if (this.options.dryRun || this.options.skipSupabaseRunTracking) return;
    if (runId.startsWith("untracked-")) return;

    const updateError = await updateRunRow(
      this.supabase,
      runId,
      {
        status: "error",
        error_message: message,
        completed_at: new Date().toISOString(),
      },
      t ? runSummaryColumns(t, 0, false) : null,
    );
    await writeRunTelemetry(this.supabase, runId, t);

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
