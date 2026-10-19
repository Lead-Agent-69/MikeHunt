import type { SupabaseClient } from "@supabase/supabase-js";

type JobSnapshot = {
  id: string;
  worker_id: string | null;
  started_at: string | null;
  heartbeat_at: string | null;
};
const HEARTBEAT_GRACE_MS = 30 * 60_000;
const LEGACY_GRACE_MS = 24 * 60 * 60_000;
export const INTERRUPTED_SEARCH_MESSAGE =
  "This search was interrupted before it finished. Please retry your selected search.";

export function abandonedJob(job: JobSnapshot, now = Date.now()) {
  const started = Date.parse(job.started_at || "");
  if (!Number.isFinite(started) || started > now) return false;
  const last =
    job.heartbeat_at == null ? started : Date.parse(job.heartbeat_at);
  const grace = job.heartbeat_at == null ? LEGACY_GRACE_MS : HEARTBEAT_GRACE_MS;
  return Number.isFinite(last) && last <= now - grace && started <= now - grace;
}

/** Never replay an abandoned broad search automatically or call it successful. */
export async function recoverAbandonedScopedJobs(
  db: SupabaseClient,
  {
    now = Date.now(),
    activeJobId,
  }: { now?: number; activeJobId?: string } = {},
) {
  const columns = "id,worker_id,started_at,heartbeat_at";
  const snapshots: JobSnapshot[] = [];
  const stale = await db
    .from("scrape_jobs")
    .select(columns)
    .eq("status", "running")
    .lte("heartbeat_at", new Date(now - HEARTBEAT_GRACE_MS).toISOString())
    .order("heartbeat_at", { ascending: true })
    .limit(25)
    .abortSignal(AbortSignal.timeout(10_000));
  if (stale.error)
    throw new Error(`Queue recovery read failed: ${stale.error.message}`);
  snapshots.push(...((stale.data || []) as JobSnapshot[]));
  if (snapshots.length < 25) {
    const legacy = await db
      .from("scrape_jobs")
      .select(columns)
      .eq("status", "running")
      .is("heartbeat_at", null)
      .lte("started_at", new Date(now - LEGACY_GRACE_MS).toISOString())
      .order("started_at", { ascending: true })
      .limit(25 - snapshots.length)
      .abortSignal(AbortSignal.timeout(10_000));
    if (legacy.error)
      throw new Error(`Queue recovery read failed: ${legacy.error.message}`);
    snapshots.push(...((legacy.data || []) as JobSnapshot[]));
  }
  let recovered = 0;
  for (const job of snapshots) {
    if (job.id === activeJobId || !abandonedJob(job, now)) continue;
    let query = db
      .from("scrape_jobs")
      .update({
        status: "failed",
        completed_at: new Date(now).toISOString(),
        error_message: INTERRUPTED_SEARCH_MESSAGE,
      })
      .eq("id", job.id)
      .eq("status", "running");
    // A heartbeat, completion, or reassignment after our read wins over recovery.
    for (const column of ["worker_id", "started_at", "heartbeat_at"] as const)
      query =
        job[column] == null
          ? query.is(column, null)
          : query.eq(column, job[column]);
    const { data, error } = await query
      .select("id")
      .abortSignal(AbortSignal.timeout(10_000));
    if (error)
      throw new Error(`Queue recovery update failed: ${error.message}`);
    recovered += data?.length || 0;
  }
  return recovered;
}
