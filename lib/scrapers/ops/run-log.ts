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

/**
 * Insert rows as one batch; if the batch is refused (one row trips a CHECK, a bad run_id, ...),
 * fall back to row-by-row so one bad record never loses the whole run's log (Ren #296 P2-1).
 * A missing table (migration not applied) stops at the batch. Returns rows written.
 */
const NUL = /\u0000/g;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Postgres text/jsonb reject U+0000, and a lone UTF-16 surrogate (e.g. from a byte cap that split an
 * emoji) can't be encoded as UTF-8. Strip both from every string, in nested objects and arrays too.
 */
export function sanitizeForPostgres<T>(value: T): T {
  if (typeof value === "string")
    return value.replace(NUL, "").replace(LONE_SURROGATE, "") as unknown as T;
  if (Array.isArray(value)) return value.map((v) => sanitizeForPostgres(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[sanitizeForPostgres(k)] = sanitizeForPostgres(v);
    return out as T;
  }
  return value;
}

export async function insertWithFallback(
  sb: Pick<SupabaseClient, "from">,
  table: string,
  input: Record<string, unknown>[],
): Promise<number> {
  if (!input.length) return 0;
  const rows = input.map((r) => sanitizeForPostgres(r));
  try {
    const { error } = await sb.from(table).insert(rows);
    if (!error) return rows.length;
    if (isMissingSchemaError(error) || rows.length === 1) return 0;
  } catch {
    return 0;
  }
  let written = 0;
  for (const row of rows) {
    try {
      const { error } = await sb.from(table).insert(row);
      if (!error) written++;
    } catch {
      // skip this row only
    }
  }
  return written;
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
  out.errors = await insertWithFallback(
    sb,
    "scraper_errors",
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
  out.deadLetters = await insertWithFallback(
    sb,
    "scraper_dead_letters",
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
  const sent = { errors: t.samples.length, deadLetters: t.deadLetters.length };
  if (out.errors < sent.errors || out.deadLetters < sent.deadLetters)
    console.warn(
      `[run-log] ${t.source}: wrote ${out.errors}/${sent.errors} error samples and ${out.deadLetters}/${sent.deadLetters} dead letters (run ${run_id ?? "untracked"})`,
    );
  return out;
}

/** Tests only. */
export function resetRunLogState() {
  extendedColumns = true;
}
