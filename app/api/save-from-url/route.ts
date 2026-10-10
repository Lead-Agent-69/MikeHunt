// app/api/save-from-url/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { upsertDeals } from "@/lib/scrapers/pipeline";
import { toDealSource, urlListingId } from "@/lib/data-quality/provenance";
// P0: AI invent queue disabled — do not import queueForAIParsing.
import * as crypto from "crypto";
import { UrlNotAllowedError } from "@/lib/net/public-url";
import { scrapeOrParseListing } from "@/lib/save-from-url/scrape-listing";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/** Each save can trigger an outbound fetch + pipeline upsert; cap per signed-in user. */
const SAVE_FROM_URL_LIMIT = { limit: 10, windowMs: 60_000 } as const;

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
    const rl = rateLimit(request, {
      key: "save-from-url",
      identity: `user:${userId}`,
      ...SAVE_FROM_URL_LIMIT,
    });
    if (!rl.allowed) return tooManyRequests(rl);
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
    // Blocked targets (private, link-local, metadata, redirect onto those) are 400.
    // A miss stays 422 and does not echo the request body.
    let scrapedData: Awaited<ReturnType<typeof scrapeOrParseListing>>;
    try {
      scrapedData = await scrapeOrParseListing(url, source);
    } catch (error) {
      if (error instanceof UrlNotAllowedError) {
        return NextResponse.json(
          {
            error: "That URL can't be fetched.",
            code: "URL_NOT_ALLOWED",
          },
          { status: 400 },
        );
      }
      throw error;
    }

    // P0 (Ren): do NOT hand off to AI invent→store→display.
    // valuation-agent invented wholesale/retail; ai-worker wrote mmr_value/marketValue;
    // UI labeled it like KBB. Fail closed with an honest empty/error instead.
    if (
      !scrapedData ||
      !scrapedData.make ||
      !scrapedData.model ||
      !scrapedData.ask_price
    ) {
      return NextResponse.json(
        {
          error:
            "Could not extract listing details from this URL. Try a page we can read, or enter the vehicle manually. AI price invent is disabled — market values must come from fetched data only.",
          code: "EXTRACT_FAILED_NO_AI_FALLBACK",
        },
        { status: 422 },
      );
    }

    const askPrice = scrapedData.ask_price;
    // Only carry through real, extracted estimates — no guessed defaults.
    const transportCost = scrapedData.transport_cost ?? null;
    const repairEstimate = scrapedData.repair_estimate ?? null;
    const mmrValue = scrapedData.mmr_value ?? null;

    // 4. Scoring is handled inside upsertDeals → analyzeDeal (see step 5 below).
    // No manual DealScoringService call here — keeps all routes consistent.

    // True source ('facebook-marketplace' → facebook_marketplace); a host we don't know is
    // 'unknown' (access_basis 'unreviewed'), never relabelled as independent_dealer.
    const safeSource = toDealSource(detectSource(url));

    const dealPayload = {
      source: safeSource,
      // Stable id: the same URL saved twice updates one row instead of minting a new listing.
      source_deal_id: scrapedData.external_id || urlListingId(url),
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
    const message =
      process.env.NODE_ENV === "production"
        ? "Failed to save deal from URL"
        : error?.message || "Failed to save deal from URL";
    return NextResponse.json({ error: message }, { status: 500 });
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
