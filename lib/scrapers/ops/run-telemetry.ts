/**
 * Per-source-run telemetry: every HTTP / timeout / DNS / robots / challenge / parse / validation
 * failure a scraper hits during one run, captured where it happens (politeFetch, politeGate,
 * scraperFetch, the paginator, the pipeline) instead of after the processor. Most adapters catch
 * their own fetch errors and return 0 rows, so before this the orchestrator only ever saw "success,
 * 0 deals" and /status could not tell a blocked site from an empty one.
 *
 * The orchestrator opens one telemetry scope per source run (AsyncLocalStorage, so concurrent
 * sources never mix), and writes the summary onto that run's scraper_runs row, a capped sample of
 * error rows to scraper_errors, and rejected records to scraper_dead_letters. Outside a run scope
 * every recorder is a no-op, so tests and one-off scripts are unaffected.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type ErrorClass =
  | "http_403"
  | "http_429"
  | "http_4xx"
  | "http_5xx"
  | "timeout"
  | "dns"
  | "network"
  | "robots"
  | "challenge"
  | "breaker"
  | "parse"
  | "parse_empty"
  | "validation"
  | "db_reject";

export const ERROR_CLASSES: ErrorClass[] = [
  "http_403",
  "http_429",
  "http_4xx",
  "http_5xx",
  "timeout",
  "dns",
  "network",
  "robots",
  "challenge",
  "breaker",
  "parse",
  "parse_empty",
  "validation",
  "db_reject",
];

/** Run outcome written to scraper_runs.outcome. ok/unchanged are healthy; the rest are failures. */
export type RunOutcome =
  | "ok"
  | "unchanged"
  | "empty"
  | "blocked"
  | "challenged"
  | "failed";

export const HEALTHY_OUTCOMES: ReadonlySet<string> = new Set([
  "ok",
  "unchanged",
]);

export type ScanMode = "incremental" | "full";

export interface ErrorSample {
  errorClass: ErrorClass;
  httpStatus: number | null;
  url: string | null;
  message: string | null;
  at: string;
}

export interface DeadLetter {
  reason: string;
  url: string | null;
  rawSnippet: string | null;
  payload: Record<string, unknown> | null;
  at: string;
}

export interface RunTelemetry {
  source: string;
  scanMode: ScanMode;
  requests: number;
  ok: number;
  notModified: number;
  /** 200 responses whose body hash matched the cached copy (no validators from the server). */
  unchanged: number;
  /** Pages skipped in an incremental run because they were unchanged. */
  pagesSkipped: number;
  errors: Partial<Record<ErrorClass, number>>;
  samples: ErrorSample[];
  deadLetters: DeadLetter[];
  deadLettersDropped: number;
}

/** Per-run caps keep Supabase Free small: one bad run can't write thousands of rows. */
export const MAX_ERROR_SAMPLES_PER_RUN = 25;
export const MAX_DEAD_LETTERS_PER_RUN = 50;
/** Raw snippet and payload are each capped at 2 KB (also enforced by a CHECK in the table). */
export const MAX_SNIPPET_BYTES = 2048;

const storage = new AsyncLocalStorage<RunTelemetry>();

export function newRunTelemetry(
  source: string,
  scanMode: ScanMode = "full",
): RunTelemetry {
  return {
    source,
    scanMode,
    requests: 0,
    ok: 0,
    notModified: 0,
    unchanged: 0,
    pagesSkipped: 0,
    errors: {},
    samples: [],
    deadLetters: [],
    deadLettersDropped: 0,
  };
}

export function withRunTelemetry<T>(
  t: RunTelemetry,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(t, fn);
}

export function currentRunTelemetry(): RunTelemetry | undefined {
  return storage.getStore();
}

/** True inside a run scope whose mode is incremental (adapters may skip unchanged pages). */
export function isIncrementalRun(): boolean {
  return storage.getStore()?.scanMode === "incremental";
}

/** Cut a string to at most `maxBytes` UTF-8 bytes without splitting a character. */
export function capBytes(value: string, maxBytes = MAX_SNIPPET_BYTES): string {
  const s = String(value ?? "");
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return s;
  let out = s.slice(0, maxBytes);
  while (Buffer.byteLength(out, "utf8") > maxBytes) out = out.slice(0, -1);
  return out;
}

/** Strip query strings (they can carry tokens) and cap the length. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(String(url));
    return `${u.origin}${u.pathname}`.slice(0, 500);
  } catch {
    return String(url).split("?")[0].slice(0, 500);
  }
}

export function classifyHttpStatus(status: number): ErrorClass | null {
  if (status >= 200 && status < 400) return null;
  if (status === 403) return "http_403";
  if (status === 429) return "http_429";
  if (status >= 500) return "http_5xx";
  if (status >= 400) return "http_4xx";
  return "network";
}

/** Map a thrown fetch error to timeout / dns / network. */
export function classifyFetchError(error: unknown): ErrorClass {
  const e = error as {
    name?: string;
    code?: string;
    message?: string;
    cause?: any;
  } | null;
  const name = String(e?.name || "");
  const code = String(e?.code || e?.cause?.code || "");
  const msg = `${e?.message || ""} ${e?.cause?.message || ""}`;
  if (
    name === "TimeoutError" ||
    name === "AbortError" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    /timed? ?out|timeout/i.test(msg)
  )
    return "timeout";
  if (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    /getaddrinfo|ENOTFOUND|EAI_AGAIN/i.test(msg)
  )
    return "dns";
  return "network";
}

function bump(t: RunTelemetry, cls: ErrorClass) {
  t.errors[cls] = (t.errors[cls] ?? 0) + 1;
}

export function recordError(
  errorClass: ErrorClass,
  info: {
    url?: string | null;
    status?: number | null;
    message?: string | null;
  } = {},
): void {
  const t = storage.getStore();
  if (!t) return;
  bump(t, errorClass);
  if (t.samples.length < MAX_ERROR_SAMPLES_PER_RUN) {
    t.samples.push({
      errorClass,
      httpStatus: info.status ?? null,
      url: safeUrl(info.url),
      message: info.message ? capBytes(info.message, 500) : null,
      at: new Date().toISOString(),
    });
  }
}

/** One HTTP response seen (or a thrown fetch). Counts requests and classifies non-2xx/3xx. */
export function recordResponse(
  url: string,
  status: number,
  opts: { notModified?: boolean; unchanged?: boolean } = {},
) {
  const t = storage.getStore();
  if (!t) return;
  t.requests += 1;
  if (opts.notModified) {
    t.notModified += 1;
    return;
  }
  const cls = classifyHttpStatus(status);
  if (!cls) {
    t.ok += 1;
    if (opts.unchanged) t.unchanged += 1;
    return;
  }
  recordError(cls, { url, status });
}

/** A bot-challenge page: a request that returned, but a "no" from the site. */
export function recordChallenge(url: string, status?: number) {
  const t = storage.getStore();
  if (!t) return;
  t.requests += 1;
  recordError("challenge", { url, status: status ?? null });
}

export function recordFetchFailure(url: string, error: unknown) {
  const t = storage.getStore();
  if (!t) return;
  t.requests += 1;
  recordError(classifyFetchError(error), {
    url,
    message: error instanceof Error ? error.message : String(error),
  });
}

export function recordPageSkipped() {
  const t = storage.getStore();
  if (t) t.pagesSkipped += 1;
}

/** Keep only small scalar fields of a record so the payload stays under 2 KB and carries no blobs. */
export function compactPayload(
  record: unknown,
): Record<string, unknown> | null {
  if (!record || typeof record !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record as Record<string, unknown>)) {
    if (v == null) continue;
    if (
      k === "description" ||
      k === "images" ||
      k === "deal_analysis" ||
      k === "raw"
    )
      continue;
    if (typeof v === "string") out[k] = v.slice(0, 300);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  let json = JSON.stringify(out);
  while (Buffer.byteLength(json, "utf8") > MAX_SNIPPET_BYTES) {
    const keys = Object.keys(out);
    if (!keys.length) return null;
    delete out[keys[keys.length - 1]];
    json = JSON.stringify(out);
  }
  return out;
}

/**
 * Keep a record that failed parse or validation so it can be reviewed and replayed
 * (scripts/replay-dead-letters.ts). `payload` is the partial record (replayable); `raw` is the
 * page/HTML snippet when there is no record to replay. Both are capped at 2 KB.
 */
export function deadLetter(
  reason: string,
  info: { url?: string | null; raw?: string | null; payload?: unknown } = {},
): void {
  const t = storage.getStore();
  if (!t) return;
  if (t.deadLetters.length >= MAX_DEAD_LETTERS_PER_RUN) {
    t.deadLettersDropped += 1;
    return;
  }
  t.deadLetters.push({
    reason: capBytes(reason, 300),
    url: safeUrl(info.url ?? null),
    rawSnippet: info.raw ? capBytes(info.raw) : null,
    payload: compactPayload(info.payload),
    at: new Date().toISOString(),
  });
}

export function totalErrors(t: RunTelemetry): number {
  return Object.values(t.errors).reduce((s, n) => s + (n ?? 0), 0);
}

/**
 * Honest outcome of a run. `ok` needs rows. A run with no rows is `unchanged` only when every page
 * it touched came back 304/hash-identical with no errors; otherwise it is classified by what
 * actually stopped it (challenge page, 403/429/robots/breaker, other errors), else `empty`.
 */
export function deriveOutcome(
  t: RunTelemetry | undefined,
  dealsFound: number,
  succeeded: boolean,
): RunOutcome {
  if (dealsFound > 0) return "ok";
  if (!t) return succeeded ? "empty" : "failed";
  const e = t.errors;
  const n = (k: ErrorClass) => e[k] ?? 0;
  const errs = totalErrors(t);
  if (
    errs === 0 &&
    succeeded &&
    (t.notModified > 0 || t.unchanged > 0 || t.pagesSkipped > 0)
  )
    return "unchanged";
  if (n("challenge") > 0 && t.ok === 0) return "challenged";
  if (
    n("http_403") + n("http_429") + n("robots") + n("breaker") > 0 &&
    t.ok === 0
  )
    return "blocked";
  if (!succeeded || errs > 0) return "failed";
  return "empty";
}

/** Compact jsonb for scraper_runs.error_counts. */
export function errorCounts(t: RunTelemetry): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cls of ERROR_CLASSES) if (t.errors[cls]) out[cls] = t.errors[cls]!;
  return out;
}
