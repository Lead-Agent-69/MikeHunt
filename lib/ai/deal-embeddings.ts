// lib/ai/deal-embeddings.ts
// Activates the (previously dormant) pgvector stack: turn each deal into a descriptive sentence,
// embed it with text-embedding-004, and store the vector so similar_deals_by_id() can find
// semantically-near vehicles. Backfill runs in batches from a cron route; fully no-ops (no crash)
// when GOOGLE_GENERATIVE_AI_API_KEY is absent.

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEmbedding } from "./embeddings";

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

/**
 * Embed a batch of deals that don't yet have an embedding. Returns how many were updated.
 * Best-effort per row — one failure doesn't abort the batch.
 */
export async function backfillEmbeddings(
  supabase: SupabaseClient,
  limit = 50,
): Promise<{ updated: number; remaining: number; skipped: boolean }> {
  if (!hasEmbeddingProvider())
    return { updated: 0, remaining: 0, skipped: true };

  const { data: rows, error } = await supabase
    .from("deals")
    .select(
      "id, year, make, model, trim, body_style, fuel_type, drivetrain, condition, damage_type, mileage, location_state, title",
    )
    .is("embedding", null)
    .eq("active", true)
    .not("make", "is", null)
    .limit(limit);

  if (error || !rows || rows.length === 0)
    return { updated: 0, remaining: 0, skipped: false };

  let updated = 0;
  for (const d of rows) {
    try {
      const vec = await generateEmbedding(dealEmbeddingText(d));
      if (!Array.isArray(vec) || vec.length === 0) continue;
      const { error: upErr } = await supabase
        .from("deals")
        .update({ embedding: toVectorLiteral(vec) })
        .eq("id", d.id);
      if (!upErr) updated++;
    } catch (e) {
      console.warn("[embeddings] embed failed for deal", d.id, e);
    }
  }

  // How many still lack embeddings (so the cron knows whether to keep going).
  const { count } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .is("embedding", null)
    .eq("active", true);

  return { updated, remaining: count || 0, skipped: false };
}
