// Bounded backfill: re-score only the ACTIVE BUY deals (deal_verdict='go') through the current analyzeDeal
// so the new forecasting layer (deal_analysis.prediction) populates for exactly the listings users open —
// without touching the other ~86k. Idempotent; re-runnable. Mirrors rescore-teasers.ts.
import { createClient } from "@supabase/supabase-js";
import { analyzeDeal } from "../lib/scoring/deal-analyzer";
import { loadMarketIndex } from "../lib/scoring/market-value";
import { extractTrim } from "../lib/scrapers/tools/deal-normalizer";
import { shouldSkipRescore } from "../lib/data-quality/rescore-guard";
import { config } from "dotenv";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  await loadMarketIndex(sb);
  const { data: deals, error } = await sb
    .from("deals")
    .select("*")
    .eq("active", true)
    .eq("deal_verdict", "go")
    .limit(2000);
  if (error) throw error;
  console.log(`BUY deals to backfill: ${deals?.length ?? 0}`);

  let updated = 0;
  let withForecast = 0;
  const process1 = async (row: any) => {
    // Sanity-flagged rows are never rescored (Ren #306 P2): profit / verdict / max bid stay cleared.
    if (shouldSkipRescore(row)) return;
    try {
      if (!row.trim) {
        const t = extractTrim(row.title, row.make, row.model);
        if (t) row.trim = t;
      }
      const a = analyzeDeal(row);
      if (a.prediction) withForecast++;
      let q = sb
        .from("deals")
        .update({
          trim: row.trim ?? null,
          sell_estimate: a.sellEstimate,
          recommended_max_bid: a.recommendedMaxBid,
          true_net_profit: a.profit,
          profit_score: a.score,
          deal_verdict: a.verdict,
          is_arbitrage_opportunity: a.verdict === "go",
          deal_analysis: {
            ...(row.deal_analysis || {}),
            sellBasis: a.sellBasis,
            priceImplausible: a.priceImplausible,
            conditionTag: a.conditionTag,
            soldAnchored: a.soldAnchored,
            wholesaleEstimate: a.wholesaleEstimate,
            priceSanity: a.priceSanity,
            inferredPrice: a.inferredPrice,
            warnings: a.warnings,
            prediction: a.prediction,
          },
        })
        .eq("id", row.id);
      // select("*") carries quality_flags once 20261010210000 is applied: write only while unflagged.
      if ("quality_flags" in row) q = q.is("quality_flags", null);
      const { error: upErr } = await q;
      if (!upErr) updated++;
    } catch {
      /* skip */
    }
  };

  const limit = 50;
  for (let i = 0; i < (deals?.length ?? 0); i += limit) {
    await Promise.all((deals as any[]).slice(i, i + limit).map(process1));
  }
  console.log(`DONE: updated ${updated}, with forecast ${withForecast}`);
}
main().then(() => process.exit(0));
