export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

export async function POST(req: NextRequest) {
  try {
    const {
      data: { user },
    } = await getServerUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { vehicleId, parts, salvageCost, partsValue, net } = body;

    if (!vehicleId || !Array.isArray(parts)) {
      return NextResponse.json(
        { error: "vehicleId and parts required" },
        { status: 400 },
      );
    }

    const supabase = createServerComponentClient();

    const { data, error } = await supabase
      .from("teardowns")
      .insert({
        // service-role client → auth.uid() is null, so set the owner explicitly
        dealer_id: user.id,
        inventory_id: vehicleId,
        parts,
        salvage_cost: salvageCost,
        parts_value: partsValue,
        net_profit: net,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Teardown insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, teardown: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
