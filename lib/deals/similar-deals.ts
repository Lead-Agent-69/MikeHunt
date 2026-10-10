// lib/deals/similar-deals.ts
// Fetchers for /api/deals/[id]/similar that apply the hard prefilters (similar-prefilters.ts)
// BEFORE semantic ranking. Semantic path prefers the similar_deals_by_id_filtered RPC (filters in
// SQL, then ORDER BY embedding distance). If that RPC is not deployed yet, it falls back to the
// legacy similar_deals_by_id with a wide over-fetch and applies the same gate in memory. The
// attribute fallback uses the same tiers + segment gate. No similarity number is ever synthesized.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  matchesSimilarFilters,
  selectWithWidening,
  type SimilarBounds,
  type SimilarCandidate,
  type SimilarSource,
  type SimilarTierStep,
} from "./similar-prefilters";

export const SIMILAR_FILTERED_RPC = "similar_deals_by_id_filtered";
export const SIMILAR_LEGACY_RPC = "similar_deals_by_id";
/** Per-tier over-fetch so the in-app segment gate still leaves enough rows. */
export const SIMILAR_TIER_FETCH = 60;
/** Legacy (unfiltered) RPC over-fetch before the in-memory gate. */
export const SIMILAR_LEGACY_FETCH = 200;

export const SIMILAR_ATTRIBUTE_COLUMNS =
  "id, year, make, model, ask_price, mileage, condition, deal_verdict, true_net_profit, sell_estimate, profit_score, location_state, location_city, images, source";

type Row = SimilarCandidate & Record<string, any>;
export type SimilarFetch = { rows: Row[]; step: SimilarTierStep | null };

/** Semantic neighbours that pass the hard gate; null = semantic path unavailable/empty. */
export async function fetchSemanticSimilar(
  supabase: SupabaseClient,
  dealId: string,
  source: SimilarSource,
): Promise<SimilarFetch | null> {
  let filteredMissing = false;
  const filtered = await selectWithWidening<Row>(
    source,
    async (b: SimilarBounds) => {
      try {
        const { data, error } = await supabase.rpc(SIMILAR_FILTERED_RPC, {
          p_deal_id: dealId,
          p_count: SIMILAR_TIER_FETCH,
          p_min_price: b.minPrice,
          p_max_price: b.maxPrice,
          p_min_year: b.minYear,
          p_max_year: b.maxYear,
        });
        if (error) {
          filteredMissing = true;
          return null;
        }
        return (data as Row[]) || [];
      } catch {
        filteredMissing = true;
        return null;
      }
    },
    { excludeId: dealId },
  );
  // A later tier failing keeps the tighter matches already found; only a first-call failure
  // (RPC not deployed / errored) drops to the legacy RPC.
  if (!filtered.failed || filtered.step !== null || !filteredMissing) {
    return filtered.rows.length
      ? { rows: filtered.rows, step: filtered.step }
      : null;
  }

  // Pre-migration path: one wide legacy fetch, then the same tiers applied in memory.
  let legacy: Row[];
  try {
    const { data, error } = await supabase.rpc(SIMILAR_LEGACY_RPC, {
      p_deal_id: dealId,
      p_count: SIMILAR_LEGACY_FETCH,
    });
    if (error || !data?.length) return null;
    legacy = data as Row[];
  } catch {
    return null;
  }
  const widened = await selectWithWidening<Row>(
    source,
    async (b) => legacy.filter((r) => matchesSimilarFilters(source, r, b)),
    { excludeId: dealId },
  );
  return widened.rows.length
    ? { rows: widened.rows, step: widened.step }
    : null;
}

/** Same-make attribute matches under the same segment / price / year tiers (no similarity %). */
export async function fetchAttributeSimilar(
  supabase: SupabaseClient,
  dealId: string,
  source: SimilarSource,
): Promise<SimilarFetch> {
  const res = await selectWithWidening<Row>(
    source,
    async (b) => {
      let q = supabase
        .from("deals")
        .select(SIMILAR_ATTRIBUTE_COLUMNS)
        .eq("active", true)
        .eq("make", source.make as string)
        .neq("id", dealId)
        .gt("ask_price", 0);
      if (b.minPrice != null) q = q.gte("ask_price", b.minPrice);
      if (b.maxPrice != null) q = q.lte("ask_price", b.maxPrice);
      if (b.minYear != null) q = q.gte("year", b.minYear);
      if (b.maxYear != null) q = q.lte("year", b.maxYear);
      const { data, error } = await q
        .order("profit_score", { ascending: false, nullsFirst: false })
        .limit(SIMILAR_TIER_FETCH);
      return error ? null : (data as Row[]) || [];
    },
    { excludeId: dealId },
  );
  return { rows: res.rows, step: res.step };
}
