// Authoritative make/model/year via free NHTSA vPIC VIN decode — the intelligent fix for mangled
// title-parsed models. Targets baseline-tail deals that HAVE a VIN: decode (batch), overwrite
// make/model/year with the canonical truth, re-value. Moves a big chunk from offline-baseline to real
// comps. $0 (public gov API). Run: npx tsx scripts/vin-enrich.ts [limit]
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { decodeVinBatch } from "../lib/vehicle/nhtsa";
import { titleCaseMake, canonicalModel } from "../lib/vehicle/canonical";
import { analyzeDeal } from "../lib/scoring/deal-analyzer";
import { loadMarketIndex } from "../lib/scoring/market-value";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const limit = parseInt(process.argv[2] || "2000", 10);
  await loadMarketIndex(sb);
  const { data, error } = await sb
    .from("deals")
    .select("*")
    .eq("active", true)
    .eq("deal_analysis->>sellBasis", "baseline")
    .not("vin", "is", null)
    .limit(limit);
  if (error) throw error;
  const deals = data || [];
  console.log(`baseline-tail deals with VIN: ${deals.length}`);

  const decodes = await decodeVinBatch(deals.map((d) => d.vin));
  console.log(`vPIC resolved ${decodes.size} VINs`);

  let updated = 0,
    toComps = 0,
    modelChanged = 0;
  for (const row of deals) {
    const d = decodes.get(String(row.vin).toUpperCase());
    if (!d || !d.make || !d.model) continue;
    const make = titleCaseMake(d.make);
    const model = canonicalModel(d.model);
    const year = d.year && d.year > 1980 ? d.year : row.year;
    if (!make || !model) continue;
    if (model.toLowerCase() !== String(row.model || "").toLowerCase())
      modelChanged++;
    const merged = { ...row, make, model, year };
    const a = analyzeDeal(merged);
    if (a.sellBasis === "comps" || a.sellBasis === "market") toComps++;
    const { error: upErr } = await sb
      .from("deals")
      .update({
        make,
        model,
        year,
        trim: row.trim || d.trim || null,
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
          vinDecoded: true,
        },
      })
      .eq("id", row.id);
    if (!upErr) updated++;
  }
  console.log(
    `DONE: decoded+updated ${updated}, model corrected ${modelChanged}, moved to real comps ${toComps}`,
  );
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
