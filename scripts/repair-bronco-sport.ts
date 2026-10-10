import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { broncoSportIdentity } from "../lib/vehicle/bronco-sport-identity";
import { analyzeDeal } from "../lib/scoring/deal-analyzer";
import { loadMarketIndex } from "../lib/scoring/market-value";

config({ path: ".env.local", quiet: true });

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are required");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("deals")
    .select("*")
    .eq("active", true)
    .ilike("make", "Ford")
    .ilike("model", "Bronco")
    .ilike("title", "%Ford Bronco Sport%")
    .gte("year", 2021)
    .order("id")
    .limit(200);
  if (error) throw error;
  const candidates = (data || []).flatMap((row) => {
    const repair = broncoSportIdentity(row);
    return repair ? [{ row, repair }] : [];
  });
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        scanned: data?.length || 0,
        candidates: candidates.length,
        sample: candidates.slice(0, 5).map(({ row, repair }) => ({
          id: row.id,
          title: row.title,
          before: { model: row.model, trim: row.trim },
          after: repair,
        })),
      },
      null,
      2,
    ),
  );
  if (!apply || !candidates.length) return;

  // Correct-model comps only: don't let the old Bronco grouping price the repaired vehicle.
  await loadMarketIndex(sb);
  let updated = 0;
  for (const { row, repair } of candidates) {
    const analysis = analyzeDeal({ ...row, ...repair });
    const patch = {
      ...repair,
      sell_estimate: analysis.sellEstimate,
      recommended_max_bid: analysis.recommendedMaxBid,
      true_net_profit: analysis.profit,
      profit_score: analysis.score,
      deal_verdict: analysis.verdict,
      is_arbitrage_opportunity: analysis.verdict === "go",
      deal_analysis: {
        ...(row.deal_analysis || {}),
        roi: Math.round(analysis.roi * 10) / 10,
        profitMargin: Math.round(analysis.profitMargin * 10) / 10,
        breakEvenDay: analysis.breakEvenDay,
        sellBasis: analysis.sellBasis,
        transportMiles: analysis.miles,
        costs: {
          acquisition: analysis.acquisitionCost,
          repair: analysis.repairCost,
          transport: analysis.transportCost,
          holding: analysis.holdingCost,
          selling: analysis.sellingCost,
          total: analysis.totalCost,
        },
        scoreBreakdown: analysis.scoreBreakdown,
        warnings: analysis.warnings,
        recommendations: analysis.recommendations,
        priceImplausible: analysis.priceImplausible,
        priceSanity: analysis.priceSanity,
        inferredPrice: analysis.inferredPrice ?? null,
        conditionTag: analysis.conditionTag,
        soldAnchored: analysis.soldAnchored,
        valuation: analysis.valuation,
        prediction: analysis.prediction,
      },
      updated_at: new Date().toISOString(),
    };
    let query = sb
      .from("deals")
      .update(patch)
      .eq("id", row.id)
      .eq("active", true)
      .eq("model", row.model)
      .eq("title", row.title)
      .eq("year", row.year);
    if (row.updated_at) query = query.eq("updated_at", row.updated_at);
    query =
      row.trim == null ? query.is("trim", null) : query.eq("trim", row.trim);
    const { data: changed, error: updateError } = await query.select("id");
    if (updateError) throw updateError;
    updated += changed?.length || 0;
  }
  console.log(
    JSON.stringify({
      updated,
      skippedConcurrentChanges: candidates.length - updated,
    }),
  );
  if (updated) {
    const { data: verified, error: verifyError } = await sb
      .from("deals")
      .select("id,model,trim")
      .in(
        "id",
        candidates.map(({ row }) => row.id),
      );
    if (verifyError) throw verifyError;
    console.log(
      JSON.stringify({
        verifiedCorrectModel:
          verified?.filter((row) => row.model === "Bronco Sport").length || 0,
      }),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
