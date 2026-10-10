// lib/ai/embedding-freshness.ts
// Pure helpers for keeping deals.embedding fresh within the Gemini API free tier.
//
// Free-tier limits for gemini-embedding-001 (per Google project, per model):
//   100 requests/min, 30,000 input tokens/min, 1,000 requests/day; RPD resets at midnight PT.
//   Sources: https://ai.google.dev/gemini-api/docs/rate-limits (how limits work, PT reset)
//            https://discuss.ai.google.dev/t/gemini-embedding-free-tier-documentation/112553
//            (Google staff answer with the embedding numbers; the docs defer to AI Studio)
// batchEmbedContents counts ONE REQUEST PER TEXT, not per HTTP call, so batching saves round
// trips but buys no extra quota. Everything below therefore budgets by texts.

import { createHash } from "node:crypto";

export const EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const EMBEDDING_DIMS = 768;

/** Free-tier ceilings we plan against (documented values, not observed). */
export const FREE_TIER = { rpm: 100, tpm: 30_000, rpd: 1_000 } as const;

/** Our targets: ~75% of RPM, 80% of TPM, 90% of RPD (failed calls also count toward RPD). */
export const PACING = {
  textsPerMinute: 75,
  tokensPerMinute: 24_000,
  defaultDailyCap: 900,
  batchSize: 25,
} as const;

/** Hash of exactly what gets embedded, versioned by model + dims so a model swap re-embeds. */
export function embeddingSourceHash(text: string): string {
  return createHash("sha256")
    .update(`${EMBEDDING_MODEL_ID}:${EMBEDDING_DIMS}:${text}`)
    .digest("hex");
}

export type EmbedTier = "missing" | "changed" | "legacy";

/**
 * Why a row needs (re-)embedding, or null when its vector is current.
 *  missing — no vector at all
 *  changed — vector written by this writer, but the embedded text changed since
 *  legacy  — vector predates the freshness migration (hash NULL), provenance unknown
 */
export function embeddingNeed(
  row: { embedding_source_hash?: string | null },
  hasEmbedding: boolean,
  currentHash: string,
): EmbedTier | null {
  if (!hasEmbedding) return "missing";
  if (!row.embedding_source_hash) return "legacy";
  return row.embedding_source_hash === currentHash ? null : "changed";
}

const TIER_ORDER: Record<EmbedTier, number> = {
  missing: 0,
  changed: 1,
  legacy: 2,
};

/** Missing first, then changed, then legacy; newest (created_at) first within a tier. */
export function prioritizeCandidates<
  T extends { tier: EmbedTier; created_at?: string | null },
>(rows: T[], cap: number): T[] {
  return [...rows]
    .sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
        (b.created_at || "").localeCompare(a.created_at || ""),
    )
    .slice(0, Math.max(0, cap));
}

/** Rough upper-bound token estimate (Gemini averages ~4 chars/token; use 3 to be safe). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** Minimum wait after sending a batch so the rolling minute stays under RPM and TPM targets. */
export function paceDelayMs(texts: number, tokens: number): number {
  const byTexts = (texts / PACING.textsPerMinute) * 60_000;
  const byTokens = (tokens / PACING.tokensPerMinute) * 60_000;
  return Math.ceil(Math.max(byTexts, byTokens));
}

/** UTC instant of the most recent midnight in America/Los_Angeles (when Gemini RPD resets). */
export function startOfPacificDay(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Wall-clock PT read as if it were UTC, minus the real instant, gives the PT offset.
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMs = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(
    Date.UTC(get("year"), get("month") - 1, get("day")) - offsetMs,
  );
}

/** How many texts this run may embed given the per-run cap and what today already used. */
export function runBudget(
  perRunCap: number,
  dailyCap: number,
  usedToday: number,
): number {
  return Math.max(0, Math.min(perRunCap, dailyCap - Math.max(0, usedToday)));
}

export function dailyCapFromEnv(
  raw: string | undefined = process.env.EMBEDDING_DAILY_CAP,
): number {
  const n = Number.parseInt(raw || "", 10);
  return Number.isFinite(n) && n > 0 ? n : PACING.defaultDailyCap;
}

export type QuotaKind = "daily" | "rate" | null;

function errorParts(e: any): { status?: number; body: string; headers: any } {
  const inner = e?.lastError ?? e?.errors?.[e.errors.length - 1] ?? e;
  return {
    status: inner?.statusCode ?? e?.statusCode,
    body: String(
      inner?.responseBody ?? e?.responseBody ?? inner?.message ?? "",
    ),
    headers: inner?.responseHeaders ?? e?.responseHeaders ?? {},
  };
}

/** Classify a provider error: daily quota (stop for today), rate limit (back off), or other. */
export function quotaKind(e: unknown): QuotaKind {
  const { status, body } = errorParts(e);
  const exhausted = status === 429 || /RESOURCE_EXHAUSTED/.test(body);
  if (!exhausted) return null;
  return /PerDay/i.test(body) ? "daily" : "rate";
}

/** Server-suggested retry delay (RetryInfo.retryDelay or Retry-After), else exponential. */
export function retryDelayMs(e: unknown, attempt: number): number {
  const { body, headers } = errorParts(e);
  const m = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (m) return Math.ceil(Number(m[1]) * 1000) + 1000;
  const ra = Number(headers?.["retry-after"]);
  if (Number.isFinite(ra) && ra > 0) return ra * 1000 + 1000;
  return Math.min(120_000, 15_000 * 2 ** attempt);
}
