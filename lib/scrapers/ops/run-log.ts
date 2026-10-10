/**
 * Writes one source run's telemetry: the summary columns on scraper_runs, a capped sample of
 * failures into scraper_errors, and rejected records into scraper_dead_letters. Observability is
 * never the job: every write is best-effort and can't fail or stall the scrape. Before migration
 * 20261010200000 is applied the new columns/tables don't exist; the run row then falls back to the
 * original columns and the extra inserts are skipped.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveOutcome,
  errorCounts,
  type RunOutcome,
  type RunTelemetry,
} from "./run-telemetry";
import { scraperVersion, type ScraperVersion } from "./version";

export interface RunSummaryColumns {
  outcome: RunOutcome;
  error_counts: Record<string, number>;
  requests: number;
  not_modified: number;
  scan_mode: string;
  git_sha: string | null;
  image_built_at: string | null;
}

export function runSummaryColumns(
  t: RunTelemetry | undefined,
  dealsFound: number,
  succeeded: boolean,
  version: ScraperVersion = scraperVersion(),
): RunSummaryColumns {
  return {
    outcome: deriveOutcome(t, dealsFound, succeeded),
    error_counts: t ? errorCounts(t) : {},
    requests: t?.requests ?? 0,
    not_modified: (t?.notModified ?? 0) + (t?.unchanged ?? 0),
    scan_mode: t?.scanMode ?? "full",
    git_sha: version.gitSha,
    image_built_at: version.builtAt,
  };
}

/** PostgREST / Postgres "that column or table doesn't exist" (migration not applied yet). */
export function isMissingSchemaError(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  return (
    code === "42703" ||
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    /column .* does not exist|could not find the .* column|relation .* does not exist|could not find the table/i.test(
      String(error.message || ""),
    )
  );
}

let extendedColumns = true;

/**
 * Update a run row with the base columns plus the telemetry summary. If the summary columns are
 * missing, retry with the base columns only and remember that for the rest of the process.
 */
export async function updateRunRow(
  sb: SupabaseClient,
  runId: string,
  base: Record<string, unknown>,
  summary: RunSummaryColumns | null,
): Promise<{ message: string } | null> {
  const run = (patch: Record<string, unknown>) =>
    sb
      .from("scraper_runs")
      .update(patch)
      .eq("id", runId)
      .eq("status", "running");
  if (summary && extendedColumns) {
    const { error } = await run({ ...base, ...summary });
    if (!error) return null;
    if (!isMissingSchemaError(error)) return error;
    extendedColumns = false;
  }
  const { error } = await run(base);
  return error ?? null;
}

/** Insert the run's error samples and dead letters. Returns counts written. Never throws. */
export async function writeRunTelemetry(
  sb: SupabaseClient,
  runId: string | null,
  t: RunTelemetry | undefined,
): Promise<{ errors: number; deadLetters: number }> {
  const out = { errors: 0, deadLetters: 0 };
  if (!t) return out;
  const run_id = runId && !runId.startsWith("untracked-") ? runId : null;
  try {
    if (t.samples.length) {
      const { error } = await sb.from("scraper_errors").insert(
        t.samples.map((e) => ({
          run_id,
          source: t.source,
          error_class: e.errorClass,
          http_status: e.httpStatus,
          url: e.url,
          message: e.message,
          created_at: e.at,
        })),
      );
      if (!error) out.errors = t.samples.length;
    }
    if (t.deadLetters.length) {
      const { error } = await sb.from("scraper_dead_letters").insert(
        t.deadLetters.map((d) => ({
          run_id,
          source: t.source,
          url: d.url,
          reason: d.reason,
          raw_snippet: d.rawSnippet,
          payload: d.payload,
          created_at: d.at,
        })),
      );
      if (!error) out.deadLetters = t.deadLetters.length;
    }
  } catch {
    // observability only
  }
  return out;
}

/** Tests only. */
export function resetRunLogState() {
  extendedColumns = true;
}
