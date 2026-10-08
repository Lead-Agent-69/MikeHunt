import type { SupabaseClient } from "@supabase/supabase-js";

export function startScopedJobHeartbeat(
  supabase: SupabaseClient,
  jobId: string,
  workerId: string,
  onError: (error: unknown) => void,
) {
  let pending = false;
  const timer = setInterval(async () => {
    if (pending) return;
    pending = true;
    try {
      const { error } = await supabase
        .from("scrape_jobs")
        .update({ heartbeat_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("worker_id", workerId)
        .eq("status", "running");
      if (error) onError(error);
    } catch (error) {
      onError(error);
    } finally {
      pending = false;
    }
  }, 30_000);
  return () => clearInterval(timer);
}
