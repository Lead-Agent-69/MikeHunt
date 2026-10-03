import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuyerScope } from "./buyer-scope";
import type { OrchestratorType } from "./runner";

export type ScrapeJobStatus = "pending" | "running" | "completed" | "failed";

export interface ScopedScrapeJobInput {
  requestedBy?: string | null;
  sourceIds: string[];
  scope: BuyerScope;
  orchestrator: OrchestratorType;
  concurrency: number;
  dryRun?: boolean;
}

export interface ScopedScrapeJob {
  id: string;
  status: ScrapeJobStatus;
  source_ids: string[];
  scope: BuyerScope;
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
}

export function isRemoteScrapeQueueEnabled() {
  return process.env.SCRAPER_EXECUTION_MODE?.trim().toLowerCase() === "queue";
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
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeError)
      throw new Error(`Could not inspect scrape queue: ${activeError.message}`);
    if (active) return { job: active as ScopedScrapeJob, deduplicated: true };
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
