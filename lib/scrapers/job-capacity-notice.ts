import type { SupabaseClient } from "@supabase/supabase-js";
import { dailyCapacityWait, type CapacityWait } from "./job-wait";
import {
  generalInsertCapacity,
  writeCapacity,
  type WriteQuota,
} from "./write-capacity";

/** Refresh outdated wait observations without overwriting other job results. */
export async function recordPendingCapacityWait(
  db: SupabaseClient,
  quota: WriteQuota,
  now = Date.now(),
  waiting: CapacityWait = dailyCapacityWait(now),
) {
  if (generalInsertCapacity(quota) > 0) return 0;
  let pending = db
    .from("scrape_jobs")
    .select("id,result")
    .eq("status", "pending")
    .eq("dry_run", false)
    .not("scope", "cs", JSON.stringify({ refreshExisting: true }))
    .or(
      `result.is.null,result->waiting->>reason.neq.${waiting.reason},result->waiting->>nextCheckAt.lt.${waiting.observedAt}`,
    );
  if (writeCapacity(quota).insertsRemaining > 0)
    pending = pending.or(
      "source_ids.neq.{curated_dealers},and(scope->dealerHosts->>0.is.null,scope->dealerSourceIds->>0.is.null)",
    );
  const { data, error } = await pending
    .order("created_at", { ascending: true })
    .limit(10)
    .abortSignal(AbortSignal.timeout(5_000));
  if (error) throw new Error("Could not record search waiting status.");
  if (!data?.length) return 0;
  const updates = await Promise.all(
    data.map((row) => {
      const update = db
        .from("scrape_jobs")
        .update({ result: { ...row.result, waiting } })
        .eq("id", row.id)
        .eq("status", "pending");
      return (
        row.result == null
          ? update.is("result", null)
          : update.eq("result", JSON.stringify(row.result))
      )
        .select("id")
        .abortSignal(AbortSignal.timeout(5_000));
    }),
  );
  if (updates.some((result) => result.error))
    throw new Error("Could not record search waiting status.");
  return updates.reduce(
    (count, result) => count + (result.data?.length || 0),
    0,
  );
}
