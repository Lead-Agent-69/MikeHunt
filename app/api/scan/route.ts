import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// LAZY client — created at REQUEST time, never at module load. `next build` evaluates route modules
// without the runtime env, and createClient("","") throws on an empty URL → that top-level call was
// failing the whole build ("Failed to collect page data for /api/scan") and freezing every deploy.
let _supabase: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_supabase)
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    );
  return _supabase;
}

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRow(r: any, table: "deals" | "vehicles") {
  // Map both deals and vehicles rows into a Deal-like shape used by scan UI mapper
  const id = r.id;
  const source = r.source || "unknown";
  const year = r.year ?? undefined;
  const make = r.make || "";
  const model = r.model || "";
  const mileage = r.mileage ?? r.miles ?? undefined;
  const askPrice = toNum(r.ask_price ?? r.askPrice ?? 0);
  const mmrValue = toNum(r.mmr_value ?? r.mmrValue ?? r.market_value ?? 0);
  const profitEstimate = toNum(r.profit_estimate ?? r.profitEstimate ?? 0);
  const profitScore = r.profit_score ?? r.profitScore ?? undefined;
  const condition = r.condition || "";
  const damageType = r.damage_type || r.damageType || undefined;
  const locationCity = r.location_city || r.locationCity || undefined;
  const locationState = r.location_state || r.locationState || undefined;
  const seller = r.seller || undefined;
  const auctionEndAt =
    r.auction_end || r.auction_end_at || r.auctionEndAt || undefined;
  const repairEst = toNum(r.repair_estimate ?? r.repairEst ?? 0);
  const images = Array.isArray(r.images) ? r.images : r.images || [];
  return {
    id,
    source,
    title: r.title || `${year || ""} ${make} ${model}`.trim(),
    year,
    make,
    model,
    trim: r.trim,
    bodyClass: r.body_class || undefined,
    recallsCount: r.recalls_count ?? undefined,
    assemblyCountry: r.assembly_country || undefined,
    vin: r.vin,
    mileage,
    condition,
    askPrice,
    buyNowPrice: r.buy_now_price ?? undefined,
    mmrValue,
    profitEstimate,
    profitScore: profitScore != null ? Number(profitScore) : undefined,
    // Decision-engine fields — must be carried through so verdict pills / max-bid /
    // resale render on the Scan grid (mapDealToResult reads these camelCase keys).
    dealVerdict: r.deal_verdict || undefined,
    recommendedMaxBid:
      r.recommended_max_bid != null ? Number(r.recommended_max_bid) : undefined,
    sellEstimate: r.sell_estimate != null ? Number(r.sell_estimate) : undefined,
    true_net_profit:
      r.true_net_profit != null ? Number(r.true_net_profit) : undefined,
    images,
    locationCity,
    locationState,
    locationZip: r.location_zip || undefined,
    active: r.active ?? true,
    firstSeenAt: r.first_seen_at ? new Date(r.first_seen_at) : new Date(),
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at) : new Date(),
    sourceUrl: r.source_url || r.sourceUrl || "",
    auctionEndAt: auctionEndAt ? new Date(auctionEndAt) : undefined,
    damageType,
    seller,
    sellerType: r.seller_type || undefined,
    repair_estimate: repairEst || undefined,
    transport_cost: r.transport_cost ?? undefined,
    is_arbitrage_opportunity: r.is_arbitrage_opportunity ?? undefined,
  };
}

function dedupeKey(r: any) {
  return `${(r.source || "unknown").toLowerCase()}::${r.source_deal_id || r.id || r.vin || ""}`;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "scan", limit: 90, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl) as any;

  const supabase = db();
  const { searchParams } = new URL(req.url);
  // Sanitize free-text search before it's interpolated into the PostgREST .or() filter — strip
  // anything that isn't a normal vehicle/VIN character so commas/parens can't inject extra filters.
  const q = (searchParams.get("q") || "")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  const state = searchParams.get("state") || "";
  // Multi-state hard filter (for the "deals near you" widget: your state + surrounding states).
  const states = (searchParams.get("states") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const make = searchParams.get("make") || "";
  const model = searchParams.get("model") || "";
  const source = searchParams.get("source") || "";
  // Per-dealer inventory filter (site host). Host-safe chars only.
  const dealer = (searchParams.get("dealer") || "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "");
  // Multi-dealer filter (comma-separated hosts) — powers the "new from watched dealers" feed.
  const dealers = (searchParams.get("dealers") || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.replace(/[^a-z0-9.-]/g, ""))
    .filter(Boolean)
    .slice(0, 25);
  const titleType = searchParams.get("titleType") || "";
  const lane = (searchParams.get("lane") || "").toLowerCase();
  const category = searchParams.get("cat") || "";
  const minProfit = parseInt(searchParams.get("minProfit") || "0");
  // Range filters — remove the "borders" so any buyer can scope by era, budget, and odometer.
  const minYear = parseInt(searchParams.get("minYear") || "0");
  const maxYear = parseInt(searchParams.get("maxYear") || "0");
  const maxPrice = parseInt(searchParams.get("maxPrice") || "0");
  const minPrice = parseInt(searchParams.get("minPrice") || "0");
  const verdict = searchParams.get("verdict") || "";
  const minMileage = parseInt(searchParams.get("minMileage") || "0");
  const maxMileage = parseInt(searchParams.get("maxMileage") || "0");
  const availability = searchParams.get("availability") || "";
  const madeInUsa = searchParams.get("madeInUsa") === "1";
  const drivetrain = searchParams.get("drivetrain") || "";
  const page = parseInt(searchParams.get("page") || "0");
  // Bigger page + client-driven infinite scroll (append) so the grid surfaces ALL matching inventory,
  // not just the first screen. Capped to keep any single payload reasonable.
  const pageSize = Math.min(
    100,
    Math.max(12, parseInt(searchParams.get("pageSize") || "48")),
  );

  let query = supabase
    .from("deals")
    .select("*", { count: "exact" })
    // Only live inventory — the nightly prune sets active=false on deals unseen >30 days (awaiting
    // hard-delete at 60). discover/deals-service already filter this; scan was leaking stale rows.
    .eq("active", true);

  if (make) {
    query = query.ilike("make", make);
  }

  if (model) {
    query = query.ilike("model", model);
  }

  if (states.length) {
    query = query.in("location_state", states);
  }

  if (availability) {
    query = query.eq("availability_status", availability);
  }

  if (madeInUsa) {
    // NHTSA returns assembly country like "UNITED STATES (USA)".
    query = query.or(
      "assembly_country.ilike.%united states%,assembly_country.ilike.%usa%",
    );
  }

  if (q) {
    query = query.or(
      `title.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%,vin.ilike.%${q}%`,
    );
  }

  // Drivetrain facet from the parsed options JSONB (AWD / 4WD / FWD / RWD).
  if (drivetrain && drivetrain !== "all") {
    query = query.eq("options->>drivetrain", drivetrain);
  }

  if (verdict && verdict !== "all") query = query.eq("deal_verdict", verdict);
  if (minYear > 0) query = query.gte("year", minYear);
  if (maxYear > 0) query = query.lte("year", maxYear);
  if (maxPrice > 0) query = query.lte("ask_price", maxPrice);
  if (minPrice > 0) query = query.gte("ask_price", minPrice);
  // Mileage may be null on some rows; range filters naturally exclude nulls, which is acceptable
  // for an explicit mileage search.
  if (minMileage > 0) query = query.gte("mileage", minMileage);
  if (maxMileage > 0) query = query.lte("mileage", maxMileage);

  if (source) {
    query = query.eq("source", source.toLowerCase());
  }
  // Filter to a single curated dealer by its site host (source_url contains it) — powers the per-dealer
  // in-app inventory view. Sanitized to host-safe chars before interpolation.
  if (dealer) {
    query = query.ilike("source_url", `%${dealer}%`);
  }
  if (dealers.length) {
    query = query.or(dealers.map((h) => `source_url.ilike.%${h}%`).join(","));
  }

  if (titleType && titleType !== "all") {
    const conditionMapping: Record<string, string> = {
      clean: "clean_title",
      rebuilt: "rebuilt_title",
      salvage: "salvage_title",
      parts: "parts_only",
    };
    const mappedCondition = conditionMapping[titleType] || titleType;
    query = query.eq("condition", mappedCondition);
  }

  // Acquisition LANES — quick lenses matching how a flipper browses. These overlap by design
  // (a Copart salvage car shows under both "auction" and "salvage"); they're filters, not partitions.
  if (lane && lane !== "all") {
    const AUCTION = ["copart", "iaa", "adesa", "manheim", "acv", "gov_auction"];
    const RETAIL = [
      "carvana",
      "cars_com",
      "cargurus",
      "autotrader",
      "truecar",
      "ebay_motors",
      "vroom",
      "carmax",
    ];
    const PRIVATE = [
      "craigslist",
      "craigslist_dealer",
      "facebook_marketplace",
      "offerup",
      "independent_dealer",
    ];
    if (lane === "auction") query = query.in("source", AUCTION);
    else if (lane === "damaged")
      // Salvage + repairable + branded — every fixable/damaged car, any source (incl. auction lots).
      query = query.or(
        "condition.ilike.%salvage%,condition.ilike.%parts%,condition.ilike.%flood%,condition.ilike.%fire%,condition.ilike.%junk%,condition.ilike.%rebuilt%,condition.ilike.%repairable%,condition.ilike.%hail%",
      );
    else if (lane === "clean-retail") query = query.in("source", RETAIL);
    else if (lane === "private") query = query.in("source", PRIVATE);
  }

  if (category && !source && !titleType) {
    const cleanCat = category.toLowerCase();
    if (
      ["copart", "iaa", "craigslist", "ebay", "facebook"].includes(cleanCat)
    ) {
      const sourceMapping: Record<string, string> = {
        facebook: "facebook_marketplace",
        ebay: "ebay_motors",
      };
      query = query.eq("source", sourceMapping[cleanCat] || cleanCat);
    } else {
      query = query.eq("condition", cleanCat);
    }
  }

  if (minProfit > 0) {
    query = query.gte("profit_estimate", minProfit);
  }

  query = query
    .order("profit_score", { ascending: false, nullsFirst: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  const { data, count, error } = await query;
  if (error) {
    console.error("API scan error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dRows = (data || []).map((r: any) => normalizeRow(r, "deals"));

  // State boost: sort state-match results first
  const sorted = state
    ? [
        ...dRows.filter(
          (v: any) =>
            (v.locationState || "").toUpperCase() === state.toUpperCase(),
        ),
        ...dRows.filter(
          (v: any) =>
            (v.locationState || "").toUpperCase() !== state.toUpperCase(),
        ),
      ]
    : dRows;

  return NextResponse.json({
    vehicles: sorted,
    total: count || 0,
    state: state || "nationwide",
    page,
    pageSize,
    hasMore: (count || 0) > (page + 1) * pageSize,
    isLive: true,
  });
}

// POST — trigger a new scan
// The legacy BullMQ "scrape" queue has been removed; scraping is now handled by the
// GitHub Actions ingestion pipeline (or by the AI parsing queue when a user saves a
// specific URL). This endpoint remains so the UI can signal a refresh, but the actual
// live results come from the deals table via the GET endpoint above.
export async function POST(req: NextRequest) {
  try {
    const { searchTerm } = await req.json();

    if (!searchTerm) {
      return NextResponse.json(
        { error: "searchTerm is required" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Live scanner is active. Results for "${searchTerm}" stream in automatically as the pipeline finds new deals.`,
    });
  } catch (error: any) {
    console.error("Scan trigger error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
