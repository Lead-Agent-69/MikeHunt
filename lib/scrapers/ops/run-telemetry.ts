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
import { scrubContact } from "../../security/scrub-urls";

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
      message: info.message ? capBytes(scrubContact(info.message), 500) : null,
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
/**
 * Payload cap, measured the way Postgres measures it: the CHECK is octet_length(payload::text), and
 * jsonb renders `{"a": 1, "b": 2}` (a space after every ':' and ','), which is larger than
 * JSON.stringify. 1,800 leaves headroom under the 2,048-byte CHECK.
 */
export const MAX_PAYLOAD_BYTES = 1800;

/** Byte length of `obj` as Postgres prints it from jsonb (flat object of scalars). */
export function jsonbTextBytes(obj: Record<string, unknown>): number {
  const parts = Object.entries(obj).map(
    ([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`,
  );
  return Buffer.byteLength(`{${parts.join(", ")}}`, "utf8");
}

/**
 * Deal fields a dead-letter payload may carry (Ren #314 c): an allow-list, so a new scraper field
 * (seller_handle, posted_by, profile_url, telegram, ...) is dropped until someone decides it is safe.
 * Enough to see why the row was rejected and to replay it; no seller identity, contact, free text
 * beyond the title, or images.
 */
export const PAYLOAD_FIELDS: ReadonlySet<string> = new Set([
  "source", "source_deal_id", "source_url", "dealer_id", "dealer_name",
  "title", "year", "make", "model", "model_name", "trim", "body_type", "body_style", "vin",
  "ask_price", "price", "buy_now_price", "current_bid", "mmr_value",
  "mileage", "odometer_status", "condition", "title_status", "title_source", "damage_type",
  "primary_damage", "secondary_damage", "drivetrain", "transmission", "fuel_type", "engine",
  "exterior_color", "interior_color", "color", "one_owner", "owner_count",
  "location_city", "location_state", "location_zip",
  "seller_type", "listing_type", "sale_type", "lot_number", "auction_end", "bid_count",
  "status", "active", "image_count", "posted_at", "listed_at", "scraped_at", "last_seen_at",
]);

const CONTACT_TOKENS = new Set([
  "contact", "contacts", "phone", "phones", "telephone", "tel", "mobile", "cell", "cellphone",
  "whatsapp", "sms", "email", "mail", "emails", "fax", "owner", "owners",
  "address", "street", "name", "names", "firstname", "lastname", "fullname",
]);
/** Vehicle-history facts that only look like contact keys; they hold no PII. */
const NOT_CONTACT = new Set(["one_owner", "owner_count", "owners_count", "num_owners", "previous_owners"]);

/** Split snake_case, kebab-case and camelCase into lowercase tokens; "e_mail"/"eMail" -> "email". */
function keyTokens(key: string): string[] {
  const toks = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] === "e" && toks[i + 1] === "mail") {
      out.push("email");
      i++;
    } else out.push(toks[i]);
  }
  return out;
}

/**
 * Seller / owner contact details (PII): contact, seller_contact, contact_info, mobile, whatsapp,
 * seller_tel, cell, e_mail, owner, seller_name, sellerPhone... A `name` token only counts next to a
 * person word (seller/owner/contact/first/last/full), so make/model names survive.
 */
export function isContactKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (NOT_CONTACT.has(lower)) return false;
  if (lower === "seller" || /phone|email|whatsapp/.test(lower)) return true;
  const toks = keyTokens(key);
  const person = toks.some((t) => ["seller", "owner", "contact", "first", "last", "full"].includes(t));
  return toks.some((t) =>
    t === "name" || t === "names" ? person : CONTACT_TOKENS.has(t),
  );
}

/**
 * After a cut, drop the trailing partial token ("bob.smith@g", "(555) 123-4") so a fragment the
 * scrubber can no longer recognise is never stored. Also drops trailing whole tokens of phone
 * characters that still hold 3+ digits ("(555)").
 */
/** Longest tail dropped at a cut (Ren #323): longer than any phone and nearly any email fragment. */
export const MAX_PARTIAL_DROP = 64;

export function dropPartialTail(cut: string): string {
  const partial = cut.match(/\S*$/)?.[0] ?? "";
  // A cut inside one long word-only string ("yyyy…") keeps it; anything with digits, @, dots,
  // slashes or colons, or any partial token after other text, goes.
  let t: string;
  if (partial.length > MAX_PARTIAL_DROP) {
    // Minified HTML / long unbroken runs: drop only the last MAX_PARTIAL_DROP chars, which covers any
    // email or phone fragment the cut could have made, instead of throwing away the whole snippet.
    t = cut.slice(0, cut.length - MAX_PARTIAL_DROP);
  } else if (partial.length === cut.length && !/[\d@./:+]/.test(partial)) {
    t = cut;
  } else {
    t = cut.slice(0, cut.length - partial.length);
  }
  // Then whole trailing tokens made only of phone characters, e.g. "(555)" left before the cut.
  const tail = t.match(/(?:^|\s)[\d()+.\-\u2013\u2014/][\d\s()+.\-\u2013\u2014/]*$/)?.[0] ?? "";
  if ((tail.match(/\d/g) || []).length >= 3) t = t.slice(0, t.length - tail.length);
  return t.replace(/\s+$/, "");
}

/** Cut to `max` chars, dropping the partial token at the cut. */
export function cutAtToken(s: string, max: number): string {
  return s.length <= max ? s : dropPartialTail(s.slice(0, max));
}

/** Byte cap that never leaves a partial token behind. */
export function capBytesAtToken(s: string, maxBytes: number): string {
  return Buffer.byteLength(s, "utf8") <= maxBytes ? s : dropPartialTail(capBytes(s, maxBytes));
}

/** Scrub, then cut: pre-cut (bounds the scrub's input) and final cut both drop the partial tail. */
export function scrubThenCut(s: string, preMax: number, max: number): string {
  return cutAtToken(scrubContact(cutAtToken(s, preMax)), max);
}

export function compactPayload(
  record: unknown,
): Record<string, unknown> | null {
  if (!record || typeof record !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record as Record<string, unknown>)) {
    if (v == null || !PAYLOAD_FIELDS.has(k) || isContactKey(k)) continue;
    if (typeof v === "string") {
      // URLs lose their query string (tracking / contact params), like every other logged URL.
      out[k] = /(^|_)url$/i.test(k) ? safeUrl(v) : scrubThenCut(v, 600, 300);
    } else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  while (jsonbTextBytes(out) > MAX_PAYLOAD_BYTES) {
    const keys = Object.keys(out);
    if (!keys.length) return null;
    delete out[keys[keys.length - 1]];
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
    reason: capBytes(scrubContact(reason), 300),
    url: safeUrl(info.url ?? null),
    // Page HTML carries seller phones/emails and tracking URLs: scrub before it is stored.
    rawSnippet: info.raw
      ? capBytesAtToken(scrubContact(cutAtToken(info.raw, 16_384)), MAX_SNIPPET_BYTES)
      : null,
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
