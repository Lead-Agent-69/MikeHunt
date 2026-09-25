import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
);

// We assume the Next.js API is running on localhost:3000 locally,
// or use a direct function call if we don't want to rely on the HTTP server.
const API_BASE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/**
 * The Profit Pipeline
 * Layer 2 Enrichment: Grabs raw scraped vehicles, decodes VIN, calculates profit score, and gives a verdict.
 */
export async function runPipeline() {
  console.log("[PIPELINE] Starting Deal Analysis Pipeline...");

  try {
    // 1. Fetch raw deals that haven't been scored yet
    const { data: vehicles, error } = await supabase
      .from("deals")
      .select("*")
      .is("profit_score", null)
      .limit(50);

    if (error) throw error;
    if (!vehicles || vehicles.length === 0) {
      console.log("[PIPELINE] No new vehicles to process.");
      return;
    }

    console.log(`[PIPELINE] Processing ${vehicles.length} new vehicles...`);

    for (const vehicle of vehicles) {
      console.log(
        `[PIPELINE] Analyzing ${vehicle.make} ${vehicle.model} (${vehicle.vin})`,
      );

      let enrichedMake = vehicle.make;
      let enrichedModel = vehicle.model;
      let enrichedYear = vehicle.year;

      // 2. Decode VIN if we have a real one
      if (
        vehicle.vin &&
        vehicle.vin.length > 10 &&
        !vehicle.vin.startsWith("CL")
      ) {
        try {
          // Call our own API route
          const vinRes = await axios.get(`${API_BASE}/api/vin/${vehicle.vin}`);
          if (vinRes.data && vinRes.data.make) {
            enrichedMake = vinRes.data.make;
            enrichedModel = vinRes.data.model;
            enrichedYear = parseInt(vinRes.data.year) || vehicle.year;
          }
        } catch (e: any) {
          console.warn(
            `[PIPELINE] VIN decode failed for ${vehicle.vin}:`,
            e.message,
          );
        }
      }

      // 3. Calculate Profit Score (The Core Algo)
      // For this implementation, we use a heuristic mock of the North Star math:
      // Real formula: (Market Value) - (Ask Price + Transport + Recon + Auction Fee) = Net Profit
      // Since we don't have a real MMR API connected yet, we generate a plausible Market Value.
      const baseValue = enrichedYear * 100 + enrichedMake.length * 500;
      const mockMmr =
        vehicle.ask_price > 0 ? vehicle.ask_price * 1.4 : baseValue;

      // Assumed defaults based on dealer profile
      const transportCost = 450;
      const reconCost = 800;
      const auctionFee = vehicle.source === "Craigslist" ? 0 : 500;

      const totalCost =
        vehicle.ask_price + transportCost + reconCost + auctionFee;
      const netProfit = mockMmr - totalCost;

      // Map netProfit to a 0-100 score
      // A $3000+ profit is a 95+ score.
      let score = 50;
      if (netProfit > 3000) score = 95;
      else if (netProfit > 2000) score = 85;
      else if (netProfit > 1000) score = 70;
      else if (netProfit > 0) score = 55;
      else score = 20;

      // 4. Determine Verdict
      let verdict = "PASS";
      if (score >= 85) verdict = "GO";
      else if (score >= 65) verdict = "HOLD";

      // 5. Update Database
      const { error: updateError } = await supabase
        .from("deals")
        .update({
          make: enrichedMake,
          model: enrichedModel,
          year: enrichedYear,
          mmr_value: mockMmr,
          profit_score: score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", vehicle.id);

      if (updateError) {
        console.error(
          `[PIPELINE] Failed to update ${vehicle.id}:`,
          updateError.message,
        );
      } else {
        console.log(
          `[PIPELINE] ${verdict} - Score: ${score} - Est. Profit: $${Math.round(netProfit)}`,
        );

        // Trigger alert matching
        await matchAlertsForDeal({
          id: vehicle.id,
          make: enrichedMake,
          model: enrichedModel,
          ask_price: vehicle.ask_price,
          profit_estimate: netProfit,
          location_state: vehicle.location_state,
        });
      }
    }

    console.log("[PIPELINE] Pipeline Run Complete.");
  } catch (err: any) {
    console.error("[PIPELINE] Fatal Error:", err.message);
  }
}

async function matchAlertsForDeal(deal: {
  id: string;
  make: string;
  model: string;
  ask_price: number;
  profit_estimate: number;
  location_state?: string;
}) {
  console.log(
    `[ALERT-ENGINE] Checking alerts for deal ${deal.id} (${deal.make} ${deal.model})...`,
  );

  try {
    let query = supabase.from("alerts").select("*").eq("active", true);

    if (deal.make) {
      query = query.or(`make.ilike.%${deal.make}%,make.is.null`);
    }

    const { data: alerts, error } = await query;
    if (error) throw error;
    if (!alerts || alerts.length === 0) return;

    for (const alert of alerts) {
      if (
        alert.model &&
        deal.model &&
        !deal.model.toLowerCase().includes(alert.model.toLowerCase())
      ) {
        continue;
      }

      if (
        alert.max_price &&
        deal.ask_price &&
        deal.ask_price > Number(alert.max_price)
      ) {
        continue;
      }

      if (
        alert.min_profit &&
        deal.profit_estimate &&
        deal.profit_estimate < Number(alert.min_profit)
      ) {
        continue;
      }

      if (
        alert.target_states &&
        alert.target_states.length > 0 &&
        deal.location_state
      ) {
        const states = alert.target_states.map((s: string) => s.toUpperCase());
        if (!states.includes(deal.location_state.toUpperCase())) {
          continue;
        }
      }

      // Match found! Check for existing match first to avoid duplicates
      const { data: existing } = await supabase
        .from("alert_matches")
        .select("id")
        .eq("alert_id", alert.id)
        .eq("deal_id", deal.id)
        .maybeSingle();

      if (existing) continue;

      const { error: insertErr } = await supabase.from("alert_matches").insert({
        alert_id: alert.id,
        deal_id: deal.id,
        is_read: false,
        matched_at: new Date().toISOString(),
      });

      if (insertErr) {
        console.error(
          `[ALERT-ENGINE] Error creating match:`,
          insertErr.message,
        );
      } else {
        console.log(
          `[ALERT-ENGINE] MATCH FOUND! Alert matched for dealer ${alert.dealer_id} on deal ${deal.id}`,
        );
      }
    }
  } catch (err: any) {
    console.error(`[ALERT-ENGINE] Match error:`, err.message);
  }
}

if (require.main === module) {
  runPipeline();
}
