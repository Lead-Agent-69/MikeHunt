export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { outcomePredictionSnapshot } from "@/lib/outcomes/snapshot";
import { canCapturePurchasePrediction } from "@/lib/outcomes/prediction-timing";
import { actualAmount } from "@/lib/outcomes/ledger";
import { internalError } from "@/lib/api/http-error";
import { InventoryService } from "@/lib/data/inventory-service";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import {
  samePurchase,
  validatePurchase,
} from "@/lib/inventory/purchase-record";
import { listingPhotos } from "@/lib/search/customer-inventory";
import type { SupabaseClient } from "@supabase/supabase-js";

function ownerMismatch(request: NextRequest, ownerId: string) {
  const expected = [
    request.headers.get("x-inventory-owner"),
    new URL(request.url).searchParams.get("dealerId"),
  ];
  return expected.some((id) => id !== null && id !== ownerId)
    ? NextResponse.json(
        {
          error:
            "Your account changed. Reload your vehicles before continuing.",
        },
        { status: 409 },
      )
    : null;
}

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
    const mismatch = ownerMismatch(request, dealerId);
    if (mismatch) return mismatch;

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

    return NextResponse.json(
      { ...result, ownerId: dealerId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Error in inventory API:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 },
    );
  }
}

async function purchaseConfirmation(
  supabase: SupabaseClient,
  dealerId: string,
  row: Record<string, any>,
  replayed: boolean,
  snapshot?: Awaited<ReturnType<typeof outcomePredictionSnapshot>>,
) {
  // A deterministic seed id prevents concurrent retries from duplicating this outcome.
  // A recovered purchase never captures a later prediction as if it preceded purchase.
  let synced = false;
  try {
    const prior = await supabase
      .from("deal_outcomes")
      .select("id")
      .eq("inventory_id", row.id)
      .eq("user_id", dealerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data) synced = true;
    else {
      const seed = await supabase
        .from("deal_outcomes")
        .insert({
          id: row.id,
          user_id: dealerId,
          deal_id: row.deal_id ?? null,
          inventory_id: row.id,
          vin: row.vin || null,
          year: row.year || null,
          make: row.make || null,
          model: row.model || null,
          location_state: row.purchased_state || null,
          ...(!replayed ? snapshot : null),
          purchase_price: row.purchase_price,
          purchased_at: row.floor_date ?? null,
          costs_complete: false,
        })
        .select("id,inventory_id,user_id")
        .single();
      if (seed.error?.code === "23505") {
        const confirmed = await supabase
          .from("deal_outcomes")
          .select("id,inventory_id,user_id")
          .eq("id", row.id)
          .eq("user_id", dealerId)
          .maybeSingle();
        synced =
          !confirmed.error &&
          confirmed.data?.inventory_id === row.id &&
          confirmed.data?.user_id === dealerId;
      } else {
        if (seed.error) throw seed.error;
        synced =
          seed.data?.inventory_id === row.id && seed.data?.user_id === dealerId;
      }
    }
  } catch (error) {
    console.warn(
      "[inventory] purchase saved; outcome seed not confirmed:",
      error,
    );
  }
  return NextResponse.json(
    {
      ownerId: dealerId,
      item: new InventoryService().mapDbToItem(row),
      replayed,
      outcomeReview: {
        synced,
        message: synced
          ? "Purchase recorded. Review actual expenses in Pipeline before using net results."
          : "Purchase recorded. Outcome tracking needs review in Pipeline. Do not record the purchase again.",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
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
    const {
      data: { user },
      error: authError,
    } = await getServerUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const dealerId = user.id;
    const mismatch = ownerMismatch(request, dealerId);
    if (mismatch) return mismatch;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Send a JSON object." },
        { status: 400 },
      );
    }
    const validated = validatePurchase(body);
    if (validated.error)
      return NextResponse.json({ error: validated.error }, { status: 400 });
    const input = validated.value!;
    const supabase = createServerComponentClient();
    const prior = await supabase
      .from("inventory")
      .select("*")
      .eq("id", input.id)
      .eq("dealer_id", dealerId)
      .maybeSingle();
    if (prior.error) return internalError("purchase-read", prior.error);
    const conflict = () =>
      NextResponse.json(
        {
          error:
            "This purchase record already exists with different details. Review it in Pipeline before continuing.",
        },
        { status: 409 },
      );
    if (prior.data)
      return samePurchase(prior.data, input)
        ? purchaseConfirmation(supabase, dealerId, prior.data, true)
        : conflict();

    let source: Record<string, any> | null = null;
    let snapshot: Awaited<ReturnType<typeof outcomePredictionSnapshot>> = null;
    if (input.dealId) {
      const listing = await supabase
        .from("deals")
        .select(
          "id,vin,year,make,model,trim,mileage,images,options,source,location_city,location_state",
        )
        .eq("id", input.dealId)
        .maybeSingle();
      if (listing.error) return internalError("purchase-source", listing.error);
      if (!listing.data)
        return NextResponse.json(
          {
            error:
              "Source listing not found. Reload the listing before recording this purchase.",
          },
          { status: 404 },
        );
      source = listing.data;
      // Source identity wins; stale or unrelated client details must not attach the wrong car.
      if (
        (input.texts.vin &&
          source!.vin &&
          input.texts.vin !== String(source!.vin).toUpperCase()) ||
        (input.year && source!.year && input.year !== source!.year) ||
        ["make", "model"].some(
          (key) =>
            input.texts[key] &&
            source![key] &&
            input.texts[key].toLowerCase() !==
              String(source![key]).toLowerCase(),
        )
      )
        return NextResponse.json(
          {
            error:
              "Vehicle details changed. Reload the source listing before recording this purchase.",
          },
          { status: 409 },
        );
      // Fail before recording if the before-purchase prediction cannot be read.
      if (canCapturePurchasePrediction(input.purchasedAt))
        snapshot = await outcomePredictionSnapshot(supabase, input.dealId);
    }
    const t = input.texts;
    const payload = {
      id: input.id,
      dealer_id: dealerId,
      deal_id: input.dealId,
      vin: source?.vin || t.vin,
      year: source?.year || input.year,
      make: source?.make || t.make,
      model: source?.model || t.model,
      trim: source?.trim || t.trim || null,
      odometer: source?.mileage ?? null,
      condition: t.condition || "unknown",
      ...input.amounts,
      // total_cost is a GENERATED column — must not be inserted.
      stage: "acquired",
      floor_date: input.purchasedAt,
      daily_floor_rate: 35,
      photos: source
        ? listingPhotos(source.images, source.options?.photoAudit)
        : input.photos,
      listed_platforms: input.listedPlatforms,
      purchased_from: t.purchasedFrom || source?.source || null,
      purchased_city: t.purchasedCity || source?.location_city || null,
      purchased_state: t.purchasedState || source?.location_state || null,
      notes: t.notes || null,
      lead_count: 0,
    };

    const { data, error } = await supabase
      .from("inventory")
      .insert(payload)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        const saved = await supabase
          .from("inventory")
          .select("*")
          .eq("id", input.id)
          .eq("dealer_id", dealerId)
          .maybeSingle();
        if (!saved.error && saved.data && samePurchase(saved.data, input))
          return purchaseConfirmation(supabase, dealerId, saved.data, true);
        return conflict();
      }
      return internalError("inventory", error);
    }
    if (!data || data.id !== input.id || data.dealer_id !== dealerId)
      return NextResponse.json(
        {
          error:
            "Purchase was not confirmed. Retry this same record to check its saved status.",
        },
        { status: 502 },
      );
    return purchaseConfirmation(supabase, dealerId, data, false, snapshot);
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
    const {
      data: { user },
      error: authError,
    } = await getServerUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const dealerId = user.id;
    const mismatch = ownerMismatch(request, dealerId);
    if (mismatch) return mismatch;
    const supabase = createServerComponentClient();

    let body;
    try {
      body = await request.json();
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new Error("body");
    } catch {
      return NextResponse.json(
        { error: "Send a JSON object." },
        { status: 400 },
      );
    }
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
      (listed_platforms !== undefined &&
        (!Array.isArray(listed_platforms) ||
          listed_platforms.length > 25 ||
          listed_platforms.some(
            (name: unknown) => typeof name !== "string" || name.length > 100,
          ))) ||
      (soldWhere != null &&
        (typeof soldWhere !== "string" || soldWhere.length > 500))
    )
      return NextResponse.json(
        { error: "Check the listing platforms and sale channel." },
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
        actualAmount(expense.amount) === null ||
        expense.amount <= 0 ||
        typeof expense.expectedTotal !== "number" ||
        actualAmount(expense.expectedTotal) === null ||
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
      if (actualAmount(update[expenseField]) === null)
        return NextResponse.json(
          {
            error:
              "The category total exceeds the supported amount. Check your expense record.",
          },
          { status: 400 },
        );
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
      return internalError("inventory-update", updErr);
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
              id: row.id,
              user_id: dealerId,
              inventory_id: id,
              deal_id: row.deal_id ?? null,
              vin: row.vin || null,
              year: row.year || null,
              make: row.make || null,
              model: row.model || null,
              location_state: row.purchased_state || null,
              purchase_price:
                row.purchase_price != null ? Number(row.purchase_price) : null,
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
      ownerId: dealerId,
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
