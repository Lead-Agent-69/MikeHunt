export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";

// GET /api/dashboard/summary — at-a-glance market intelligence for the home/discover top.
// "17 new GO deals today · avg 18d to sell · F-150 +6% (buy now)". All from data we already have.
export async function GET() {
  const supabase = createServerComponentClient();
  const since = new Date(Date.now() - 86400000).toISOString();

  const [newGo, activeGo, outcomes, movers] = await Promise.all([
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("deal_verdict", "go")
      .eq("active", true)
      .gte("created_at", since),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("deal_verdict", "go")
      .eq("active", true),
    supabase
      .from("deal_outcomes")
      .select("days_to_sell")
      .not("days_to_sell", "is", null)
      .limit(500),
    supabase
      .from("market_timing_signals")
      .select("make, model, signal, pct_change, data_points")
      .neq("signal", "NEUTRAL")
      .order("data_points", { ascending: false })
      .limit(40),
  ]);

  // Avg days to sell (market-wide, anonymized; needs a few data points).
  let avgDaysToSell: number | null = null;
  const days = (outcomes.data || [])
    .map((o: any) => Number(o.days_to_sell))
    .filter((n) => Number.isFinite(n));
  if (days.length >= 3)
    avgDaysToSell = Math.round(days.reduce((s, x) => s + x, 0) / days.length);

  // Biggest mover by absolute % change.
  const sortedMovers = (movers.data || [])
    .filter((m: any) => m.pct_change != null)
    .sort(
      (a: any, b: any) =>
        Math.abs(Number(b.pct_change)) - Math.abs(Number(a.pct_change)),
    );
  const topMover = sortedMovers[0]
    ? {
        make: sortedMovers[0].make,
        model: sortedMovers[0].model,
        signal: sortedMovers[0].signal,
        pctChange: Number(sortedMovers[0].pct_change),
      }
    : null;

  return NextResponse.json({
    newGoToday: newGo.count || 0,
    activeGo: activeGo.count || 0,
    avgDaysToSell,
    topMover,
  });
}
