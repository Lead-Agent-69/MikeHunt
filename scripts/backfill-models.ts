// Targeted model-string repair: existing deals whose model is a truncated stub ("Grand", "Model",
// "Santa", …) get re-extracted from their stored title with the fixed extractModel, then re-valued so
// they pool with real comps instead of the offline baseline. Bounded — only touches the stubs.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { extractModel } from "../lib/scrapers/tools/deal-normalizer";
import { analyzeDeal } from "../lib/scoring/deal-analyzer";
import { loadMarketIndex } from "../lib/scoring/market-value";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const STUBS = ["Grand", "Model", "Santa", "Range", "Land", "Crown", "Town", "New"];

async function main() {
  await loadMarketIndex(sb);
  const { data, error } = await sb
    .from("deals")
    .select("*")
    .eq("active", true)
    .in("model", STUBS);
  if (error) throw error;
  console.log(`stub-model deals: ${data?.length ?? 0}`);

  let fixed = 0,
    toComps = 0;
  for (const row of data || []) {
    const newModel = extractModel(row.title, row.make);
    if (!newModel || newModel === row.model || !newModel.includes(" ")) continue;
    const updated = { ...row, model: newModel };
    const a = analyzeDeal(updated);
    const before = row.deal_analysis?.sellBasis;
    const after = a.sellBasis;
    if (before === "baseline" && (after === "comps" || after === "market"))
      toComps++;
    const { error: upErr } = await sb
      .from("deals")
      .update({
        model: newModel,
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
        },
      })
      .eq("id", row.id);
    if (!upErr) fixed++;
  }
  console.log(`DONE: model-fixed ${fixed}, moved baseline→comps ${toComps}`);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
