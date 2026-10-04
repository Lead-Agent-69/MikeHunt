// scripts/valuation-backtest.ts
//
// In-sample asking-price proxy regression check, NOT transaction accuracy.
// The live index includes these listings. The 7% haircut is an assumption, not a sale outcome.
//
// Run: npx tsx scripts/valuation-backtest.ts

import * as dotenv from "dotenv";
import path from "path";
import { requireProxySample } from "../lib/scoring/proxy-sample";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const RETAIL = new Set([
  "cars_com",
  "carvana",
  "autotrader",
  "truecar",
  "cargurus",
]);

async function main() {
  const { createServerComponentClient } = await import("../lib/supabase");
  const mv = await import("../lib/scoring/market-value");
  const { analyzeDeal } = await import("../lib/scoring/deal-analyzer");
  const sb = createServerComponentClient();

  // Pull a big slice of real retail listings with mileage + price (clean only).
  const rows: any[] = [];
  for (let from = 0; from < 60000; from += 1000) {
    const { data, error } = await sb
      .from("deals")
      .select(
        "make, model, year, mileage, ask_price, condition, source, trim, title",
      )
      .eq("active", true)
      .in("source", Array.from(RETAIL))
      .gt("ask_price", 2000)
      .lt("ask_price", 90000)
      .gt("mileage", 0)
      .range(from, from + 999);
    if (error)
      throw new Error(`Retail benchmark query failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`retail listings with mileage: ${rows.length}`);

  await mv.loadMarketIndex(sb);
  // Sampling does not make this held-out: all rows may be in the live index.
  const test = rows.filter((_, i) => i % 5 === 0);

  const abs: number[] = [];
  const signed: number[] = [];
  let scored = 0;
  for (const d of test) {
    const a = analyzeDeal(d as any);
    if (
      !Number.isFinite(a.sellEstimate) ||
      a.sellEstimate <= 0 ||
      a.sellBasis === "baseline"
    )
      continue;
    // Proxy reference only; no confirmed sale is observed here.
    const truth = d.ask_price * 0.93;
    if (!Number.isFinite(truth) || truth <= 0) continue;
    const e = (a.sellEstimate - truth) / truth;
    abs.push(Math.abs(e));
    signed.push(e);
    scored++;
  }
  requireProxySample(abs);
  abs.sort((a, b) => a - b);
  signed.sort((a, b) => a - b);
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / (x.length || 1);
  const at = (x: number[], p: number) => x[Math.floor(x.length * p)] ?? 0;
  const within = (t: number) =>
    abs.filter((v) => v <= t).length / (abs.length || 1);

  console.log(
    `\n=== In-sample asking-price proxy (${scored} sampled cars) ===`,
  );
  console.log(
    `  Proxy MAPE:         ${(mean(abs) * 100).toFixed(1)}%   [not transaction accuracy]`,
  );
  console.log(`  Median abs err:     ${(at(abs, 0.5) * 100).toFixed(1)}%`);
  console.log(
    `  Bias (median):      ${(at(signed, 0.5) * 100).toFixed(1)}%  (+ = over-value)`,
  );
  console.log(`  Within 10%:         ${(within(0.1) * 100).toFixed(0)}%`);
  console.log(`  Within 20%:         ${(within(0.2) * 100).toFixed(0)}%`);
  console.log(`  Within 30%:         ${(within(0.3) * 100).toFixed(0)}%`);

  // ── Salvage segment (Copart) ──────────────────────────────────────────────
  // No clean salvage-SOLD ground truth exists free, and Copart's payload has no odometer — so we can't
  // compute a true MAPE here. Instead we sanity-check the DISTRIBUTION: a healthy salvage book is
  // conservative (most lots PASS — sell estimate below the ACV/bid ask), with few wild over-values.
  const cp: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await sb
      .from("deals")
      .select(
        "year, make, model, mileage, ask_price, condition, damage_type, source",
      )
      .eq("source", "copart")
      .eq("active", true)
      .gt("ask_price", 1000)
      .range(from, from + 999);
    if (error)
      throw new Error(`Salvage benchmark query failed: ${error.message}`);
    if (!data?.length) break;
    cp.push(...data);
    if (data.length < 1000) break;
  }
  const ratios: number[] = [];
  let over2x = 0;
  for (const d of cp) {
    const a = analyzeDeal(d as any);
    if (!a.sellEstimate || !d.ask_price) continue;
    const r = a.sellEstimate / d.ask_price;
    ratios.push(r);
    if (r > 2) over2x++;
  }
  ratios.sort((a, b) => a - b);
  console.log(`\n=== Salvage segment (Copart, ${ratios.length} lots) ===`);
  console.log(
    `  Median estimate/listed price: ${ratios.length ? at(ratios, 0.5).toFixed(2) : "unavailable"} (not a profit or quality measure)`,
  );
  console.log(
    `  Sell > 2× ask:      ${over2x} (${((over2x / (ratios.length || 1)) * 100).toFixed(1)}%)  (watch for over-value)`,
  );
  console.log(
    `  NOTE: Copart has no odometer; unknown-mileage lots now assume age wear (not pristine).`,
  );

  const mapeVal = mean(abs) * 100;
  if (mapeVal > 15) {
    console.error(
      `\n❌ Error: MAPE is ${mapeVal.toFixed(1)}%, which exceeds the 15% regression threshold!`,
    );
    process.exit(1);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
