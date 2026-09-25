import { chromium } from "playwright";
import { extractVehicleDataFromText } from "../lib/ai/agents/scraper-agent";
import { predictVehicleValuation } from "../lib/ai/agents/valuation-agent";
import { createServerComponentClient } from "../lib/supabase";
import { aiParsingQueue, aiValuationQueue } from "../lib/ai/queue";

// --- 1. PARSING QUEUE ---
aiParsingQueue.process(async (job) => {
  const { sourceUrl, dealerId, source, savedCarId, userId } = job.data;
  console.log(`[AI Worker] Scraping VDP: ${sourceUrl}`);

  let browser;
  let rawText = "";

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(sourceUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    rawText = await page.evaluate(() => document.body.innerText);

    const images = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("img"))
        .map((img) => img.src)
        .filter((src) => src.startsWith("http"));
    });
    rawText += `\n\nImage URLs on page:\n${images.join("\n")}`;
  } catch (error) {
    console.error(`[AI Worker] Playwright failed on ${sourceUrl}:`, error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }

  console.log(
    `[AI Worker] Extracted ${rawText.length} characters. Sending to Gemini...`,
  );

  const extractedData = await extractVehicleDataFromText(rawText);
  if (!extractedData || !extractedData.make) {
    throw new Error("Failed to extract data using AI");
  }

  const sourceDealId =
    new URL(sourceUrl).pathname.replace(/[^a-zA-Z0-9]/g, "") ||
    Date.now().toString();
  const dbSource = source || "independent_dealer";

  // Hand off to the valuation queue instead of saving immediately
  // This allows parsing to be fast and valuation to be retried independently
  await aiValuationQueue.add({
    dealData: extractedData,
    sourceDealId,
    source: dbSource,
    sourceUrl,
    dealerId,
    savedCarId,
    userId,
  });

  return extractedData;
});

// --- 2. VALUATION QUEUE ---
aiValuationQueue.process(async (job) => {
  const {
    dealData,
    sourceDealId,
    source,
    sourceUrl,
    dealerId,
    savedCarId,
    userId,
  } = job.data;
  console.log(
    `[AI Valuation] Valuing ${dealData.year} ${dealData.make} ${dealData.model}`,
  );

  const valuation = await predictVehicleValuation({
    make: dealData.make,
    model: dealData.model,
    year: dealData.year,
    mileage: dealData.mileage || 0,
    condition: dealData.condition,
    ask_price: dealData.ask_price,
    location_state: "Unknown", // Ideally passed down from dealer info
  });

  console.log(
    `[AI Valuation] Wholesale: $${valuation.estimatedWholesalePrice}, Retail: $${valuation.estimatedRetailPrice}`,
  );

  // Real transport cost via haversine distance between the deal's origin state
  // and the dealer's home state (same model as app/api/transport/quote).
  // If we cannot resolve both endpoints, report 0 honestly rather than guessing.
  let dealerState: string | undefined;
  if (dealerId) {
    try {
      const { data: dealerRow } = await createServerComponentClient()
        .from("dealers")
        .select("state")
        .eq("id", dealerId)
        .maybeSingle();
      dealerState = dealerRow?.state || undefined;
    } catch {}
  }
  const originState: string | undefined =
    dealData.location_state && dealData.location_state !== "Unknown"
      ? String(dealData.location_state).toUpperCase()
      : undefined;

  const estimatedTransportCost = estimateTransportCost(
    originState,
    dealerState,
  );
  const estimatedRepairCost = valuation.estimatedRepairCost || 0;

  // Calculate true net profit
  const trueNetProfit =
    valuation.estimatedWholesalePrice -
    dealData.ask_price -
    estimatedTransportCost -
    estimatedRepairCost;

  // Calculate true profit score (0-100) based on true margin
  let profitScore = 0;
  if (trueNetProfit > 0) {
    profitScore = Math.min(
      100,
      Math.floor((trueNetProfit / dealData.ask_price) * 100),
    );
  }

  const supabase = createServerComponentClient();

  const dealRecord = {
    source,
    dealer_id: dealerId || null,
    source_deal_id: sourceDealId,
    source_url: sourceUrl,
    title: dealData.title,
    make: dealData.make,
    model: dealData.model,
    year: dealData.year,
    ask_price: dealData.ask_price,
    mileage: dealData.mileage || null,
    vin: dealData.vin || null,
    condition: dealData.condition,
    damage_type: dealData.damage_type || null,
    color: dealData.color || null,
    body_style: dealData.body_style || null,
    fuel_type: dealData.fuel_type || null,
    transmission: dealData.transmission || null,
    drivetrain: dealData.drivetrain || null,
    engine: dealData.engine || null,
    images: dealData.images || [],
    mmr_value: valuation.estimatedWholesalePrice, // This automatically triggers profit_estimate generation via DB trigger/generated column
    profit_score: profitScore,
    ai_wholesale_estimate: valuation.estimatedWholesalePrice,
    ai_retail_estimate: valuation.estimatedRetailPrice,
    ai_rationale: valuation.rationale,
    is_arbitrage_opportunity: valuation.isArbitrageOpportunity,
    estimated_transport_cost: estimatedTransportCost,
    estimated_repair_cost: estimatedRepairCost,
    true_net_profit: trueNetProfit,
    active: true,
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("deals")
    .upsert(dealRecord, { onConflict: "source, source_deal_id" });

  if (error) {
    console.error(`[AI Valuation] Database error:`, error);
    throw new Error(`Database error: ${error.message}`);
  }

  console.log(`[AI Valuation] Successfully upserted deal into database.`);

  // If this AI job was started from a "save from URL" fallback, link the saved car
  // placeholder to the real deal and populate its snapshot.
  if (savedCarId) {
    try {
      const { data: dealRow } = await supabase
        .from("deals")
        .select("id")
        .eq("source", source)
        .eq("source_deal_id", sourceDealId)
        .maybeSingle();

      if (dealRow?.id) {
        const snapshot = {
          vin: dealData.vin || null,
          year: dealData.year || null,
          make: dealData.make,
          model: dealData.model,
          trim: dealData.trim || null,
          odometer: dealData.mileage || null,
          askingPrice: dealData.ask_price,
          marketValue: valuation.estimatedWholesalePrice,
          estimatedProfit: trueNetProfit,
          profitScore,
          images: dealData.images || [],
          locationCity: dealData.location_city || null,
          locationState: dealData.location_state || null,
          source,
          sourceUrl,
          aiRationale: valuation.rationale,
          scrapedAt: new Date().toISOString(),
        };

        const { error: savedError } = await supabase
          .from("saved_cars")
          .update({
            deal_id: dealRow.id,
            snapshot,
            price_at_save: dealData.ask_price,
            last_price_seen: dealData.ask_price,
            market_value_at_save: valuation.estimatedWholesalePrice,
            profit_at_save: trueNetProfit,
            status: "active",
            last_checked: new Date().toISOString(),
          })
          .eq("id", savedCarId);

        if (savedError) {
          console.warn(
            `[AI Valuation] Failed to update saved car ${savedCarId}:`,
            savedError.message,
          );
        } else {
          console.log(
            `[AI Valuation] Linked saved car ${savedCarId} to deal ${dealRow.id}`,
          );
        }
      }
    } catch (err: any) {
      console.warn(`[AI Valuation] Saved-car update failed:`, err.message);
    }
  }

  return { dealData, valuation };
});

// --- Transport cost estimation (mirrors app/api/transport/quote) ---
// Rough state-center coordinates used to compute driving distance.
const STATE_COORDS: Record<string, { lat: number; lon: number }> = {
  AL: { lat: 32.806671, lon: -86.79113 },
  AK: { lat: 61.370716, lon: -152.404419 },
  AZ: { lat: 33.729759, lon: -111.431221 },
  AR: { lat: 34.969704, lon: -92.373123 },
  CA: { lat: 36.116203, lon: -119.681564 },
  CO: { lat: 39.059811, lon: -105.311104 },
  CT: { lat: 41.597782, lon: -72.755371 },
  DE: { lat: 39.318523, lon: -75.507141 },
  FL: { lat: 27.766279, lon: -81.686783 },
  GA: { lat: 33.040619, lon: -83.643074 },
  HI: { lat: 21.094318, lon: -157.498337 },
  ID: { lat: 44.240459, lon: -114.478828 },
  IL: { lat: 40.349457, lon: -88.986137 },
  IN: { lat: 39.849426, lon: -86.258278 },
  IA: { lat: 42.011539, lon: -93.210526 },
  KS: { lat: 38.5266, lon: -96.726486 },
  KY: { lat: 37.66814, lon: -84.670067 },
  LA: { lat: 31.169546, lon: -91.867805 },
  ME: { lat: 44.693947, lon: -69.381927 },
  MD: { lat: 39.063946, lon: -76.802101 },
  MA: { lat: 42.230171, lon: -71.530106 },
  MI: { lat: 43.326618, lon: -84.536095 },
  MN: { lat: 45.694454, lon: -93.900192 },
  MS: { lat: 32.741646, lon: -89.678696 },
  MO: { lat: 38.456085, lon: -92.288368 },
  MT: { lat: 46.921925, lon: -110.454353 },
  NE: { lat: 41.12537, lon: -98.268082 },
  NV: { lat: 38.313515, lon: -117.055374 },
  NH: { lat: 43.452492, lon: -71.563896 },
  NJ: { lat: 40.298904, lon: -74.521011 },
  NM: { lat: 34.840515, lon: -106.248482 },
  NY: { lat: 42.165726, lon: -74.948051 },
  NC: { lat: 35.630066, lon: -79.806419 },
  ND: { lat: 47.528912, lon: -99.784012 },
  OH: { lat: 40.388783, lon: -82.764915 },
  OK: { lat: 35.565342, lon: -96.928917 },
  OR: { lat: 44.572021, lon: -122.070938 },
  PA: { lat: 40.590752, lon: -77.209755 },
  RI: { lat: 41.680893, lon: -71.51178 },
  SC: { lat: 33.856892, lon: -80.945007 },
  SD: { lat: 44.299782, lon: -99.438828 },
  TN: { lat: 35.747845, lon: -86.692345 },
  TX: { lat: 31.054487, lon: -97.563461 },
  UT: { lat: 40.150032, lon: -111.862434 },
  VT: { lat: 44.045876, lon: -72.710686 },
  VA: { lat: 37.769337, lon: -78.169968 },
  WA: { lat: 47.382679, lon: -121.512054 },
  WV: { lat: 38.491226, lon: -80.954453 },
  WI: { lat: 44.268543, lon: -89.616508 },
  WY: { lat: 42.755966, lon: -107.30249 },
};

function getDrivingMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 1.3); // ~30% overhead for real driving distance
}

// Returns a real distance-based transport cost, or 0 when endpoints are unknown.
function estimateTransportCost(from?: string, to?: string): number {
  if (!from || !to) return 0;
  if (from === to) return 150; // local tow flat fee
  const c1 = STATE_COORDS[from];
  const c2 = STATE_COORDS[to];
  if (!c1 || !c2) return 0;
  const miles = getDrivingMiles(c1.lat, c1.lon, c2.lat, c2.lon);
  return Math.max(150, Math.round(miles * 0.78) + 50); // $0.78/mi + $50 hookup
}
