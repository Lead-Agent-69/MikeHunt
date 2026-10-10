import type { SupabaseClient } from "@supabase/supabase-js";

export interface RecoverableSourceRun {
  id: string;
  source: string;
  status: string;
  started_at: string;
  completed_at: string | null;
}

export function isRecoveryCandidate(
  run: RecoverableSourceRun,
  now: number = Date.now(),
) {
  const started = Date.parse(run.started_at);
  return (
    run.status === "running" &&
    run.completed_at === null &&
    Number.isFinite(started) &&
    started <= now - 6 * 60 * 60 * 1000
  );
}

/** Age identifies candidates only. An operator must confirm the owning workers stopped. */
export async function recoverStoppedSourceRun(
  supabase: SupabaseClient,
  run: RecoverableSourceRun,
  workersStopped: boolean,
  now: number = Date.now(),
): Promise<boolean> {
  if (!workersStopped)
    throw new Error("Confirm the owning workers are stopped before recovery");
  if (!isRecoveryCandidate(run, now))
    throw new Error("Run is not an abandoned-run recovery candidate");
  const { data, error } = await supabase
    .from("scraper_runs")
    .update({
      status: "error",
      completed_at: new Date(now).toISOString(),
      error_message:
        "Operator recovery: owning worker confirmed stopped; collection outcome is unknown. Retry the source to verify inventory.",
    })
    .eq("id", run.id)
    .eq("source", run.source)
    .eq("status", "running")
    .eq("started_at", run.started_at)
    .is("completed_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Run recovery failed: ${error.message}`);
  return Boolean(data);
}

/**
 * Hard timeout for scraper_runs stuck in 'running'. No source run takes a day (CI jobs are capped at
 * 6h, Zeus sweep ticks at minutes), so a run older than this has no live worker: its process crashed
 * or was killed before writing completion. Unlike the operator path above, this needs no confirmation.
 */
export const RUN_TIMEOUT_HOURS = 24;

export function isTimedOutRun(
  run: RecoverableSourceRun,
  now: number = Date.now(),
  timeoutHours: number = RUN_TIMEOUT_HOURS,
) {
  const started = Date.parse(run.started_at);
  return (
    run.status === "running" &&
    run.completed_at === null &&
    Number.isFinite(started) &&
    started <= now - timeoutHours * 60 * 60 * 1000
  );
}

/** Marks every timed-out 'running' run as error. Returns how many rows changed. */
export async function reapTimedOutRuns(
  supabase: SupabaseClient,
  now: number = Date.now(),
  timeoutHours: number = RUN_TIMEOUT_HOURS,
): Promise<number> {
  const cutoff = new Date(now - timeoutHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("scraper_runs")
    .update({
      status: "error",
      completed_at: new Date(now).toISOString(),
      error_message: `Timed out: still 'running' after ${timeoutHours}h with no completion, so the worker is gone. Outcome unknown; the next scheduled run retries the source.`,
    })
    .eq("status", "running")
    .is("completed_at", null)
    .lt("started_at", cutoff)
    .select("id, source");
  if (error) throw new Error(`Run reaper failed: ${error.message}`);
  return (data || []).length;
}
