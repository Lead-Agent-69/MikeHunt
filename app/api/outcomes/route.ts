export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

// /api/outcomes — dealers log what ACTUALLY happened on a deal. This is the feedback the verdict
// engine learns from (see lib/scoring/calibration.ts). Auth-scoped to the logged-in user.

export async function POST(req: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const purchasePrice = Number(body.purchase_price ?? body.purchasePrice);
  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    return NextResponse.json(
      { error: "purchase_price is required and must be > 0" },
      { status: 400 },
    );
  }

  const sellPrice = body.sell_price != null ? Number(body.sell_price) : null;
  const actualTransport =
    body.actual_transport != null ? Number(body.actual_transport) : null;
  const actualRecon =
    body.actual_recon != null ? Number(body.actual_recon) : null;
  const actualFees = body.actual_fees != null ? Number(body.actual_fees) : null;

  // Derive actual profit when the sale is logged and not explicitly provided.
  let actualProfit =
    body.actual_profit != null ? Number(body.actual_profit) : null;
  if (actualProfit == null && sellPrice != null) {
    actualProfit = Math.round(
      sellPrice -
        purchasePrice -
        (actualTransport || 0) -
        (actualRecon || 0) -
        (actualFees || 0),
    );
  }

  const row = {
    user_id: user.id,
    deal_id: body.deal_id ?? null,
    inventory_id: body.inventory_id ?? null,
    vin: body.vin ?? null,
    year: body.year ?? null,
    make: body.make ?? null,
    model: body.model ?? null,
    location_state: body.location_state ?? null,
    predicted_profit: body.predicted_profit ?? null,
    predicted_sell: body.predicted_sell ?? null,
    predicted_transport: body.predicted_transport ?? null,
    predicted_recon: body.predicted_recon ?? null,
    purchase_price: purchasePrice,
    sell_price: sellPrice,
    actual_transport: actualTransport,
    actual_recon: actualRecon,
    actual_fees: actualFees,
    actual_profit: actualProfit,
    days_to_sell: body.days_to_sell ?? null,
    sold_where: body.sold_where ?? null,
    sold_at:
      sellPrice != null ? (body.sold_at ?? new Date().toISOString()) : null,
    notes: body.notes ?? null,
  };

  const supabase = createServerComponentClient();
  const { data, error } = await supabase
    .from("deal_outcomes")
    .insert(row)
    .select("id")
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, id: data.id });
}

export async function GET() {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerComponentClient();
  const { data, error } = await supabase
    .from("deal_outcomes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ outcomes: data || [] });
}
