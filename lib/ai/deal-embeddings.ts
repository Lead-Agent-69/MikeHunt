// lib/ai/deal-embeddings.ts
// Activates the (previously dormant) pgvector stack: turn each deal into a descriptive sentence,
// embed it with gemini-embedding-001 (768-d), and store the vector so similar_deals_by_id() can find
// semantically-near vehicles. Backfill runs in batches from a cron route; fully no-ops (no crash)
// when GOOGLE_GENERATIVE_AI_API_KEY is absent.
//
// Freshness (migration 20261009200000): each write stamps embedded_at + embedding_source_hash
// (sha256 of the exact embedded text). Each run re-derives the hash from the live row, so deals
// whose embedded fields changed are re-embedded. Price and description are NOT part of the
// embedded text (see dealEmbeddingText), so changes to them do not spend quota on an identical
// vector. Throughput is budgeted against the Gemini free tier (see embedding-freshness.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEmbeddings } from "./embeddings";
import {
  EMBEDDING_DIMS,
  PACING,
  type EmbedTier,
  type QuotaKind,
  dailyCapFromEnv,
  embeddingNeed,
  embeddingSourceHash,
  estimateTokens,
  paceDelayMs,
  prioritizeCandidates,
  quotaKind,
  retryDelayMs,
  runBudget,
  startOfPacificDay,
} from "./embedding-freshness";

export function hasEmbeddingProvider(): boolean {
  return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/** A compact natural-language description of a deal — what the embedding captures. */
export function dealEmbeddingText(d: any): string {
  return [
    d.year,
    d.make,
    d.model,
    d.trim,
    d.body_style,
    d.fuel_type,
    d.drivetrain,
    d.condition && `${d.condition} title`,
    d.damage_type && `${d.damage_type} damage`,
    d.mileage && `${Math.round(d.mileage / 1000)}k miles`,
    d.location_state,
    d.title,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1000);
}

// pgvector accepts a bracketed string literal on input; Postgres casts it to vector(768).
function toVectorLiteral(arr: number[]): string {
  return `[${arr.join(",")}]`;
}

const EMBED_COLUMNS =
  "id, created_at, last_seen_at, year, make, model, trim, body_style, fuel_type, drivetrain, condition, damage_type, mileage, location_state, title";
const SCAN_PAGE = 1000;
const MAX_SCAN_ROWS = 10_000;
const MAX_RATE_RETRIES = 2;
const BUDGET_READ_TIMEOUT_MS = 8000;
const BUDGET_READ_RETRY_DELAY_MS = 250;

type BudgetReadTransport = "rpc" | "head_fallback";

type BudgetReadResult = {
  count: number | null;
  error: any;
  status: number;
};

function isMissingFreshnessColumn(error: any): boolean {
  const msg = String(error?.message || "");
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    (/embedded_at|embedding_source_hash/.test(msg) &&
      /does not exist|schema cache|Could not find/i.test(msg))
  );
}

function isMissingBudgetRpc(error: any): boolean {
  const msg = String(error?.message || "");
  return (
    error?.code === "PGRST202" ||
    error?.code === "42883" ||
    (/embedding_budget_used_since/i.test(msg) &&
      /could not find|does not exist|schema cache|undefined function/i.test(
        msg,
      ))
  );
}

function isTransientBudgetRead(error: any, status: number): boolean {
  return !!error && [0, 500, 502, 503, 504, 520].includes(status);
}

function safeBudgetCount(value: unknown): number | null {
  const parsed =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof parsed === "number" &&
    Number.isSafeInteger(parsed) &&
    parsed >= 0
    ? parsed
    : null;
}

function logBudgetRead(
  transport: BudgetReadTransport,
  attempt: number,
  response: { error?: any; status?: number },
  elapsedMs: number,
): void {
  const rawCode = response.error?.code;
  const code =
    typeof rawCode === "string"
      ? rawCode.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "unknown"
      : response.error
        ? "unknown"
        : "none";
  const diagnostic = {
    transport,
    attempt,
    ok: !response.error,
    status: Number.isInteger(response.status) ? response.status : 0,
    code,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  };
  if (response.error) console.warn("[embeddings] budget read", diagnostic);
  else console.info("[embeddings] budget read", diagnostic);
}

function validVector(vec: unknown): vec is number[] {
  return (
    Array.isArray(vec) &&
    vec.length === EMBEDDING_DIMS &&
    vec.every(Number.isFinite)
  );
}

export interface BackfillOptions {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Stop starting new batches after this long (route maxDuration is 300s). */
  timeBudgetMs?: number;
  dailyCap?: number;
}

export interface BackfillResult {
  updated: number;
  remaining: number;
  skipped: boolean;
  /** false when migration 20261009200000 isn't applied yet (legacy missing-only mode). */
  schemaReady?: boolean;
  attempted?: number;
  failed?: number;
  byTier?: Record<EmbedTier, number>;
  /** "daily" = Gemini RPD hit (stop until midnight PT); "rate" = RPM/TPM still 429 after retries. */
  quotaExhausted?: QuotaKind;
  /** Our own daily cap (EMBEDDING_DAILY_CAP, default 900) is already spent for this PT day. */
  budgetExhausted?: boolean;
  stoppedForTime?: boolean;
  budget?: { dailyCap: number; usedToday: number | null; runCap: number };
  coverage?: {
    active: number;
    embedded: number;
    /** @deprecated Current content freshness is not measured; retained as null for compatibility. */
    fresh: null;
    sourceHashTracked: number | null;
    currentContentFreshness: "not_measured";
    pct: number;
  };
}

type Candidate = {
  id: string;
  observed_at?: string | null;
  created_at?: string | null;
  tier: EmbedTier;
  text: string;
  hash: string;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Embed a budgeted batch of deals: active deals with no vector first, then deals whose embedded
 * text changed, then pre-migration vectors of unknown provenance — most recently observed first
 * within each tier. This makes the limited daily quota improve inventory users can still buy.
 * Batches through batchEmbedContents, paced under free-tier RPM/TPM, retries 429s with the
 * server's RetryInfo delay, and stops cleanly (no throw) on quota exhaustion.
 */
export async function backfillEmbeddings(
  supabase: SupabaseClient,
  limit = 50,
  opts: BackfillOptions = {},
): Promise<BackfillResult> {
  if (!hasEmbeddingProvider()) {
    console.warn(
      "[embeddings] skipped: GOOGLE_GENERATIVE_AI_API_KEY not set — nothing embedded",
    );
    return { updated: 0, remaining: 0, skipped: true };
  }
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const timeBudgetMs = opts.timeBudgetMs ?? 240_000;
  const dailyCap = opts.dailyCap ?? dailyCapFromEnv();
  const startedAt = now();

  // 1. Today's spend (PT day = Gemini RPD window). Also detects whether the migration is live.
  //    Only rows stamped with a hash count, so the migration's embedded_at backfill doesn't.
  let schemaReady = true;
  let usedToday: number | null = 0;
  const budgetSince = startOfPacificDay(new Date(now())).toISOString();
  const readBudgetRpc = async (attempt: number): Promise<BudgetReadResult> => {
    const readStartedAt = Date.now();
    const response: any = await supabase
      .rpc("embedding_budget_used_since", { p_since: budgetSince })
      .abortSignal(AbortSignal.timeout(BUDGET_READ_TIMEOUT_MS));
    logBudgetRead("rpc", attempt, response, Date.now() - readStartedAt);
    return {
      count: safeBudgetCount(response.data),
      error: response.error,
      status: response.status ?? 0,
    };
  };
  const readBudgetHead = async (attempt: number): Promise<BudgetReadResult> => {
    const readStartedAt = Date.now();
    const response: any = await supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .not("embedding_source_hash", "is", null)
      .gte("embedded_at", budgetSince)
      .abortSignal(AbortSignal.timeout(BUDGET_READ_TIMEOUT_MS));
    logBudgetRead(
      "head_fallback",
      attempt,
      response,
      Date.now() - readStartedAt,
    );
    return {
      count: safeBudgetCount(response.count),
      error: response.error,
      status: response.status ?? 0,
    };
  };

  let readBudget: (attempt: number) => Promise<BudgetReadResult> =
    readBudgetRpc;
  let used = await readBudget(1);
  // The fallback only bridges app-before-migration deploy order. Every other
  // failure stays closed so an unavailable ledger can never become zero use.
  if (used.error && isMissingBudgetRpc(used.error)) {
    readBudget = readBudgetHead;
    used = await readBudget(1);
  }
  // RPC is a POST, so supabase-js does not automatically retry it. Retry this
  // read once when the transport fails transiently; never retry provider work
  // or vector writes.
  if (
    isTransientBudgetRead(used.error, used.status) &&
    now() - startedAt + BUDGET_READ_TIMEOUT_MS + BUDGET_READ_RETRY_DELAY_MS <
      timeBudgetMs
  ) {
    await sleep(BUDGET_READ_RETRY_DELAY_MS);
    used = await readBudget(2);
  }
  if (used.error) {
    if (!isMissingFreshnessColumn(used.error))
      throw new Error("Embedding budget read failed; no provider work started");
    schemaReady = false;
    usedToday = null;
    console.warn(
      "[embeddings] freshness columns missing — apply migration 20261009200000; running missing-only mode",
    );
  } else {
    if (
      used.count === null ||
      !Number.isSafeInteger(used.count) ||
      used.count < 0
    )
      throw new Error(
        "Embedding budget count unavailable; no provider work started",
      );
    usedToday = used.count;
  }
  // Without the ledger we can't see other runs' spend; assume 8 runs/day share the cap.
  const runCap = schemaReady
    ? runBudget(limit, dailyCap, usedToday || 0)
    : Math.min(limit, Math.floor(dailyCap / 8));
  const budget = { dailyCap, usedToday, runCap };

  const byTier: Record<EmbedTier, number> = {
    missing: 0,
    changed: 0,
    legacy: 0,
  };
  let updated = 0;
  let attempted = 0;
  let failed = 0;
  let quota: QuotaKind = null;
  let stoppedForTime = false;

  if (runCap > 0) {
    // 2. Candidates. Tier "missing" via the partial index; tiers changed/legacy need the hash
    //    of live content, which only JS can compute, so scan active embedded rows (bounded).
    const { data: missingRows, error } = await supabase
      .from("deals")
      .select(EMBED_COLUMNS)
      .is("embedding", null)
      .eq("active", true)
      .not("make", "is", null)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(runCap);
    if (error)
      throw new Error(`Embedding inventory read failed: ${error.message}`);

    const pool: Candidate[] = (missingRows || []).map((d: any) => {
      const text = dealEmbeddingText(d);
      return {
        id: d.id,
        observed_at: d.last_seen_at,
        created_at: d.created_at,
        tier: "missing",
        text,
        hash: embeddingSourceHash(text),
      };
    });

    if (schemaReady && pool.length < runCap) {
      for (let from = 0; from < MAX_SCAN_ROWS; from += SCAN_PAGE) {
        const { data: page, error: scanErr } = await supabase
          .from("deals")
          .select(`${EMBED_COLUMNS}, embedding_source_hash`)
          .not("embedding", "is", null)
          .eq("active", true)
          .not("make", "is", null)
          .order("last_seen_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(from, from + SCAN_PAGE - 1);
        if (scanErr)
          throw new Error(
            `Embedding freshness scan failed: ${scanErr.message}`,
          );
        for (const d of (page || []) as any[]) {
          const text = dealEmbeddingText(d);
          const hash = embeddingSourceHash(text);
          const tier = embeddingNeed(d, true, hash);
          if (tier)
            pool.push({
              id: d.id,
              observed_at: d.last_seen_at,
              created_at: d.created_at,
              tier,
              text,
              hash,
            });
        }
        if (!page || page.length < SCAN_PAGE) break;
      }
    }

    const queue = prioritizeCandidates(pool, runCap);

    // 3. Embed in paced batches.
    outer: for (let i = 0; i < queue.length; i += PACING.batchSize) {
      if (now() - startedAt > timeBudgetMs) {
        stoppedForTime = true;
        break;
      }
      const batch = queue.slice(i, i + PACING.batchSize);
      const texts = batch.map((c) => c.text);
      attempted += batch.length;

      let vectors: number[][] | null = null;
      for (let attempt = 0; ; attempt++) {
        try {
          vectors = await generateEmbeddings(texts);
          break;
        } catch (e) {
          const kind = quotaKind(e);
          const wait = retryDelayMs(e, attempt);
          if (
            kind === "rate" &&
            attempt < MAX_RATE_RETRIES &&
            now() - startedAt + wait <= timeBudgetMs
          ) {
            console.warn(
              `[embeddings] 429 rate limit; retry ${attempt + 1}/${MAX_RATE_RETRIES} in ${Math.round(wait / 1000)}s`,
            );
            await sleep(wait);
            continue;
          }
          if (kind) {
            quota = kind;
            attempted -= batch.length;
            console.warn(
              kind === "daily"
                ? "[embeddings] stopped: Gemini free-tier daily quota exhausted (resets midnight PT)"
                : "[embeddings] stopped: Gemini rate limit persisted after retries",
            );
            break outer;
          }
          failed += batch.length;
          console.warn("[embeddings] batch embed failed", e);
          break;
        }
      }

      if (vectors) {
        for (let j = 0; j < batch.length; j++) {
          const c = batch[j];
          const vec = vectors[j];
          if (!validVector(vec)) {
            failed++;
            console.warn(
              "[embeddings] rejected malformed vector for deal",
              c.id,
            );
            continue;
          }
          const patch: Record<string, unknown> = {
            embedding: toVectorLiteral(vec),
          };
          if (schemaReady) {
            patch.embedded_at = new Date(now()).toISOString();
            patch.embedding_source_hash = c.hash;
          }
          const { error: upErr } = await supabase
            .from("deals")
            .update(patch)
            .eq("id", c.id);
          if (upErr) {
            failed++;
            console.warn(
              "[embeddings] write failed for deal",
              c.id,
              upErr.message,
            );
          } else {
            updated++;
            byTier[c.tier]++;
          }
        }
      }

      if (i + PACING.batchSize < queue.length)
        await sleep(
          paceDelayMs(
            texts.length,
            texts.reduce((n, t) => n + estimateTokens(t), 0),
          ),
        );
    }
  }

  // 4. Coverage (embedded / active) so every run reports where the backlog stands.
  const head = () =>
    supabase.from("deals").select("id", { count: "exact", head: true });
  const [activeQ, embeddedQ, missingQ, hashTrackedQ] = await Promise.all([
    head().eq("active", true),
    head().eq("active", true).not("embedding", "is", null),
    head().eq("active", true).is("embedding", null),
    schemaReady
      ? head().eq("active", true).not("embedding_source_hash", "is", null)
      : Promise.resolve({ count: null, error: null }),
  ]);
  const countErr =
    activeQ.error || embeddedQ.error || missingQ.error || hashTrackedQ.error;
  if (countErr)
    throw new Error(`Embedding backlog read failed: ${countErr.message}`);
  const active = activeQ.count || 0;
  const embedded = embeddedQ.count || 0;
  const coverage = {
    active,
    embedded,
    fresh: null,
    sourceHashTracked: schemaReady ? hashTrackedQ.count || 0 : null,
    currentContentFreshness: "not_measured" as const,
    pct: active ? Math.round((embedded / active) * 1000) / 10 : 0,
  };
  const budgetExhausted = runCap === 0;
  console.log(
    `[embeddings] coverage ${embedded}/${active} active (${coverage.pct}%)` +
      (coverage.sourceHashTracked != null
        ? `, source hash recorded ${coverage.sourceHashTracked}`
        : "") +
      ", current content freshness not measured" +
      ` | updated ${updated} (missing ${byTier.missing}, changed ${byTier.changed}, legacy ${byTier.legacy})` +
      ` | budget ${usedToday ?? "?"}+${updated}/${dailyCap} today` +
      (quota ? ` | quota:${quota}` : "") +
      (budgetExhausted ? " | daily cap reached" : "") +
      (stoppedForTime ? " | stopped for time" : ""),
  );

  if (updated === 0 && attempted > 0 && !quota)
    throw new Error("Embedding backfill made no progress");

  return {
    updated,
    remaining: missingQ.count || 0,
    skipped: false,
    schemaReady,
    attempted,
    failed,
    byTier,
    quotaExhausted: quota,
    budgetExhausted,
    stoppedForTime,
    budget,
    coverage,
  };
}
