export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { InventoryService } from "@/lib/data/inventory-service";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL to .env.local",
      },
      { status: 503 },
    );
  }

  try {
    // Derive dealerId from authenticated session (server-side source of truth)
    const supabase = createServerComponentClient();
    const {
      data: { user },
      error: authError,
    } = await getServerUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const dealerId = user.id;

    const { searchParams } = new URL(request.url);
    const stage = searchParams.get("stage")?.split(",").filter(Boolean) as any;
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : undefined;
    const offset = searchParams.get("offset")
      ? parseInt(searchParams.get("offset")!, 10)
      : undefined;

    const inventoryService = new InventoryService();
    const result = await inventoryService.getInventory(dealerId, {
      stage,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in inventory API:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL to .env.local",
      },
      { status: 503 },
    );
  }

  try {
    const supabase = createServerComponentClient();
    const {
      data: { user },
      error: authError,
    } = await getServerUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const dealerId = user.id;

    const body = await request.json();
    // Minimal required fields for acquisition from a deal
    const {
      vin = "",
      year = 0,
      make = "",
      model = "",
      trim,
      condition = "clean",
      purchasePrice = 0,
      auctionFee = 0,
      transportCost = 0,
      repairCost = 0,
      reconCost = 0,
      titleFee = 0,
      holdingCost = 0,
      otherCosts = 0,
      listPrice,
      marketValue,
      stage = "acquired",
      purchasedFrom,
      purchasedCity,
      purchasedState,
      notes,
      photos = [],
      listedPlatforms = [],
      // Loop-closing inputs: the source deal + the engine's prediction at purchase time.
      dealId,
      predictedProfit,
      predictedSell,
      predictedTransport,
      predictedRecon,
    } = body || {};

    const payload = {
      dealer_id: dealerId,
      vin,
      year,
      make,
      model,
      trim: trim || null,
      condition,
      purchase_price: purchasePrice,
      auction_fee: auctionFee,
      transport_cost: transportCost,
      repair_cost: repairCost,
      recon_cost: reconCost,
      title_fee: titleFee,
      holding_cost: holdingCost,
      other_costs: otherCosts,
      // total_cost is a GENERATED column — must not be inserted.
      list_price: listPrice ?? null,
      market_value: marketValue ?? null,
      stage,
      floor_date: new Date().toISOString(),
      daily_floor_rate: 35,
      photos,
      listed_platforms: listedPlatforms,
      purchased_from: purchasedFrom || null,
      purchased_city: purchasedCity || null,
      purchased_state: purchasedState || null,
      notes: notes || null,
      lead_count: 0,
    };

    const { data, error } = await supabase
      .from("inventory")
      .insert(payload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Close-the-loop, step 1: snapshot the engine's prediction into deal_outcomes (open/purchased
    // state). When this vehicle is later marked sold, we complete the row with actuals — and the
    // calibration engine learns from the prediction-vs-reality gap. Best-effort; never blocks the
    // acquisition.
    try {
      await supabase.from("deal_outcomes").insert({
        user_id: dealerId,
        deal_id: dealId ?? null,
        inventory_id: data.id,
        vin: vin || null,
        year: year || null,
        make: make || null,
        model: model || null,
        location_state: purchasedState || null,
        predicted_profit: predictedProfit ?? null,
        predicted_sell: predictedSell ?? marketValue ?? null,
        predicted_transport: predictedTransport ?? transportCost ?? null,
        predicted_recon: predictedRecon ?? reconCost ?? null,
        purchase_price: purchasePrice,
      });
    } catch (e) {
      console.warn("[inventory] outcome seed failed (non-fatal):", e);
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error("Error creating inventory:", error);
    return NextResponse.json(
      { error: "Failed to create inventory" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL to .env.local",
      },
      { status: 503 },
    );
  }

  try {
    const supabase = createServerComponentClient();
    const {
      data: { user },
      error: authError,
    } = await getServerUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const dealerId = user.id;

    const body = await request.json();
    const { id, stage, listed_platforms, soldPrice, soldWhere } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!stage && !listed_platforms) {
      return NextResponse.json(
        { error: "stage or listed_platforms required" },
        { status: 400 },
      );
    }

    // Verify ownership before updating (ensure this inventory row belongs to the authenticated dealer)
    const { data: row, error: fetchErr } = await supabase
      .from("inventory")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (row.dealer_id !== dealerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build update payload
    const update: any = {};
    if (stage) update.stage = stage;
    if (Array.isArray(listed_platforms))
      update.listed_platforms = listed_platforms;

    // Close-the-loop, step 2: a sale records the sold price + date, which completes the outcome.
    const isSale = stage === "sold";
    if (isSale && soldPrice != null) {
      update.sold_price = Number(soldPrice);
      update.sold_date = new Date().toISOString();
    }

    const { data, error: updErr } = await supabase
      .from("inventory")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // On sale, complete (or create) the deal_outcomes row with the REAL costs the inventory tracked,
    // so calibration learns from prediction-vs-actual. Best-effort; never blocks the stage change.
    if (isSale && soldPrice != null) {
      try {
        const sell = Number(soldPrice);
        const actualTransport = Number(row.transport_cost) || 0;
        const actualRecon =
          (Number(row.recon_cost) || 0) + (Number(row.repair_cost) || 0);
        const actualFees =
          (Number(row.auction_fee) || 0) +
          (Number(row.title_fee) || 0) +
          (Number(row.holding_cost) || 0) +
          (Number(row.other_costs) || 0);
        const purchase = Number(row.purchase_price) || 0;
        const actualProfit = Math.round(
          sell - purchase - actualTransport - actualRecon - actualFees,
        );
        const daysToSell = row.floor_date
          ? Math.max(
              0,
              Math.round(
                (Date.now() - new Date(row.floor_date).getTime()) / 86400000,
              ),
            )
          : null;

        const completion = {
          sell_price: sell,
          actual_transport: actualTransport,
          actual_recon: actualRecon,
          actual_fees: actualFees,
          actual_profit: actualProfit,
          days_to_sell: daysToSell,
          sold_where: soldWhere ?? null,
          sold_at: new Date().toISOString(),
        };

        // Complete the seeded outcome if it exists; otherwise create one (older inventory).
        const { data: existing } = await supabase
          .from("deal_outcomes")
          .select("id")
          .eq("inventory_id", id)
          .eq("user_id", dealerId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("deal_outcomes")
            .update(completion)
            .eq("id", existing.id);
        } else {
          await supabase.from("deal_outcomes").insert({
            user_id: dealerId,
            inventory_id: id,
            vin: row.vin || null,
            year: row.year || null,
            make: row.make || null,
            model: row.model || null,
            location_state: row.purchased_state || null,
            predicted_sell: row.market_value ?? null,
            purchase_price: purchase,
            ...completion,
          });
        }
      } catch (e) {
        console.warn("[inventory] outcome completion failed (non-fatal):", e);
      }
    }

    const inventoryService = new InventoryService();
    const item = inventoryService["mapDbToItem"]
      ? inventoryService["mapDbToItem"](data)
      : data;

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Error updating inventory:", error);
    return NextResponse.json(
      { error: "Failed to update inventory" },
      { status: 500 },
    );
  }
}
