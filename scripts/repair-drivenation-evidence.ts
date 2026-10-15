import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { load } from "cheerio";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { politeFetch } from "../lib/scrapers/polite/polite-fetch";
import {
  dealerDetailAllInPrice,
  dealerDetailField,
  dealerDetailMileage,
} from "../lib/scrapers/platforms/dealer-detail";
import { titleBrand } from "../lib/scrapers/platforms/dealer-cms";
import { isValidVin } from "../lib/vehicle/vin";
import {
  driveNationCorrection,
  type DealerCorrectionEvidence,
} from "../lib/data-quality/dealer-correction";

async function main() {
  config({
    path: process.env.REPAIR_ENV_FILE || ".env.local.scraper",
    quiet: true,
    override: true,
  });
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (new URL(url).hostname !== "qupzqpezslsbobhugswp.supabase.co")
    throw new Error("Unexpected project; no writes allowed");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Server configuration required");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const apply = process.argv.includes("--apply");
  const receiptPath = resolve(
    process.env.REPAIR_RECEIPT || "artifacts/drivenation-evidence-plan.json",
  );
  if (apply) {
    const plan = JSON.parse(await readFile(receiptPath, "utf8"));
    const age = Date.now() - Date.parse(plan.createdAt);
    if (
      plan.version !== 1 ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > 30 * 60_000 ||
      !Array.isArray(plan.rows) ||
      plan.rows.length > 30
    )
      throw new Error("A fresh, bounded dry-run receipt is required");
    let updated = 0;
    for (const item of plan.rows) {
      const patch = driveNationCorrection(item.before, item.evidence);
      const result = await db
        .from("deals")
        .update(patch)
        .eq("id", item.before.id)
        .eq("source", "independent_dealer")
        .eq("source_url", item.before.source_url)
        .eq("updated_at", item.before.updated_at)
        .select("id,ask_price,mileage,deal_verdict,sell_estimate");
      if (result.error || result.data?.length !== 1)
        throw new Error(
          `Correction not confirmed for ${item.before.id}; stop and inspect`,
        );
      if (
        result.data[0].ask_price !== patch.ask_price ||
        result.data[0].mileage !== patch.mileage ||
        result.data[0].sell_estimate !== null
      )
        throw new Error("Correction read-back did not match");
      updated++;
    }
    await writeFile(
      `${receiptPath}.applied.json`,
      JSON.stringify({ appliedAt: new Date().toISOString(), updated }, null, 2),
    );
    console.log(JSON.stringify({ mode: "apply", updated, receiptPath }));
    return;
  }
  const result = await db
    .from("deals")
    .select(
      "id,title,year,make,model,vin,source,source_url,ask_price,mileage,damage_type,options,updated_at,condition,sell_estimate,true_net_profit,recommended_max_bid,profit_score,deal_verdict,is_arbitrage_opportunity,ai_retail_estimate,ai_wholesale_estimate,ai_rationale,pricing_breakdown,deal_analysis,last_seen_at",
    )
    .eq("source", "independent_dealer")
    .like("source_url", "https://www.drivenation.com/vehiclesDetail.php?%")
    .order("id")
    .limit(31);
  if (result.error) throw result.error;
  if ((result.data?.length || 0) > 30)
    throw new Error("Repair exceeds 30-row bound");
  const rows = [];
  for (const row of result.data || []) {
    const response = await politeFetch(row.source_url);
    if (!response.ok)
      throw new Error(
        `Source unavailable for ${row.id}; no apply plan created`,
      );
    const $ = load(response.body);
    $("script,style,noscript").remove();
    const text = $.root().text().replace(/\s+/g, " ");
    const askingPrice = dealerDetailAllInPrice(text);
    const mileage = dealerDetailMileage($);
    const vin = dealerDetailField($, "VIN") || "";
    const condition = titleBrand(dealerDetailField($, "Title") || "");
    if (
      !isValidVin(vin) ||
      askingPrice === undefined ||
      mileage === undefined ||
      !["clean_title", "rebuilt_title", "salvage_title"].includes(
        condition || "",
      ) ||
      !text.toLowerCase().includes(`${row.year} ${row.make}`.toLowerCase())
    )
      throw new Error(
        `Incomplete or mismatched evidence for ${row.id}; no apply plan created`,
      );
    const evidence: DealerCorrectionEvidence = {
      sourceUrl: row.source_url,
      askingPrice,
      mileage,
      vin,
      condition: condition as DealerCorrectionEvidence["condition"],
      checkedAt: new Date().toISOString(),
    };
    driveNationCorrection(row, evidence);
    rows.push({ before: row, evidence });
    console.log(
      JSON.stringify({
        id: row.id,
        before: { price: row.ask_price, mileage: row.mileage },
        after: { price: askingPrice, mileage },
      }),
    );
  }
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(
    receiptPath,
    JSON.stringify(
      { version: 1, createdAt: new Date().toISOString(), rows },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ mode: "dry-run", verified: rows.length, receiptPath }),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
