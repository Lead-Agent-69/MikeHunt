// app/api/saved-cars/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerComponentClient();
    const {
      data: { user },
    } = await getServerUser();

    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all";

    let query = supabase.from("saved_cars").select("*").eq("user_id", userId);

    if (filter === "active") {
      query = query.in("status", ["active", "price_drop", "price_increase"]);
    } else if (filter === "price_drops") {
      query = query.eq("status", "price_drop");
    } else if (filter === "ending_soon") {
      query = query.eq("status", "ending_soon");
    } else if (filter === "gone" || filter === "unavailable") {
      query = query.eq("status", "unavailable");
    }

    const { data, error } = await query.order("saved_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("[SAVED-CARS-API] GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch saved cars" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerComponentClient();
    const {
      data: { user },
    } = await getServerUser();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The dealer row is provisioned with id === auth user id (see /api/auth/provision).
    const dealerId: string = userId;

    const body = await request.json();
    const { dealId } = body;

    if (!dealId) {
      return NextResponse.json(
        { error: "dealId is required" },
        { status: 400 },
      );
    }

    // Retrieve the deal details
    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .select("*")
      .eq("id", dealId)
      .maybeSingle();

    if (dealErr || !deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

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
      sourceUrl: deal.source_url,
      scrapedAt: deal.scraped_at,
    };

    const { data: existing } = await supabase
      .from("saved_cars")
      .select("id")
      .eq("user_id", userId)
      .eq("deal_id", dealId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Deal already saved", id: existing.id },
        { status: 409 },
      );
    }

    const { data, error: insertErr } = await supabase
      .from("saved_cars")
      .insert({
        user_id: userId,
        dealer_id: dealerId,
        deal_id: dealId,
        snapshot,
        source_url: deal.source_url,
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

    if (insertErr) throw insertErr;

    return NextResponse.json({ success: true, id: data.id });
  } catch (error: any) {
    console.error("[SAVED-CARS-API] POST error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save car" },
      { status: 500 },
    );
  }
}
