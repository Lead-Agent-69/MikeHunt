export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";

// GET /api/market/ticker — items for the scrolling home ticker. New GO today, biggest movers,
// flash count. All derived from data we already have.
export async function GET() {
  const supabase = createServerComponentClient();
  const since = new Date(Date.now() - 86400000).toISOString();

  const [newGo, pulse, movers, flash] = await Promise.all([
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("deal_verdict", "go")
      .eq("active", true)
      .gte("created_at", since),
    supabase.rpc("get_market_pulse"),
    supabase
      .from("market_timing_signals")
      .select("make, model, signal, pct_change")
      .neq("signal", "NEUTRAL")
      .order("data_points", { ascending: false })
      .limit(10),
    supabase.from("flash_deals").select("id", { count: "exact", head: true }),
  ]);

  const items: { label: string; change: number }[] = [];

  items.push({ label: `New BUY deals today: ${newGo.count || 0}`, change: 0 });
  if (flash.count)
    items.push({ label: `Flash deals live now: ${flash.count}`, change: 0 });

  for (const p of (pulse.data || []).slice(0, 4)) {
    if (p.avg_profit)
      items.push({
        label: `${p.make} ${p.model}: ${p.go_deals} BUY · $${Math.round(Number(p.avg_profit)).toLocaleString()} avg profit`,
        change: 0,
      });
  }
  for (const m of (movers.data || []).slice(0, 4)) {
    if (m.pct_change != null)
      items.push({
        label: `${m.make} ${m.model}`,
        change: Number(m.pct_change),
      });
  }

  return NextResponse.json({ items });
}
