export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import {
  redactListingForNonFlipDesk,
  resolveCallerFlipDesk,
} from "@/lib/deals/deal-desk-access";

// GET /api/alerts — the signed-in user's feed inbox with joined deals.
// createServerComponentClient is service-role, so every query is scoped by session user_id.
// Deal rows are redacted with the same helper as Discover/Feed (#45/#46) so personal/DIY/parts
// never receive profit_estimate / max bid / seller contact over the wire.

const DEAL_COLS =
  "id, source, year, make, model, ask_price, mmr_value, sell_estimate, profit_estimate, profit_score, true_net_profit, recommended_max_bid, deal_verdict, location_city, location_state, mileage, condition, damage_type, images, options";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      alerts: [],
      deskAccess: "personal",
      configured: false,
    });
  }

  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerComponentClient();
  const flipDesk = await resolveCallerFlipDesk();

  const { data, error } = await supabase
    .from("user_feed_inbox")
    .select(
      `
      id,
      status,
      created_at,
      deal_id,
      deals ( ${DEAL_COLS} )
    `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[alerts]", error.message);
    return NextResponse.json({ error: "Alerts unavailable" }, { status: 500 });
  }

  const alerts = (data || []).map((row: any) => {
    const deal = row.deals;
    return {
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      deal_id: row.deal_id,
      deals:
        deal && typeof deal === "object"
          ? flipDesk
            ? deal
            : redactListingForNonFlipDesk(deal)
          : null,
    };
  });

  return NextResponse.json({
    alerts,
    deskAccess: flipDesk ? "flip" : "personal",
    configured: true,
  });
}
