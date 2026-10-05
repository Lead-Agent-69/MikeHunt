export const dynamic = "force-dynamic";
import { isAuctionChannel } from "@/lib/sources/source-meta";

import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { categorize } from "@/lib/discovery/categorize";
import { sellerContactFields } from "@/lib/data/deal-contact";

// /api/flash-deals — the Booking.com "urgency" feed: deals fresh to market (< 24h), engine-verdict
// GO, and at least 10% below the resale estimate. Backed by the flash_deals SQL view (computed on
// read, so the countdown is always live). Returns DiscoveryCard-shaped rows + countdown fields.
function mapFlashDeal(d: any) {
  const tags = categorize({ ...d, sellBasis: d.deal_analysis?.sellBasis });
  return {
    id: d.id,
    source: d.source,
    sourceUrl: d.source_url,
    ...sellerContactFields(d),
    title: d.title || `${d.year || ""} ${d.make || ""} ${d.model || ""}`.trim(),
    year: d.year,
    make: d.make,
    model: d.model,
    vin: d.vin,
    mileage: d.mileage,
    condition: d.condition,
    askPrice: Number(d.ask_price || 0),
    sellEstimate: d.sell_estimate != null ? Number(d.sell_estimate) : undefined,
    profitScore: d.profit_score != null ? Number(d.profit_score) : undefined,
    trueNetProfit:
      d.true_net_profit != null ? Number(d.true_net_profit) : undefined,
    recommendedMaxBid:
      d.recommended_max_bid != null ? Number(d.recommended_max_bid) : undefined,
    dealVerdict: d.deal_verdict,
    locationCity: d.location_city,
    locationState: d.location_state,
    images: d.images || [],
    ...tags,
    alsoOn: [],
    listingCount: 1,
    // Flash-specific fields
    secondsRemaining:
      d.seconds_remaining != null
        ? Math.max(0, Math.round(Number(d.seconds_remaining)))
        : null,
    belowMarketPct:
      d.below_market_pct != null ? Number(d.below_market_pct) : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state")?.toUpperCase();
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "24", 10) || 24, 1),
      100,
    );

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        deals: [],
        count: 0,
        state: state || "nationwide",
        configured: false,
      });
    }

    const supabase = createServerComponentClient();
    let q = supabase.from("flash_deals").select("*").limit(limit);
    if (state) q = q.eq("location_state", state);

    const { data, error } = await q;
    if (error)
      return internalError("flash-deals", error);

    const deals = (data || [])
      .filter((row) => !isAuctionChannel(row.source))
      .map(mapFlashDeal);
    return NextResponse.json(
      {
        deals,
        count: deals.length,
        state: state || "nationwide",
      },
      {
        // D2: this feed is global (no per-user data), so let the CDN serve it for 60s and
        // revalidate in the background — read-heavy route, much faster repeat loads.
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (e: any) {
    return internalError("flash-deals", e);
  }
}
