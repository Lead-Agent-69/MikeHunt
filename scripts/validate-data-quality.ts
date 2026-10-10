// Data Quality Validation Script
// Run with: npx tsx scripts/validate-data-quality.ts

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function validateDataQuality() {
  console.log("🔍 Starting Data Quality Validation...\n");

  // 1. Deals with missing critical fields
  console.log("1. Checking for deals with missing critical fields...");
  const { data: missingCritical, error: error1 } = await supabase
    .from("deals")
    .select("id")
    .eq("active", true)
    .or("year.is.null,make.is.null,model.is.null,ask_price.is.null");

  if (error1) {
    console.error("   ❌ Error:", error1.message);
  } else {
    const count = missingCritical?.length || 0;
    const percentage = count > 0 ? ((count / 1000) * 100).toFixed(2) : 0;
    console.log(
      `   ${count < 10 ? "✅" : "⚠️"} ${count} deals missing critical fields (${percentage}%)`,
    );
  }

  // 2. Deals with unrealistic prices
  console.log("\n2. Checking for deals with unrealistic prices...");
  const { data: unrealisticPrices, error: error2 } = await supabase
    .from("deals")
    .select("id, year, make, model, ask_price, sell_estimate")
    .eq("active", true)
    .or("ask_price.lt.500,ask_price.gt.200000")
    .limit(10);

  if (error2) {
    console.error("   ❌ Error:", error2.message);
  } else {
    const count = unrealisticPrices?.length || 0;
    console.log(
      `   ${count === 0 ? "✅" : "⚠️"} ${count} deals with unrealistic prices`,
    );
    if (count > 0 && unrealisticPrices) {
      unrealisticPrices.forEach((deal) => {
        console.log(
          `      - ${deal.year} ${deal.make} ${deal.model}: $${deal.ask_price}`,
        );
      });
    }
  }

  // 3. Deals with broken profit calculations
  console.log("\n3. Checking for GO deals with negative profit...");
  const { data: brokenProfit, error: error3 } = await supabase
    .from("deals")
    .select("id, year, make, model, ask_price, sell_estimate, true_net_profit")
    .eq("active", true)
    .eq("deal_verdict", "go")
    .lt("true_net_profit", 0)
    .limit(10);

  if (error3) {
    console.error("   ❌ Error:", error3.message);
  } else {
    const count = brokenProfit?.length || 0;
    console.log(
      `   ${count === 0 ? "✅" : "❌"} ${count} GO deals with negative profit`,
    );
    if (count > 0 && brokenProfit) {
      brokenProfit.forEach((deal) => {
        console.log(
          `      - ${deal.year} ${deal.make} ${deal.model}: profit $${deal.true_net_profit}`,
        );
      });
    }
  }

  // 4. Image loading test (check for null/empty images)
  console.log("\n4. Checking for deals without images...");
  const { data: noImages, error: error4 } = await supabase
    .from("deals")
    .select("id")
    .eq("active", true)
    .or("images.is.null,images.eq.{}")
    .limit(10);

  if (error4) {
    console.error("   ❌ Error:", error4.message);
  } else {
    const count = noImages?.length || 0;
    console.log(`   ${count < 50 ? "✅" : "⚠️"} ${count} deals without images`);
  }

  // 5. Geographic data
  console.log("\n5. Checking geographic data coverage...");
  const { data: geoData, error: error5 } = await supabase
    .from("deals")
    .select("location_state")
    .eq("active", true);

  if (error5) {
    console.error("   ❌ Error:", error5.message);
  } else {
    const totalDeals = geoData?.length || 0;
    const stateCounts = new Map<string, number>();
    let geocodedCount = 0;

    geoData?.forEach((deal) => {
      if (deal.location_state) {
        stateCounts.set(
          deal.location_state,
          (stateCounts.get(deal.location_state) || 0) + 1,
        );
      }
    });

    // Count deals with lat/lng (geocoded)
    const { data: geocoded } = await supabase
      .from("deals")
      .select("id")
      .eq("active", true)
      .not("lat", "is", null)
      .not("lng", "is", null);

    geocodedCount = geocoded?.length || 0;

    console.log(`   ✅ ${totalDeals} total active deals`);
    console.log(
      `   ✅ ${geocodedCount} geocoded (${((geocodedCount / totalDeals) * 100).toFixed(1)}%)`,
    );
    console.log(`   ✅ ${stateCounts.size} states represented`);

    // Top 5 states
    const topStates = Array.from(stateCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    console.log("   Top states:");
    topStates.forEach(([state, count]) => {
      console.log(`      - ${state}: ${count} deals`);
    });
  }

  // 6. Active deals by source
  console.log("\n6. Checking deal volume by source...");
  const { data: sourceData, error: error6 } = await supabase
    .from("deals")
    .select("source")
    .eq("active", true);

  if (error6) {
    console.error("   ❌ Error:", error6.message);
  } else {
    const sourceCounts = new Map<string, number>();
    sourceData?.forEach((deal) => {
      sourceCounts.set(deal.source, (sourceCounts.get(deal.source) || 0) + 1);
    });

    console.log("   Active deals by source:");
    Array.from(sourceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([source, count]) => {
        console.log(`      - ${source}: ${count} deals`);
      });
  }

  // 7. Verdict distribution
  console.log("\n7. Checking verdict distribution...");
  const { data: verdictData, error: error7 } = await supabase
    .from("deals")
    .select("deal_verdict")
    .eq("active", true);

  if (error7) {
    console.error("   ❌ Error:", error7.message);
  } else {
    const verdictCounts = new Map<string, number>();
    verdictData?.forEach((deal) => {
      const verdict = deal.deal_verdict || "unknown";
      verdictCounts.set(verdict, (verdictCounts.get(verdict) || 0) + 1);
    });

    console.log("   Verdict distribution:");
    Array.from(verdictCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([verdict, count]) => {
        const percentage = ((count / (verdictData?.length || 1)) * 100).toFixed(
          1,
        );
        console.log(`      - ${verdict}: ${count} (${percentage}%)`);
      });
  }

  console.log("\n✅ Data Quality Validation Complete");
}

validateDataQuality().catch(console.error);
