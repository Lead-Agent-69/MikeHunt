// lib/alerts/price-tracker.ts
// ─── Price tracking system for alert notifications ────────────────────────────

import { createServerComponentClient } from "@/lib/supabase";

export interface PriceHistory {
  deal_id: string;
  price: number;
  observed_at: string;
}

export interface PriceChange {
  vehicle_id: string;
  source_deal_id: string;
  title: string;
  old_price: number;
  new_price: number;
  price_drop: number;
  price_drop_percent: number;
  source_url: string;
}

/**
 * Track price changes for vehicles
 * Call this after each scrape to detect price drops
 */
export async function trackPriceChanges(
  vehicleIds?: string[],
): Promise<PriceChange[]> {
  const supabase = createServerComponentClient();
  const priceChanges: PriceChange[] = [];

  try {
    // Get current deals with prices. PostgREST caps a single response at ~1000 rows; during a scrape far
    // more than 1000 deals are updated in 24h, so a plain select would only check the newest 1000 for
    // price drops and miss the rest. Paginate with .range() to cover them all.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const PAGE = 1000;
    const MAX = 60000;
    const vehicles: Array<{
      id: string;
      source_deal_id?: string;
      title?: string;
      ask_price: number;
      source_url?: string;
      updated_at?: string;
    }> = [];
    for (let from = 0; from < MAX; from += PAGE) {
      let query = supabase
        .from("deals")
        .select("id, source_deal_id, title, ask_price, source_url, updated_at")
        .not("ask_price", "is", null)
        .order("updated_at", { ascending: false })
        .range(from, from + PAGE - 1);
      query =
        vehicleIds && vehicleIds.length > 0
          ? query.in("id", vehicleIds)
          : query.gte("updated_at", yesterday.toISOString());
      const { data: page, error } = await query;
      if (error) {
        console.error("[PriceTracker] Error fetching vehicles:", error);
        if (vehicles.length === 0) return [];
        break;
      }
      if (!page || page.length === 0) break;
      vehicles.push(...(page as typeof vehicles));
      if (page.length < PAGE) break;
    }

    if (vehicles.length === 0) {
      return [];
    }

    // Check each vehicle for price changes
    for (const vehicle of vehicles) {
      const priceHistory = await getPriceHistory(vehicle.id);

      if (priceHistory.length >= 2) {
        // Compare current price with previous price
        const currentPrice = vehicle.ask_price;
        const previousPrice = priceHistory[priceHistory.length - 2].price;

        if (currentPrice < previousPrice) {
          const priceDrop = previousPrice - currentPrice;
          const priceDropPercent = (priceDrop / previousPrice) * 100;

          // Only track significant price drops (>= 5% or >= $500)
          if (priceDropPercent >= 5 || priceDrop >= 500) {
            priceChanges.push({
              vehicle_id: vehicle.id,
              source_deal_id: vehicle.source_deal_id || "",
              title: vehicle.title || "",
              old_price: previousPrice,
              new_price: currentPrice,
              price_drop: priceDrop,
              price_drop_percent: priceDropPercent,
              source_url: vehicle.source_url || "",
            });
          }
        }
      }

      // Record current price in history
      await recordPriceHistory(vehicle.id, vehicle.ask_price);
    }

    console.log(`[PriceTracker] Found ${priceChanges.length} price drops`);
    return priceChanges;
  } catch (error) {
    console.error("[PriceTracker] Error tracking price changes:", error);
    return [];
  }
}

/**
 * Get price history for a vehicle
 */
export async function getPriceHistory(
  vehicleId: string,
  limit = 10,
): Promise<PriceHistory[]> {
  const supabase = createServerComponentClient();

  try {
    const { data, error } = await supabase
      .from("price_history")
      .select("deal_id, price, observed_at")
      .eq("deal_id", vehicleId)
      .order("observed_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[PriceTracker] Error fetching price history:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("[PriceTracker] Error in getPriceHistory:", error);
    return [];
  }
}

/**
 * Record a price point in history
 */
export async function recordPriceHistory(
  vehicleId: string,
  price: number,
): Promise<void> {
  const supabase = createServerComponentClient();

  try {
    // Check if we already have a recent price record (within last hour)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const { data: recentRecords } = await supabase
      .from("price_history")
      .select("id")
      .eq("deal_id", vehicleId)
      .gte("observed_at", oneHourAgo.toISOString())
      .limit(1);

    // Only record if no recent record exists
    if (!recentRecords || recentRecords.length === 0) {
      const { error } = await supabase.from("price_history").insert({
        deal_id: vehicleId,
        price,
        observed_at: new Date().toISOString(),
      });

      if (error) {
        console.error("[PriceTracker] Error recording price history:", error);
      }
    }
  } catch (error) {
    console.error("[PriceTracker] Error in recordPriceHistory:", error);
  }
}

/**
 * Clean up old price history (keep last 30 days)
 */
export async function cleanupOldPriceHistory(): Promise<number> {
  const supabase = createServerComponentClient();

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await supabase
      .from("price_history")
      .delete()
      .lt("observed_at", thirtyDaysAgo.toISOString())
      .select("id");

    if (error) {
      console.error("[PriceTracker] Error cleaning up price history:", error);
      return 0;
    }

    const deletedCount = data?.length || 0;
    console.log(`[PriceTracker] Cleaned up ${deletedCount} old price records`);
    return deletedCount;
  } catch (error) {
    console.error("[PriceTracker] Error in cleanupOldPriceHistory:", error);
    return 0;
  }
}

/**
 * Get price trend for a vehicle (up, down, stable)
 */
export async function getPriceTrend(
  vehicleId: string,
): Promise<"up" | "down" | "stable"> {
  const history = await getPriceHistory(vehicleId, 5);

  if (history.length < 2) {
    return "stable";
  }

  const prices = history.map((h) => h.price).reverse(); // Oldest to newest

  // Calculate average change
  let totalChange = 0;
  for (let i = 1; i < prices.length; i++) {
    totalChange += prices[i] - prices[i - 1];
  }

  const avgChange = totalChange / (prices.length - 1);

  if (avgChange > 100) return "up";
  if (avgChange < -100) return "down";
  return "stable";
}

/**
 * Get vehicles with recent price drops for alert matching
 */
export async function getRecentPriceDrops(
  minDropPercent = 10,
  hoursAgo = 24,
): Promise<PriceChange[]> {
  const supabase = createServerComponentClient();

  try {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hoursAgo);

    // Get recently updated deals
    const { data: vehicles, error } = await supabase
      .from("deals")
      .select("id, source_deal_id, title, ask_price, source_url, updated_at")
      .not("ask_price", "is", null)
      .gte("updated_at", cutoffTime.toISOString())
      .order("updated_at", { ascending: false });

    if (error || !vehicles) {
      return [];
    }

    const priceDrops: PriceChange[] = [];

    for (const vehicle of vehicles) {
      const history = await getPriceHistory(vehicle.id, 2);

      if (history.length >= 2) {
        const currentPrice = history[0].price;
        const previousPrice = history[1].price;

        if (currentPrice < previousPrice) {
          const priceDrop = previousPrice - currentPrice;
          const priceDropPercent = (priceDrop / previousPrice) * 100;

          if (priceDropPercent >= minDropPercent) {
            priceDrops.push({
              vehicle_id: vehicle.id,
              source_deal_id: vehicle.source_deal_id || "",
              title: vehicle.title || "",
              old_price: previousPrice,
              new_price: currentPrice,
              price_drop: priceDrop,
              price_drop_percent: priceDropPercent,
              source_url: vehicle.source_url || "",
            });
          }
        }
      }
    }

    return priceDrops;
  } catch (error) {
    console.error("[PriceTracker] Error getting recent price drops:", error);
    return [];
  }
}
