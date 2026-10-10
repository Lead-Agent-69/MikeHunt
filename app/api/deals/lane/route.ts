export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  listingsForDesk,
  resolveCallerFlipDesk,
} from "@/lib/deals/deal-desk-access";
import { normalizeVin } from "@/lib/vehicle/vin";

// GET /api/deals/lane?vins=VIN1,VIN2 — deals for the auction lane / run-list offline cache.
// Replaces the browser's direct anon-key select("*") on deals (column privileges now block that).
// Signed-in only. Explicit columns; flip economics only for a saved reseller / dealer desk.
const LANE_COLUMNS = [
  "id",
  "source",
  "source_url",
  "title",
  "year",
  "make",
  "model",
  "trim",
  "vin",
  "mileage",
  "condition",
  "damage_type",
  "ask_price",
  "buy_now_price",
  "auction_end_at",
  "images",
  "location_city",
  "location_state",
  "updated_at",
  "sell_estimate",
  // Flip desk only (listingsForDesk strips / whitelists these for everyone else):
  "deal_verdict",
  "true_net_profit",
  "recommended_max_bid",
  "deal_analysis",
  "estimated_transport_cost",
  "estimated_repair_cost",
].join(", ");

const MAX_VINS = 200;

function withNoStore<T extends Response>(res: T): T {
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "deals-lane", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return withNoStore(tooManyRequests(rl));

  let userId: string | undefined;
  try {
    const {
      data: { user },
    } = await getServerUser();
    userId = user?.id;
  } catch {
    userId = undefined;
  }
  if (!userId) {
    return withNoStore(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }
  if (!isSupabaseConfigured()) {
    return withNoStore(NextResponse.json({ deals: [], configured: false }));
  }

  const raw = new URL(req.url).searchParams.get("vins");
  const vins = raw
    ? Array.from(
        new Set(
          raw
            .split(",")
            .map((v) => normalizeVin(v))
            .filter((v) => /^[A-Z0-9]{1,17}$/.test(v)),
        ),
      ).slice(0, MAX_VINS)
    : null;
  if (vins && vins.length === 0) {
    return withNoStore(NextResponse.json({ deals: [] }));
  }

  try {
    const supabase = createServerComponentClient();
    let q = supabase.from("deals").select(LANE_COLUMNS);
    q = vins
      ? q.in("vin", vins)
      : q
          .eq("active", true)
          .order("updated_at", { ascending: false })
          .limit(100);
    const { data, error } = await q;
    if (error) throw error;
    const flipDesk = await resolveCallerFlipDesk();
    return withNoStore(
      NextResponse.json({
        deals: listingsForDesk(
          (data || []) as unknown as Record<string, unknown>[],
          flipDesk,
        ),
        deskAccess: flipDesk ? "flip" : "personal",
      }),
    );
  } catch (e) {
    console.error("[deals-lane]", e instanceof Error ? e.message : e);
    return withNoStore(
      NextResponse.json(
        { error: "Could not load lane deals" },
        { status: 500 },
      ),
    );
  }
}
