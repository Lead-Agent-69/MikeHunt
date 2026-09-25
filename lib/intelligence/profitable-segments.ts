// Closes the learning loop: what the dealer ACTUALLY profits on (logged outcomes) feeds back into
// what the autonomous pipeline prioritizes. Aggregates all outcomes into the set of makes that have
// been profitable, so enrichment/scoring can favor those segments. Cached (30 min) — best-effort,
// empty when nothing's logged yet (system gracefully falls back to its static heuristic).

import { createClient } from "@supabase/supabase-js";
import { extractWinPatterns } from "./win-patterns";

let cache: { at: number; makes: Set<string> } | null = null;
const TTL_MS = 30 * 60 * 1000;

export async function loadProfitableMakes(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.makes;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return new Set();

  try {
    const sb = createClient(url, key);
    const { data } = await sb
      .from("deal_outcomes")
      .select("make, model, actual_profit")
      .not("actual_profit", "is", null)
      .limit(2000);
    const patterns = extractWinPatterns(data || []);
    const makes = new Set(
      patterns.filter((p) => p.avgProfit > 0).map((p) => p.make.toLowerCase()),
    );
    cache = { at: Date.now(), makes };
    return makes;
  } catch {
    return new Set();
  }
}

/** Test/maintenance hook to clear the in-process cache. */
export function _resetProfitableMakesCache(): void {
  cache = null;
}
