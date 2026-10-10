// Superseded for scheduling by lib/scrapers/ops/source-breaker.ts (5 consecutive failures, exponential
// cooldown, alerts). getSkipSources is kept for any external caller; the runner no longer uses it.
// Self-monitoring + self-healing for the scraper fleet. Runs are recorded to scraper_runs by the
// orchestrator itself (orchestrators/base.ts); the scheduler reads the source_health view to
// auto-skip sources that have failed their last few runs (with a cooldown so they retry
// periodically and recover automatically).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Sources to skip this run: those whose last 3 runs ALL failed and which were last attempted within
 * the cooldown window (so a dead source doesn't burn every run, but is retried every ~12h and can
 * heal itself once it starts working again). Returns an empty set on any error (fail-open).
 */
export async function getSkipSources(cooldownHours = 12): Promise<Set<string>> {
  const sb = admin();
  if (!sb) return new Set();
  try {
    const { data } = await sb
      .from("source_health")
      .select("source, last3_all_failed, last_run");
    const skip = new Set<string>();
    const cutoff = Date.now() - cooldownHours * 3600_000;
    for (const r of data || []) {
      if (
        r.last3_all_failed &&
        r.last_run &&
        new Date(r.last_run).getTime() > cutoff
      ) {
        skip.add(r.source);
      }
    }
    return skip;
  } catch {
    return new Set();
  }
}
