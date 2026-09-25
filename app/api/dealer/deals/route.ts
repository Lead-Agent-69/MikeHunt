export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/dealer/deals
 * Log outcome for a deal (purchase/sale info)
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Build insert data
    const insertData: any = {
      user_id: user.id,
      deal_id: body.dealId || null,

      // Vehicle info (denormalized)
      vin: body.vin,
      year: body.year,
      make: body.make,
      model: body.model,
      mileage: body.mileage,

      // Purchase info
      purchased: body.purchased ?? false,
      purchase_price: body.purchasePrice,
      purchase_date: body.purchaseDate,
      purchase_source: body.purchaseSource,

      // Costs
      actual_transport: body.actualTransport,
      actual_recon: body.actualRecon,
      actual_fees: body.actualFees,

      // Sale info
      sold: body.sold ?? false,
      sell_price: body.sellPrice,
      sell_date: body.sellDate,
      sell_channel: body.sellChannel,

      // Platform estimates (for comparison/learning)
      platform_est_sell: body.platformEstSell,
      platform_est_transport: body.platformEstTransport,
      platform_est_recon: body.platformEstRecon,
      platform_est_profit: body.platformEstProfit,

      notes: body.notes,
    };

    // Insert into dealer_deals
    const { data, error } = await supabase
      .from("dealer_deals")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("[dealer/deals] Insert error:", error);
      return NextResponse.json(
        { error: "Failed to save outcome", details: error.message },
        { status: 500 },
      );
    }

    // Trigger calibration computation if deal was sold
    // (This is handled automatically by database trigger)

    return NextResponse.json({
      success: true,
      data,
      message: body.sold
        ? "Outcome logged! Your calibration has been updated."
        : "Purchase logged! Log the sale later to improve accuracy.",
    });
  } catch (error: any) {
    console.error("[dealer/deals] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 },
    );
  }
}

/**
 * GET /api/dealer/deals
 * Get all logged deals for current user
 */
export async function GET(req: Request) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const { data, error, count } = await supabase
      .from("dealer_deals")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[dealer/deals] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch deals" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      deals: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("[dealer/deals] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
