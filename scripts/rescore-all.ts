// Full rescore of all active deals (valuation + verdict + max-bid + score), applying the current
// analyzeDeal model — including the new price-plausibility gate. Mirrors app/api/admin/rescore but
// runs directly via the service role (no server / no INGEST_SECRET needed). Idempotent; re-runnable.
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

async function main() {
  await loadMarketIndex(sb);
  const pageSize = 1000; // PostgREST hard cap
  let page = 0,
    scanned = 0,
    updated = 0,
    goToPass = 0;
  while (true) {
    const { data: deals, error } = await sb
      .from("deals")
      .select("*")
      .eq("active", true)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!deals || deals.length === 0) break;

    const processDeal = async (row: any) => {
      try {
        if (!row.trim) {
          const t = extractTrim(row.title, row.make, row.model);
          if (t) row.trim = t;
        }
        const a = analyzeDeal(row);
        if (row.deal_verdict === "go" && a.verdict !== "go") goToPass++;
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

    // Concurrently process updates in sub-batches of 50
    const concurrencyLimit = 50;
    for (let i = 0; i < deals.length; i += concurrencyLimit) {
      const subBatch = deals.slice(i, i + concurrencyLimit);
      await Promise.all(subBatch.map((d) => processDeal(d)));
    }

    scanned += deals.length;
    console.log(
      `page ${page}: scanned ${scanned}, updated ${updated}, go→pass ${goToPass}`,
    );
    if (deals.length < pageSize) break;
    page++;
  }
  console.log(
    `DONE: scanned ${scanned}, updated ${updated}, demoted go→pass ${goToPass}`,
  );
}
main().then(() => process.exit(0));
