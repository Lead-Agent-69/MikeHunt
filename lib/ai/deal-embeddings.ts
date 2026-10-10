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
  "id, created_at, year, make, model, trim, body_style, fuel_type, drivetrain, condition, damage_type, mileage, location_state, title";
const SCAN_PAGE = 1000;
const MAX_SCAN_ROWS = 10_000;
const MAX_RATE_RETRIES = 2;

function isMissingFreshnessColumn(error: any): boolean {
  const msg = String(error?.message || "");
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    (/embedded_at|embedding_source_hash/.test(msg) &&
      /does not exist|schema cache|Could not find/i.test(msg))
  );
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
    fresh: number | null;
    pct: number;
  };
}

type Candidate = {
  id: string;
  created_at?: string | null;
  tier: EmbedTier;
  text: string;
  hash: string;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Embed a budgeted batch of deals: active deals with no vector first, then deals whose embedded
 * text changed, then pre-migration vectors of unknown provenance — newest first within each tier.
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
  const used = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .not("embedding_source_hash", "is", null)
    .gte("embedded_at", startOfPacificDay(new Date(now())).toISOString());
  if (used.error) {
    if (!isMissingFreshnessColumn(used.error))
      throw new Error(`Embedding budget read failed: ${used.error.message}`);
    schemaReady = false;
    usedToday = null;
    console.warn(
      "[embeddings] freshness columns missing — apply migration 20261009200000; running missing-only mode",
    );
  } else {
    usedToday = used.count || 0;
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
      .order("created_at", { ascending: false })
      .limit(runCap);
    if (error)
      throw new Error(`Embedding inventory read failed: ${error.message}`);

    const pool: Candidate[] = (missingRows || []).map((d: any) => {
      const text = dealEmbeddingText(d);
      return {
        id: d.id,
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
            pool.push({ id: d.id, created_at: d.created_at, tier, text, hash });
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
  const [activeQ, embeddedQ, missingQ, freshQ] = await Promise.all([
    head().eq("active", true),
    head().eq("active", true).not("embedding", "is", null),
    head().eq("active", true).is("embedding", null),
    schemaReady
      ? head().eq("active", true).not("embedding_source_hash", "is", null)
      : Promise.resolve({ count: null, error: null }),
  ]);
  const countErr =
    activeQ.error || embeddedQ.error || missingQ.error || freshQ.error;
  if (countErr)
    throw new Error(`Embedding backlog read failed: ${countErr.message}`);
  const active = activeQ.count || 0;
  const embedded = embeddedQ.count || 0;
  const coverage = {
    active,
    embedded,
    fresh: schemaReady ? freshQ.count || 0 : null,
    pct: active ? Math.round((embedded / active) * 1000) / 10 : 0,
  };
  const budgetExhausted = runCap === 0;
  console.log(
    `[embeddings] coverage ${embedded}/${active} active (${coverage.pct}%)` +
      (coverage.fresh != null ? `, hash-verified ${coverage.fresh}` : "") +
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
