export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { upsertDeals } from "@/lib/scrapers/pipeline";
import { isValidVin, extractVin, normalizeVin } from "@/lib/vehicle/vin";

// Valid deal_source enum values (DB). Anything else is coerced to a safe default.
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

// Map free-text title/condition to the listing_condition enum.
function coerceCondition(input?: string): string {
  const c = (input || "").toLowerCase();
  if (c.includes("salvage")) return "salvage_title";
  if (c.includes("rebuilt")) return "rebuilt_title";
  if (c.includes("parts")) return "parts_only";
  if (c.includes("clean")) return "clean_title";
  if (c.includes("flood") || c.includes("water")) return "flood";
  if (c.includes("fire") || c.includes("burn")) return "fire";
  if (c.includes("hail")) return "hail";
  if (c.includes("repairable") || c.includes("damage")) return "repairable";
  return "run_drive";
}

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function POST(req: Request) {
  try {
    // Shared-secret gate. The browser extension sends `Authorization: Bearer <INGEST_SECRET>`.
    // Secure-by-default in production: if INGEST_SECRET is not configured, the endpoint is CLOSED
    // (a public write path into the deals table is unacceptable in prod). In dev it stays open.
    const secret = process.env.INGEST_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          {
            error:
              "Ingest disabled: set INGEST_SECRET to enable this endpoint.",
          },
          { status: 503, headers: CORS },
        );
      }
    } else if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS },
      );
    }

    const data = await req.json();
    if (!data.url || !data.price || !data.title) {
      return NextResponse.json(
        { error: "Missing required fields (url, price, title)" },
        { status: 400, headers: CORS },
      );
    }

    const rawPrice =
      parseFloat(String(data.price).replace(/[^0-9.]/g, "")) || 0;
    const source = VALID_SOURCES.has((data.source || "").toLowerCase())
      ? data.source.toLowerCase()
      : "independent_dealer";

    // Sold-detection: a "sold" listing is a real transaction price, not active inventory. Capture it
    // into sold_listings (powers the sold-comps feature) instead of the active deals table.
    // VIN: trust a provided VIN only if it passes the check digit; otherwise try to recover one
    // from the title/description/url text the extension sent. null when nothing valid is found.
    const vin =
      (isValidVin(String(data.vin || "")) && normalizeVin(String(data.vin))) ||
      extractVin(
        `${data.vin || ""} ${data.title || ""} ${data.description || ""} ${data.url || ""}`,
      ) ||
      null;

    const soldText =
      `${data.title || ""} ${data.url || ""} ${data.status || ""}`.toLowerCase();
    const isSold =
      data.sold === true ||
      /\bsold\b|\/sold\/|sale-pending|no longer available/.test(soldText);
    if (isSold && rawPrice > 0) {
      try {
        const { createServerComponentClient } = await import("@/lib/supabase");
        await createServerComponentClient()
          .from("sold_listings")
          .insert({
            vin,
            year: data.year ?? null,
            make: data.make ?? null,
            model: data.model ?? null,
            mileage: data.mileage ?? null,
            sold_price: rawPrice,
            sold_at: new Date().toISOString(),
            source,
            location_state: data.location_state ?? null,
          });
      } catch (e) {
        console.warn("[ingest] sold capture failed:", e);
      }
      return NextResponse.json(
        { success: true, sold: true },
        { headers: CORS },
      );
    }

    // Build a clean Partial<Deal> and run it through the real pipeline (normalize → analyze →
    // valid-column upsert + dedupe + saved-search match). No invalid columns/enums.
    const deal = {
      source,
      source_deal_id: data.external_id || data.url,
      source_url: data.url,
      title: data.title,
      year: data.year,
      make: data.make,
      model: data.model,
      vin: vin ?? undefined,
      ask_price: rawPrice,
      condition: coerceCondition(data.title_type || data.condition),
      damage_type: data.damage_type,
      location_city: data.location_city,
      location_state: data.location_state,
      images: data.image_url ? [data.image_url] : data.images || [],
    } as any;

    const count = await upsertDeals([deal]);

    // Return the analyzed deal so callers (browser extension) can show the verdict instantly.
    let analyzed: any = null;
    try {
      const { createServerComponentClient } = await import("@/lib/supabase");
      const sb = createServerComponentClient();
      const { data: row } = await sb
        .from("deals")
        .select(
          "id, deal_verdict, true_net_profit, recommended_max_bid, sell_estimate, ask_price, year, make, model",
        )
        .eq("source", source)
        .eq("source_deal_id", deal.source_deal_id)
        .maybeSingle();
      analyzed = row;
    } catch {
      /* best-effort */
    }

    return NextResponse.json(
      { success: true, ingested: count, deal: analyzed },
      { headers: CORS },
    );
  } catch (error: any) {
    console.error("Ingest Error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS },
    );
  }
}

// Preflight CORS for the browser extension.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
