// app/api/save-from-url/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { upsertDeals } from "@/lib/scrapers/pipeline";
import { queueForAIParsing } from "@/lib/ai/queue";
import * as crypto from "crypto";
import axios from "axios";
import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Require a real authenticated user — no demo/evaluator fallback.
    let getUserResult: { data: { user: any }; error: any };
    try {
      getUserResult = await getServerUser();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const {
      data: { user },
    } = getUserResult;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;
    const supabase = createServerComponentClient();
    // The dealer row is provisioned with id === auth user id (see /api/auth/provision).
    const dealerId: string = user.id;

    const { url } = await request.json();
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // 1. Check URL Hash cache
    const urlHash = crypto.createHash("md5").update(url).digest("hex");
    const { data: cached } = await supabase
      .from("source_url_cache")
      .select("deal_id")
      .eq("url_hash", urlHash)
      .maybeSingle();

    if (cached?.deal_id) {
      console.log("[SAVE-FROM-URL] Found cached deal ID:", cached.deal_id);

      // Load deal to create snapshot
      const { data: deal } = await supabase
        .from("deals")
        .select("*")
        .eq("id", cached.deal_id)
        .maybeSingle();

      if (deal) {
        const savedId = await saveCarSnapshot(
          supabase,
          userId,
          dealerId,
          deal,
          url,
        );
        return NextResponse.json({ success: true, dealId: deal.id, savedId });
      }
    }

    // 2. Detect Source
    const source = detectSource(url);

    // 3. Scrape or Parse URL details. Returns null if nothing real could be extracted.
    const scrapedData = await scrapeOrParseListing(url, source);

    // Honest failure: if we could not extract a real vehicle (need at least a
    // make/model and an ask price), hand the URL to the AI parsing queue instead
    // of giving up. The AI worker (Playwright + Gemini) will create the deal and
    // the saved-cars snapshot asynchronously.
    if (
      !scrapedData ||
      !scrapedData.make ||
      !scrapedData.model ||
      !scrapedData.ask_price
    ) {
      const savedCarId = await createAnalyzingSavedCar(
        supabase,
        userId,
        dealerId,
        url,
        source,
      );
      await queueForAIParsing(url, dealerId, source, { savedCarId, userId });
      return NextResponse.json(
        {
          queued: true,
          savedId: savedCarId,
          message:
            "AI is analyzing this listing. It will appear in Saved Vehicles shortly.",
        },
        { status: 202 },
      );
    }

    const askPrice = scrapedData.ask_price;
    // Only carry through real, extracted estimates — no guessed defaults.
    const transportCost = scrapedData.transport_cost ?? null;
    const repairEstimate = scrapedData.repair_estimate ?? null;
    const mmrValue = scrapedData.mmr_value ?? null;

    // 4. Scoring is handled inside upsertDeals → analyzeDeal (see step 5 below).
    // No manual DealScoringService call here — keeps all routes consistent.

    // Coerce to a valid deal_source enum (detectSource may return hyphenated/unknown values).
    const VALID_SOURCES = new Set([
      "copart",
      "iaa",
      "adesa",
      "manheim",
      "facebook_marketplace",
      "craigslist",
      "ebay_motors",
      "autotrader",
      "cars_com",
      "gov_auction",
      "repo_network",
      "independent_dealer",
      "cargurus",
      "craigslist_dealer",
      "carvana",
      "truecar",
      "vroom",
      "offerup",
      "acv",
    ]);
    const safeSource = VALID_SOURCES.has(String(source))
      ? source
      : "independent_dealer";

    const dealPayload = {
      source: safeSource,
      source_deal_id: scrapedData.external_id || String(Date.now()),
      source_url: url,
      title:
        scrapedData.title ||
        `${scrapedData.year ? scrapedData.year + " " : ""}${scrapedData.make} ${scrapedData.model}`.trim(),
      year: scrapedData.year ?? null,
      make: scrapedData.make,
      model: scrapedData.model,
      trim: scrapedData.trim || "",
      vin: scrapedData.vin || "",
      mileage: scrapedData.mileage ?? null,
      condition: scrapedData.condition || "run_drive",
      ask_price: askPrice,
      location_city: scrapedData.location_city ?? null,
      location_state: scrapedData.location_state ?? null,
      images: scrapedData.images ?? [],
      auction_end_at: scrapedData.auction_end ?? null,
      estimated_transport_cost: transportCost,
      estimated_repair_cost: repairEstimate,
      active: true,
    } as any;

    // 5. Run through the full pipeline: normalize → analyzeDeal → upsert + dedupe + saved-search match.
    // This gives every saved URL the same deal_verdict, true_net_profit, sell_estimate, and
    // recommended_max_bid as deals ingested via the scraper — guaranteed consistent valuation.
    let actualDealId: string | null = null;
    try {
      await upsertDeals([dealPayload]);
      // Fetch back the id so we can link the saved_cars row.
      const { data: row } = await supabase
        .from("deals")
        .select("id")
        .eq("source", safeSource)
        .eq("source_deal_id", dealPayload.source_deal_id)
        .maybeSingle();
      actualDealId = row?.id ?? null;
    } catch (pipeErr: any) {
      console.warn("[SAVE-FROM-URL] pipeline upsert failed:", pipeErr.message);
    }

    // Expose newDeal-compatible shape for downstream steps.
    const newDeal = { ...dealPayload, id: actualDealId, mmr_value: mmrValue };

    // 6. Save in URL Cache
    await supabase.from("source_url_cache").upsert({
      url_hash: urlHash,
      url,
      source,
      deal_id: actualDealId,
      scraped_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // 7. Create saved_cars entry
    // We attach the actual UUID to the deal object for the saved_cars insert
    const dealWithActualId = { ...newDeal, id: actualDealId };
    const savedId = await saveCarSnapshot(
      supabase,
      userId,
      dealerId,
      dealWithActualId,
      url,
    );

    // Track in VIN price history if VIN is present
    if (newDeal.vin) {
      await supabase.from("vin_price_history").insert({
        vin: newDeal.vin,
        asking_price: newDeal.ask_price,
        market_value: newDeal.mmr_value,
        source: newDeal.source,
        location_state: newDeal.location_state,
      });
    }

    return NextResponse.json({ success: true, dealId: actualDealId, savedId });
  } catch (error: any) {
    console.error("[SAVE-FROM-URL] Fatal error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save deal from URL" },
      { status: 500 },
    );
  }
}

function detectSource(url: string): string {
  const lowercase = url.toLowerCase();
  if (lowercase.includes("craigslist.org")) return "craigslist";
  if (lowercase.includes("facebook.com")) return "facebook-marketplace";
  if (lowercase.includes("copart.com")) return "copart";
  if (lowercase.includes("iaai.com")) return "iaa";
  if (lowercase.includes("ebay.com") || lowercase.includes("ebay.to"))
    return "ebay-motors";
  if (lowercase.includes("autotrader.com")) return "autotrader";
  if (lowercase.includes("cars.com")) return "cars-com";
  if (lowercase.includes("cargurus.com")) return "cargurus";
  if (lowercase.includes("carmax.com")) return "carmax";
  if (lowercase.includes("carvana.com")) return "carvana";
  return "web-share";
}

async function scrapeOrParseListing(
  url: string,
  source: string,
): Promise<any | null> {
  // Start with NO fabricated vehicle. Fields are populated only from real
  // parsing of the URL structure and the fetched page content.
  const data: any = {
    external_id: crypto
      .createHash("md5")
      .update(url)
      .digest("hex")
      .substring(0, 8)
      .toUpperCase(),
    images: [],
    year: undefined,
    make: undefined,
    model: undefined,
    trim: undefined,
    mileage: undefined,
    ask_price: undefined,
    condition: undefined,
    location_city: undefined,
    location_state: undefined,
    vin: "",
    description: "",
  };

  // Regular expression parsing on the URL structure (first line of resilience)
  try {
    const lowercaseUrl = url.toLowerCase();

    // Parse Year
    const yearMatch = lowercaseUrl.match(/\b(20\d{2}|19\d{2})\b/);
    if (yearMatch) {
      data.year = parseInt(yearMatch[1]);
    }

    // Parse Make
    const makes = [
      "ford",
      "chevrolet",
      "chevy",
      "toyota",
      "honda",
      "nissan",
      "jeep",
      "dodge",
      "ram",
      "gmc",
      "bmw",
      "mercedes",
      "audi",
      "lexus",
      "subaru",
      "hyundai",
      "kia",
      "mazda",
      "tesla",
      "porsche",
      "volkswagen",
      "vw",
    ];
    for (const make of makes) {
      if (lowercaseUrl.includes(make)) {
        data.make = make.charAt(0).toUpperCase() + make.slice(1);
        if (data.make === "Chevy") data.make = "Chevrolet";
        if (data.make === "Vw") data.make = "Volkswagen";
        break;
      }
    }

    // Parse Model (approximate from URL words following make)
    if (data.make) {
      const urlParts = lowercaseUrl
        .replace(/[^a-z0-9]/g, " ")
        .split(" ")
        .filter(Boolean);
      const makeIndex = urlParts.indexOf(data.make.toLowerCase());
      if (makeIndex !== -1 && urlParts[makeIndex + 1]) {
        const skipWords = [
          "and",
          "for",
          "sale",
          "with",
          "salvage",
          "clean",
          "title",
          "used",
          "new",
          "in",
          "near",
        ];
        let modelStr =
          urlParts[makeIndex + 1].charAt(0).toUpperCase() +
          urlParts[makeIndex + 1].slice(1);

        if (
          urlParts[makeIndex + 2] &&
          !skipWords.includes(urlParts[makeIndex + 2])
        ) {
          modelStr +=
            " " +
            urlParts[makeIndex + 2].charAt(0).toUpperCase() +
            urlParts[makeIndex + 2].slice(1);
        }
        data.model = modelStr;
      }
    }

    // Extract potential price if it's in the URL path
    const priceMatch = lowercaseUrl.match(/[\/-](\d{3,5})[\/-]/);
    if (priceMatch) {
      const p = parseInt(priceMatch[1]);
      if (p > 500 && p < 100000) data.ask_price = p;
    }

    // Extract potential mileage
    const milesMatch = lowercaseUrl.match(/(\d{2,3})[k|m]?[ -]?miles?/);
    if (milesMatch) {
      data.mileage = parseInt(milesMatch[1]) * 1000;
    }
  } catch {}

  // Attempt standard page fetch (will work on Craigslist, cars.com, sometimes eBay, but blocks on Copart/IAA)
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      timeout: 6000,
    });

    const $ = cheerio.load(response.data);

    // Source-specific parsing rules
    if (source === "craigslist") {
      const priceText = $(".price").first().text();
      if (priceText)
        data.ask_price =
          parseFloat(priceText.replace(/[^0-9.]/g, "")) || data.ask_price;

      const titleText = $("#titletextonly").text();
      if (titleText) {
        data.title = titleText.trim();
        const parts = titleText.split(" ");
        const yearVal = parseInt(parts[0]);
        if (yearVal > 1900) data.year = yearVal;
      }

      const attrGroup = $(".attrgroup").text();
      if (attrGroup) {
        const vinMatch = attrGroup.match(/vin:\s*([A-HJ-NPR-Z0-9]{17})/i);
        if (vinMatch) data.vin = vinMatch[1].toUpperCase();

        const odoMatch = attrGroup.match(/odometer:\s*([0-9,]+)/i);
        if (odoMatch) data.mileage = parseInt(odoMatch[1].replace(/,/g, ""));
      }

      data.description = $("#postingbody")
        .text()
        .replace("QR Code Link to This Post", "")
        .trim();

      // Images
      $(".gallery img").each((_, img) => {
        const src = $(img).attr("src");
        if (src) data.images.push(src);
      });
    } else if (source === "facebook-marketplace") {
      // FB Marketplace is highly obfuscated, relies on URL metadata + simple parsing
      const priceMatch = $("body")
        .text()
        .match(/\$[0-9,]+/);
      if (priceMatch)
        data.ask_price =
          parseFloat(priceMatch[0].replace(/[^0-9.]/g, "")) || data.ask_price;
    } else if (source === "copart") {
      const lotMatch = url.match(/lot\/(\d+)/);
      if (lotMatch) data.external_id = lotMatch[1];
    } else if (source === "iaa") {
      const idMatch = url.match(/VehicleDetail\/(\d+)/);
      if (idMatch) data.external_id = idMatch[1];
    }

    // Parse images from general elements if none were parsed
    if (data.images.length === 0) {
      $('meta[property="og:image"]').each((_, meta) => {
        const content = $(meta).attr("content");
        if (content && content.startsWith("http")) data.images.push(content);
      });
    }
  } catch (e: any) {
    console.log(
      `[SAVE-FROM-URL] HTML fetch skipped/blocked: ${e.message}. Using URL heuristic parsing.`,
    );
  }

  // Only keep a real, valid 17-char VIN. Never fabricate one.
  if (!data.vin || data.vin.length !== 17) {
    data.vin = "";
  }

  // Honest failure: require at least make/model and an ask price extracted from
  // real sources. No stock photos or placeholder vehicles are injected.
  if (!data.make || !data.model || !data.ask_price) {
    return null;
  }

  return data;
}

async function createAnalyzingSavedCar(
  supabase: any,
  userId: string,
  dealerId: string | null,
  sourceUrl: string,
  sourceName: string,
) {
  const snapshot = {
    source: sourceName,
    sourceUrl: sourceUrl,
    scrapedAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("saved_cars")
    .insert({
      user_id: userId,
      dealer_id: dealerId,
      source_url: sourceUrl,
      source_name: sourceName,
      snapshot,
      price_at_save: 0,
      last_price_seen: 0,
      market_value_at_save: 0,
      profit_at_save: 0,
      status: "analyzing",
      saved_at: new Date().toISOString(),
      last_checked: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42P01") {
      console.warn(
        "[SAVE-FROM-URL] saved_cars table not found — cannot create analyzing placeholder",
      );
      return null;
    }
    throw error;
  }

  return data.id;
}

async function saveCarSnapshot(
  supabase: any,
  userId: string,
  dealerId: string | null,
  deal: any,
  sourceUrl: string,
) {
  const snapshot = {
    vin: deal.vin,
    year: deal.year,
    make: deal.make,
    model: deal.model,
    trim: deal.trim,
    odometer: deal.mileage,
    askingPrice: deal.ask_price,
    marketValue: deal.mmr_value,
    estimatedProfit: deal.profit_estimate,
    profitScore: deal.profit_score,
    images: deal.images,
    locationCity: deal.location_city,
    locationState: deal.location_state,
    source: deal.source,
    sourceUrl: deal.source_url || sourceUrl,
    scrapedAt: deal.scraped_at || new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("saved_cars")
    .select("id")
    .eq("user_id", userId)
    .eq("source_url", sourceUrl)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("saved_cars")
      .update({
        status: "active",
        snapshot,
        last_price_seen: deal.ask_price,
        last_checked: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("saved_cars")
    .insert({
      user_id: userId,
      dealer_id: dealerId,
      deal_id: deal.id,
      snapshot,
      source_url: sourceUrl,
      source_name: deal.source,
      price_at_save: deal.ask_price,
      last_price_seen: deal.ask_price,
      market_value_at_save: deal.mmr_value,
      profit_at_save: deal.profit_estimate,
      status: "active",
      saved_at: new Date().toISOString(),
      last_checked: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // Handle missing table gracefully
    if (error.code === "42P01") {
      console.warn(
        "[SAVE-FROM-URL] saved_cars table not found — returning null savedId",
      );
      return null;
    }
    throw error;
  }

  return data.id;
}
