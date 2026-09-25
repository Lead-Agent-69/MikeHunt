// lib/scoring/market-intelligence.ts
// ─── Market Intelligence Layer for Smart Deal Scoring ─────────────────────────

import { createServerComponentClient } from "@/lib/supabase";

export interface MarketTrend {
  make: string;
  model: string;
  avg_price: number;
  avg_days_to_sell: number;
  demand_score: number;
  supply_count: number;
  recorded_at: string;
}

export interface MarketIntelligence {
  demandScore: number; // 0-10
  velocityScore: number; // 0-10
  seasonalityScore: number; // 0-5
  competitionScore: number; // 0-5
  insights: string[];
}

/**
 * Analyze market intelligence for a vehicle
 */
export async function analyzeMarketIntelligence(
  make: string,
  model: string,
  price: number,
  state?: string,
): Promise<MarketIntelligence> {
  const insights: string[] = [];

  // Get historical trends
  const trends = await getMarketTrends(make, model);
  const currentSupply = await getCurrentSupply(make, model, state);
  const seasonality = calculateSeasonality(make, model);

  // 1. Demand Score (0-10) - Based on days-to-sell
  let demandScore = 5; // Default
  if (trends.length > 0) {
    const avgDays = trends[0].avg_days_to_sell;
    if (avgDays <= 7) {
      demandScore = 10;
      insights.push("🔥 High demand - sells in under a week");
    } else if (avgDays <= 14) {
      demandScore = 8;
      insights.push("✅ Good demand - sells within 2 weeks");
    } else if (avgDays <= 21) {
      demandScore = 6;
      insights.push("📊 Moderate demand - sells within 3 weeks");
    } else if (avgDays <= 30) {
      demandScore = 4;
      insights.push("⏳ Slower demand - may take a month");
    } else {
      demandScore = 2;
      insights.push("⚠️ Low demand - slow-moving vehicle");
    }
  }

  // 2. Velocity Score (0-10) - Based on price trends
  let velocityScore = 5; // Default
  if (trends.length >= 2) {
    const priceChange =
      trends[0].avg_price - trends[trends.length - 1].avg_price;
    const priceChangePercent =
      (priceChange / trends[trends.length - 1].avg_price) * 100;

    if (priceChangePercent > 5) {
      velocityScore = 9;
      insights.push("📈 Appreciating - prices rising");
    } else if (priceChangePercent > 0) {
      velocityScore = 7;
      insights.push("📊 Stable - prices holding");
    } else if (priceChangePercent > -5) {
      velocityScore = 5;
      insights.push("📉 Slight decline - normal depreciation");
    } else if (priceChangePercent > -10) {
      velocityScore = 3;
      insights.push("⚠️ Declining - prices dropping");
    } else {
      velocityScore = 1;
      insights.push("🚨 Rapid decline - avoid unless deep discount");
    }
  }

  // 3. Seasonality Score (0-5)
  const seasonalityScore = seasonality.score;
  if (seasonality.message) {
    insights.push(seasonality.message);
  }

  // 4. Competition Score (0-5) - Based on current supply
  let competitionScore = 3; // Default
  if (currentSupply <= 5) {
    competitionScore = 5;
    insights.push("💎 Low competition - rare find");
  } else if (currentSupply <= 15) {
    competitionScore = 4;
    insights.push("✅ Moderate competition");
  } else if (currentSupply <= 30) {
    competitionScore = 2;
    insights.push("📊 High competition - many similar listings");
  } else {
    competitionScore = 1;
    insights.push("⚠️ Oversaturated - very competitive market");
  }

  return {
    demandScore,
    velocityScore,
    seasonalityScore,
    competitionScore,
    insights,
  };
}

/**
 * Get market trends for a make/model
 */
async function getMarketTrends(
  make: string,
  model: string,
  limit = 4,
): Promise<MarketTrend[]> {
  const supabase = createServerComponentClient();

  try {
    const { data, error } = await supabase
      .from("market_trends")
      .select("*")
      .ilike("make", make)
      .ilike("model", `%${model}%`)
      .order("recorded_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[MarketIntelligence] Error fetching trends:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("[MarketIntelligence] Error in getMarketTrends:", error);
    return [];
  }
}

/**
 * Get current supply count for make/model in market
 */
async function getCurrentSupply(
  make: string,
  model: string,
  state?: string,
): Promise<number> {
  const supabase = createServerComponentClient();

  try {
    // Count recent listings (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let query = supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .ilike("make", make)
      .ilike("model", `%${model}%`)
      .gte("last_scraped_at", sevenDaysAgo.toISOString());

    if (state) {
      query = query.ilike("location_state", state);
    }

    const { count, error } = await query;

    if (error) {
      console.error("[MarketIntelligence] Error counting supply:", error);
      return 20; // Default moderate supply
    }

    return count || 0;
  } catch (error) {
    console.error("[MarketIntelligence] Error in getCurrentSupply:", error);
    return 20;
  }
}

/**
 * Calculate seasonality score based on vehicle type and current month
 */
function calculateSeasonality(
  make: string,
  model: string,
): { score: number; message?: string } {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12

  const makeModel = `${make} ${model}`.toLowerCase();

  // Convertibles - peak in spring/summer
  if (makeModel.includes("convertible") || makeModel.includes("roadster")) {
    if (month >= 4 && month <= 8) {
      return { score: 5, message: "☀️ Peak season for convertibles" };
    } else if (month >= 9 && month <= 11) {
      return {
        score: 2,
        message: "🍂 Off-season for convertibles - good buy opportunity",
      };
    } else {
      return { score: 1, message: "❄️ Winter - convertibles sell slowly" };
    }
  }

  // SUVs/4WD/Trucks - peak in fall/winter
  if (
    makeModel.includes("suv") ||
    makeModel.includes("4wd") ||
    makeModel.includes("awd") ||
    makeModel.includes("truck") ||
    makeModel.includes("tahoe") ||
    makeModel.includes("suburban") ||
    makeModel.includes("explorer") ||
    makeModel.includes("wrangler")
  ) {
    if (month >= 10 || month <= 2) {
      return { score: 5, message: "❄️ Peak season for SUVs/trucks" };
    } else if (month >= 3 && month <= 5) {
      return { score: 3, message: "🌸 Moderate season for SUVs" };
    } else {
      return { score: 2, message: "☀️ Summer - good buy opportunity for SUVs" };
    }
  }

  // Sports cars - peak in spring/summer
  if (
    makeModel.includes("corvette") ||
    makeModel.includes("mustang") ||
    makeModel.includes("camaro") ||
    makeModel.includes("challenger") ||
    makeModel.includes("porsche") ||
    makeModel.includes("ferrari")
  ) {
    if (month >= 4 && month <= 8) {
      return { score: 5, message: "🏁 Peak season for sports cars" };
    } else {
      return { score: 2, message: "❄️ Off-season - good buy opportunity" };
    }
  }

  // Default - no strong seasonality
  return { score: 3 };
}

/**
 * Update market trends (run daily via cron)
 */
export async function updateMarketTrends(): Promise<number> {
  const supabase = createServerComponentClient();

  try {
    // Get aggregated data from vehicles table (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: vehicles, error } = await supabase
      .from("deals")
      .select("make, model, ask_price")
      .gte("last_scraped_at", thirtyDaysAgo.toISOString())
      .not("make", "is", null)
      .not("model", "is", null)
      .not("ask_price", "is", null);

    if (error || !vehicles) {
      console.error("[MarketIntelligence] Error fetching vehicles:", error);
      return 0;
    }

    // Group by make/model and calculate averages
    const grouped = new Map<string, { prices: number[]; count: number }>();

    for (const vehicle of vehicles) {
      const key = `${vehicle.make}|${vehicle.model}`.toLowerCase();
      if (!grouped.has(key)) {
        grouped.set(key, { prices: [], count: 0 });
      }
      const group = grouped.get(key)!;
      group.prices.push(vehicle.ask_price);
      group.count++;
    }

    // Create trend records
    const trends: any[] = [];
    const now = new Date().toISOString();

    for (const [key, data] of Array.from(grouped.entries())) {
      if (data.count < 3) continue; // Skip if too few samples

      const [make, model] = key.split("|");
      const avgPrice =
        data.prices.reduce((a: number, b: number) => a + b, 0) /
        data.prices.length;

      // Estimate days to sell based on price range (simple heuristic)
      let avgDaysToSell = 21; // Default
      if (avgPrice < 10000) avgDaysToSell = 14;
      else if (avgPrice < 20000) avgDaysToSell = 18;
      else if (avgPrice < 30000) avgDaysToSell = 21;
      else if (avgPrice < 50000) avgDaysToSell = 28;
      else avgDaysToSell = 35;

      // Calculate demand score (inverse of days to sell)
      const demandScore = Math.max(
        1,
        Math.min(10, Math.round((30 / avgDaysToSell) * 10)),
      );

      trends.push({
        make,
        model,
        avg_price: Math.round(avgPrice),
        avg_days_to_sell: avgDaysToSell,
        demand_score: demandScore,
        supply_count: data.count,
        recorded_at: now,
      });
    }

    // Insert trends
    if (trends.length > 0) {
      const { error: insertError } = await supabase
        .from("market_trends")
        .insert(trends);

      if (insertError) {
        console.error(
          "[MarketIntelligence] Error inserting trends:",
          insertError,
        );
        return 0;
      }
    }

    console.log(`[MarketIntelligence] Updated ${trends.length} market trends`);
    return trends.length;
  } catch (error) {
    console.error("[MarketIntelligence] Error in updateMarketTrends:", error);
    return 0;
  }
}

/**
 * Get popular makes/models (top 20 by volume)
 */
export async function getPopularVehicles(
  limit = 20,
): Promise<Array<{ make: string; model: string; count: number }>> {
  const supabase = createServerComponentClient();

  try {
    const { data, error } = await supabase
      .from("market_trends")
      .select("make, model, supply_count")
      .order("supply_count", { ascending: false })
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data.map((d) => ({
      make: d.make,
      model: d.model,
      count: d.supply_count,
    }));
  } catch (error) {
    console.error("[MarketIntelligence] Error in getPopularVehicles:", error);
    return [];
  }
}
