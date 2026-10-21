import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScrapeRunScope } from "./run-scope-context";
import type { OrchestratorType } from "./runner";

export type ScrapeJobStatus = "pending" | "running" | "completed" | "failed";

/** Operator-only queue hint. Public buyer-scope normalization never sets this flag. */
export type ScopedScrapeScope = ScrapeRunScope;

/** Idle health must distinguish a live process from permission to collect/store more rows. */
export function scopedWorkerIdleState(
  manualPaused: boolean,
  quotaReached: boolean,
) {
  return manualPaused ? "paused" : quotaReached ? "quota_paused" : "running";
}

export interface ScopedScrapeJobInput {
  requestedBy?: string | null;
  sourceIds: string[];
  scope: ScopedScrapeScope;
  orchestrator: OrchestratorType;
  concurrency: number;
  dryRun?: boolean;
}

export interface ScopedScrapeJob {
  id: string;
  status: ScrapeJobStatus;
  source_ids: string[];
  scope: ScopedScrapeScope;
  orchestrator: OrchestratorType;
  concurrency: number;
  dry_run: boolean;
  requested_by?: string | null;
  worker_id?: string | null;
  listings_found?: number | null;
  listings_saved?: number | null;
  error_message?: string | null;
  result?: Record<string, unknown> | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  attempts?: number;
}

/** Queue and hybrid both hand buyer-scoped jobs to the Docker worker. */
export function isRemoteScrapeQueueEnabled() {
  const mode = process.env.SCRAPER_EXECUTION_MODE?.trim().toLowerCase();
  return mode === "queue" || mode === "hybrid";
}

export async function enqueueScopedScrapeJob(
  supabase: SupabaseClient,
  input: ScopedScrapeJobInput,
): Promise<{ job: ScopedScrapeJob; deduplicated: boolean }> {
  if (!input.sourceIds.length)
    throw new Error("A scrape job needs at least one source");

  if (input.requestedBy) {
    const { data: active, error: activeError } = await supabase
      .from("scrape_jobs")
      .select("*")
      .eq("requested_by", input.requestedBy)
      .eq("scope", JSON.stringify(input.scope))
      .eq("dry_run", Boolean(input.dryRun))
      .contains("source_ids", input.sourceIds)
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeError)
      throw new Error(`Could not inspect scrape queue: ${activeError.message}`);
    if (
      active &&
      Array.isArray(active.source_ids) &&
      new Set(active.source_ids).size === new Set(input.sourceIds).size
    )
      return { job: active as ScopedScrapeJob, deduplicated: true };
  }

  const row = {
    source: input.sourceIds.join(",").slice(0, 50) || "scoped",
    source_ids: input.sourceIds,
    scope: input.scope,
    orchestrator: input.orchestrator,
    concurrency: Math.min(3, Math.max(1, input.concurrency || 1)),
    dry_run: Boolean(input.dryRun),
    requested_by: input.requestedBy || null,
    status: "pending",
    started_at: null,
  };
  const { data, error } = await supabase
    .from("scrape_jobs")
    .insert(row)
    .select("*")
    .single();
  if (error || !data)
    throw new Error(
      `Could not queue scoped import: ${error?.message || "missing row"}`,
    );
  return { job: data as ScopedScrapeJob, deduplicated: false };
}

export async function claimNextScopedScrapeJob(
  supabase: SupabaseClient,
  workerId: string,
): Promise<ScopedScrapeJob | null> {
  const { data, error } = await supabase.rpc("claim_next_scrape_job", {
    p_worker_id: workerId,
  });
  if (error) throw new Error(`Could not claim scrape job: ${error.message}`);
  return ((Array.isArray(data) ? data[0] : data) ||
    null) as ScopedScrapeJob | null;
}

/**
 * Claim an explicitly marked refresh while full insert capacity is reserved.
 *
 * The ordinary RPC remains the queue's default atomic claim path. This narrower
 * path exists so a known source can renew already-stored rows through the
 * independent update/touch budgets without letting normal search jobs bypass the
 * new-row guard. The status predicate makes a concurrent claim lose cleanly.
 */
export async function claimNextRefreshScopedScrapeJob(
  supabase: SupabaseClient,
  workerId: string,
): Promise<ScopedScrapeJob | null> {
  const { data: candidate, error: candidateError } = await supabase
    .from("scrape_jobs")
    .select("*")
    .eq("status", "pending")
    .contains("scope", { refreshExisting: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (candidateError)
    throw new Error(
      `Could not inspect refresh queue: ${candidateError.message}`,
    );
  if (!candidate) return null;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("scrape_jobs")
    .update({
      status: "running",
      worker_id: workerId,
      started_at: now,
      heartbeat_at: now,
      attempts: Math.max(0, Number(candidate.attempts) || 0) + 1,
      error_message: null,
    })
    .eq("id", candidate.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Could not claim refresh job: ${error.message}`);
  return (data || null) as ScopedScrapeJob | null;
}

/** Clear a recovered connection error without hiding a failed collection task. */
export function recoveredClaimError(
  lastError: string | undefined,
  failures: number,
) {
  const isQueueClaimError = [
    "Could not claim scrape job:",
    "Could not inspect refresh queue:",
    "Could not claim refresh job:",
  ].some((prefix) => lastError?.startsWith(prefix));
  return failures > 0 && isQueueClaimError ? undefined : lastError;
}
