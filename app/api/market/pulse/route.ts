export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

// GET /api/market/pulse — "what the market's doing": the make/models with the most live GO deals,
// their avg profit and days-on-market. Powers the home-screen intelligence cards.
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, {
    key: "market-pulse",
    limit: 60,
    windowMs: 60000,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ rows: [], configured: false });
  }

  const supabase = createServerComponentClient();
  const { data, error } = await supabase.rpc("get_market_pulse");
  if (error)
    return NextResponse.json({ rows: [], error: "Market pulse unavailable" });

  const rows = (data || []).map((r: any) => ({
    make: r.make,
    model: r.model,
    goDeals: Number(r.go_deals) || 0,
    avgProfit: Math.round(Number(r.avg_profit) || 0),
    avgDays: Number(r.avg_days) || 0,
  }));

  return NextResponse.json({ rows });
}
