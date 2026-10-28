import type { SupabaseClient } from "@supabase/supabase-js";
import { dailyCapacityWait, type CapacityWait } from "./job-wait";
import { writeCapacity, type WriteQuota } from "./write-capacity";

/** Bounded, once-per-job observation. Never claim work, replace results, or spend inventory reserve. */
export async function recordPendingCapacityWait(
  db: SupabaseClient,
  quota: WriteQuota,
  now = Date.now(),
  waiting: CapacityWait = dailyCapacityWait(now),
) {
  if (writeCapacity(quota).insertsRemaining > 0) return 0;
  const { data, error } = await db
    .from("scrape_jobs")
    .select("id")
    .eq("status", "pending")
    .eq("dry_run", false)
    .is("result", null)
    .not("scope", "cs", JSON.stringify({ refreshExisting: true }))
    .order("created_at", { ascending: true })
    .limit(10)
    .abortSignal(AbortSignal.timeout(5_000));
  if (error) throw new Error("Could not record search waiting status.");
  if (!data?.length) return 0;
  const updated = await db
    .from("scrape_jobs")
    .update({ result: { waiting } })
    .in(
      "id",
      data.map((row) => row.id),
    )
    .eq("status", "pending")
    .is("result", null)
    .select("id")
    .abortSignal(AbortSignal.timeout(5_000));
  if (updated.error) throw new Error("Could not record search waiting status.");
  return updated.data?.length || 0;
}
