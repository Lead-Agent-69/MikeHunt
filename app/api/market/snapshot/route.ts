export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// GET /api/market/snapshot?make=Honda&model=Accord&year=2018&daysAgo=30
// "Time travel": compare today's average ask to a historical snapshot from market_aggregates.
// "30 days ago this averaged $11,200 — now $10,800 (−$400)."
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "snapshot", limit: 90, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const { searchParams } = new URL(req.url);
  const make = searchParams.get("make");
  const model = searchParams.get("model");
  const year = parseInt(searchParams.get("year") || "0", 10);
  const daysAgo = Math.min(
    365,
    Math.max(7, parseInt(searchParams.get("daysAgo") || "30", 10) || 30),
  );
  if (!make || !model)
    return NextResponse.json(
      { error: "make and model required" },
      { status: 400 },
    );

  const supabase = createServerComponentClient();
  const cutoff = new Date(Date.now() - daysAgo * 86400000).toISOString();

  // Historical avg ask from the nightly aggregate at/just-before the target date.
  let hq = supabase
    .from("market_aggregates")
    .select("avg_ask, avg_market_value, unit_count, computed_at")
    .ilike("make", make)
    .ilike("model", `%${model.split(" ")[0]}%`)
    .lte("computed_at", cutoff)
    .order("computed_at", { ascending: false })
    .limit(1);
  if (year) hq = hq.eq("year", year);
  const { data: hist } = await hq;

  // Current avg ask from live deals.
  let cq = supabase
    .from("deals")
    .select("ask_price")
    .eq("active", true)
    .ilike("make", make)
    .ilike("model", `%${model.split(" ")[0]}%`)
    .gt("ask_price", 0)
    .limit(500);
  if (year) cq = cq.gte("year", year - 1).lte("year", year + 1);
  const { data: cur } = await cq;

  const currentAvg =
    cur && cur.length
      ? Math.round(
          cur.reduce((s: number, d: any) => s + Number(d.ask_price), 0) /
            cur.length,
        )
      : null;
  const historicalAvg =
    hist?.[0]?.avg_ask != null ? Math.round(Number(hist[0].avg_ask)) : null;

  return NextResponse.json({
    daysAgo,
    currentAvg,
    historicalAvg,
    change:
      currentAvg != null && historicalAvg != null
        ? currentAvg - historicalAvg
        : null,
    pctChange:
      currentAvg != null && historicalAvg
        ? Math.round(((currentAvg - historicalAvg) / historicalAvg) * 1000) / 10
        : null,
  });
}
