export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { outcomePredictionSnapshot } from "@/lib/outcomes/snapshot";
import { actualAmount } from "@/lib/outcomes/ledger";
import { internalError } from "@/lib/api/http-error";
import { InventoryService } from "@/lib/data/inventory-service";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      items: [],
      total: 0,
      message:
        "Supabase is not configured, so inventory tracking is unavailable.",
    });
  }

  try {
    // Derive dealerId from authenticated session (server-side source of truth)
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
        configured: false,
        error: "Supabase is not configured, so inventory cannot be created.",
      },
      { status: 400 },
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
      // The source listing identifies a server-captured prediction snapshot.
      dealId,
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
      return internalError("inventory", error);
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
        ...(await outcomePredictionSnapshot(supabase, dealId)),
        purchase_price: purchasePrice,
        purchased_at: data.floor_date ?? null,
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
    const { id, stage, listed_platforms, soldPrice, soldWhere, expense } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!stage && !listed_platforms && !expense) {
      return NextResponse.json(
        { error: "stage, listed_platforms or expense required" },
        { status: 400 },
      );
    }
    const validStages = [
      "acquired",
      "transport",
      "recon",
      "listed",
      "offer",
      "sold",
      "wholesale",
    ];
    if (stage && !validStages.includes(stage))
      return NextResponse.json(
        { error: "Invalid inventory stage" },
        { status: 400 },
      );
    if (
      stage === "sold" &&
      (typeof soldPrice !== "number" || actualAmount(soldPrice) == null)
    )
      return NextResponse.json(
        { error: "Actual non-negative sale price required" },
        { status: 400 },
      );
    const expenseFields: Record<string, string> = {
      transport: "transport_cost",
      repair: "repair_cost",
      recon: "recon_cost",
      title: "title_fee",
      other: "other_costs",
    };
    const expenseField =
      expense &&
      Object.prototype.hasOwnProperty.call(expenseFields, expense.category)
        ? expenseFields[expense.category]
        : undefined;
    if (
      expense &&
      (!expenseField ||
        typeof expense.amount !== "number" ||
        !Number.isFinite(expense.amount) ||
        expense.amount <= 0 ||
        typeof expense.expectedTotal !== "number" ||
        !Number.isFinite(expense.expectedTotal) ||
        expense.expectedTotal < 0 ||
        stage ||
        listed_platforms)
    )
      return NextResponse.json(
        { error: "Invalid expense record" },
        { status: 400 },
      );

    // Verify ownership before updating (ensure this inventory row belongs to the authenticated dealer)
    const { data: row, error: fetchErr } = await supabase
      .from("inventory")
      .select("*")
      .eq("id", id)
      .eq("dealer_id", dealerId)
      .single();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (row.dealer_id !== dealerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (stage === "sold" && row.stage === "sold")
      return NextResponse.json(
        { error: "Sale already recorded. Reload Pipeline." },
        { status: 409 },
      );

    // Build update payload
    const update: any = {};
    if (expenseField) {
      const current = Number(row[expenseField] ?? 0);
      if (
        current !== expense.expectedTotal ||
        !Number.isFinite(current + expense.amount)
      )
        return NextResponse.json(
          {
            error:
              "Costs changed. Reload Pipeline before recording this expense.",
          },
          { status: 409 },
        );
      update[expenseField] = Math.round((current + expense.amount) * 100) / 100;
    }
    if (stage) update.stage = stage;
    if (Array.isArray(listed_platforms))
      update.listed_platforms = listed_platforms;

    // Close-the-loop, step 2: a sale records the sold price + date, which completes the outcome.
    const isSale = stage === "sold";
    if (isSale && soldPrice != null) {
      update.sold_price = Number(soldPrice);
      update.sold_date = new Date().toISOString();
    }

    let write = supabase
      .from("inventory")
      .update(update)
      .eq("id", id)
      .eq("dealer_id", dealerId);
    // Match the read snapshot so concurrent records cannot silently replace a cost or stage.
    if (expenseField)
      write =
        row[expenseField] == null
          ? write.is(expenseField, null)
          : write.eq(expenseField, row[expenseField]);
    if (stage) write = write.eq("stage", row.stage);
    const { data, error: updErr } = await write.select().maybeSingle();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    if (!data)
      return NextResponse.json(
        { error: "Inventory changed. Reload Pipeline before retrying." },
        { status: 409 },
      );

    let outcomeSynced = false;
    // Stage changes report a sale but never certify default inventory costs as actuals.
    // Preserve reviewed records and protect concurrent edits with the outcome revision.
    if (isSale && soldPrice != null) {
      try {
        const completion = {
          costs_complete: false,
          sell_price: Number(soldPrice),
          sold_where: soldWhere ?? null,
          sold_at: new Date().toISOString(),
        };
        const { data: existing, error: readError } = await supabase
          .from("deal_outcomes")
          .select("id,revision,sell_price")
          .eq("inventory_id", id)
          .eq("user_id", dealerId)
          .maybeSingle();
        if (readError) throw readError;
        if (existing && existing.sell_price == null) {
          const result = await supabase
            .from("deal_outcomes")
            .update(completion)
            .eq("id", existing.id)
            .eq("user_id", dealerId)
            .eq("revision", existing.revision)
            .is("sell_price", null)
            .select("id")
            .maybeSingle();
          if (result.error || !result.data)
            throw new Error("Outcome update unconfirmed");
          outcomeSynced = true;
        } else if (!existing) {
          const result = await supabase
            .from("deal_outcomes")
            .insert({
              user_id: dealerId,
              inventory_id: id,
              deal_id: row.deal_id ?? null,
              vin: row.vin || null,
              year: row.year || null,
              make: row.make || null,
              model: row.model || null,
              location_state: row.purchased_state || null,
              purchase_price: Number(row.purchase_price) || null,
              purchased_at: row.floor_date ?? null,
              ...completion,
            })
            .select("id")
            .single();
          if (result.error || !result.data)
            throw new Error("Outcome creation unconfirmed");
          outcomeSynced = true;
        }
      } catch (e) {
        console.warn("[inventory] outcome completion failed (non-fatal):", e);
      }
    }

    const inventoryService = new InventoryService();
    const item = inventoryService["mapDbToItem"]
      ? inventoryService["mapDbToItem"](data)
      : data;

    return NextResponse.json({
      item,
      ...(isSale
        ? {
            outcomeReview: {
              synced: outcomeSynced,
              message: outcomeSynced
                ? "Sale saved. Review the purchase date and all actual costs in Outcomes and learning."
                : "Sale saved in Pipeline. Its outcome record needs review because the sale could not be copied or a previous sale is already recorded. Open Outcomes and learning before relying on net results.",
            },
          }
        : {}),
    });
  } catch (error) {
    console.error("Error updating inventory:", error);
    return NextResponse.json(
      { error: "Failed to update inventory" },
      { status: 500 },
    );
  }
}
