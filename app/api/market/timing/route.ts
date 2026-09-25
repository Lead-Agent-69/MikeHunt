export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// GET /api/market/timing?make=Ford&model=F-150
// Buy-now / wait signal from the live ask-price trend (market_timing_signals view), plus a real
// average days-to-sell derived from logged outcomes once enough exist. Both degrade to null quietly.
const REASONING: Record<string, string> = {
  BUY_NOW: "Prices are rising — buying now beats waiting.",
  WAIT: "Prices are softening — waiting may land a better basis.",
  NEUTRAL: "Prices are stable — timing isn’t a major factor.",
};

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "timing", limit: 120, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const { searchParams } = new URL(req.url);
  const make = searchParams.get("make");
  const model = searchParams.get("model");
  if (!make || !model) {
    return NextResponse.json(
      { error: "make and model are required" },
      { status: 400 },
    );
  }

  const supabase = createServerComponentClient();

  // Timing signal — match on make + the first model token to be resilient to trims.
  const { data: signals } = await supabase
    .from("market_timing_signals")
    .select("*")
    .eq("make", make)
    .ilike("model", `%${model.split(" ")[0]}%`)
    .order("data_points", { ascending: false })
    .limit(1);

  const sig = signals?.[0] || null;

  // Real days-to-sell from completed outcomes (anonymized aggregate; needs a few data points).
  let avgDaysToSell: number | null = null;
  try {
    const { data: outcomes } = await supabase
      .from("deal_outcomes")
      .select("days_to_sell")
      .eq("make", make)
      .ilike("model", `%${model.split(" ")[0]}%`)
      .not("days_to_sell", "is", null)
      .limit(200);
    if (outcomes && outcomes.length >= 3) {
      const days = outcomes
        .map((o) => Number(o.days_to_sell))
        .filter((n) => Number.isFinite(n));
      avgDaysToSell = Math.round(days.reduce((s, x) => s + x, 0) / days.length);
    }
  } catch {
    // table may be empty — fine
  }

  return NextResponse.json({
    make,
    model,
    timing_signal: sig?.signal ?? null,
    pct_change_30d: sig?.pct_change ?? null,
    current_avg_price: sig?.current_avg ?? null,
    data_points: sig?.data_points ?? 0,
    reasoning: sig ? REASONING[sig.signal] : null,
    avg_days_to_sell: avgDaysToSell,
  });
}
