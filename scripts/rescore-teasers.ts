// Targeted re-score: only active deals whose TITLE carries a financing-teaser marker (in-house / BHPH /
// "as low as" / down-payment / monthly). Applies the current analyzeDeal — so the in-house down-payment
// fake-GOs (e.g. "…IN-HOUSE AVAILABLE - $14,850" on a $48k truck) get flagged implausible and demoted,
// without touching the other ~86k deals. Idempotent; re-runnable. Mirrors rescore-all.ts.
import { createClient } from "@supabase/supabase-js";
import { analyzeDeal } from "../lib/scoring/deal-analyzer";
import { loadMarketIndex } from "../lib/scoring/market-value";
import { extractTrim } from "../lib/scrapers/tools/deal-normalizer";
import { config } from "dotenv";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TEASER_ILIKE = [
  "in-house",
  "in house",
  "inhouse",
  "buy here pay here",
  "bhph",
  "as low as",
  "down payment",
  "/mo",
  " down",
]
  .map((p) => `title.ilike.*${p}*`)
  .join(",");

async function main() {
  await loadMarketIndex(sb);
  const { data: deals, error } = await sb
    .from("deals")
    .select("*")
    .eq("active", true)
    .or(TEASER_ILIKE)
    .limit(2000);
  if (error) throw error;
  console.log(`teaser deals to re-score: ${deals?.length ?? 0}`);

  let updated = 0;
  let goToPass = 0;
  const process1 = async (row: any) => {
    try {
      if (!row.trim) {
        const t = extractTrim(row.title, row.make, row.model);
        if (t) row.trim = t;
      }
      const a = analyzeDeal(row);
      if (row.deal_verdict === "go" && a.verdict !== "go") {
        goToPass++;
        console.log(
          `  demoted: "${String(row.title).slice(0, 60)}" $${row.ask_price} → ${a.verdict}`,
        );
      }
      const { error: upErr } = await sb
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
      if (!upErr) updated++;
    } catch {
      /* skip */
    }
  };

  const limit = 50;
  for (let i = 0; i < (deals?.length ?? 0); i += limit) {
    await Promise.all((deals as any[]).slice(i, i + limit).map(process1));
  }
  console.log(`DONE: updated ${updated}, demoted go→pass ${goToPass}`);
}
main().then(() => process.exit(0));
