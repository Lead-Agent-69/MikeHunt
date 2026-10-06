export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createServerComponentClient } from "@/lib/supabase";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";

// GET /api/market/ticker — items for the scrolling home ticker. New GO today, biggest movers,
// flash count. All derived from data we already have.
// Eva P0: BUY counts, flash (GO-based) counts and avg-profit lines are flip economics — flip desks
// only. Everyone else gets "new listings today" plus price movers. Desk-scoped → private, no-store.
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, {
    key: "market-ticker",
    limit: 60,
    windowMs: 60000,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  const flipDesk = await resolveCallerFlipDesk();
  const supabase = createServerComponentClient();
  const since = new Date(Date.now() - 86400000).toISOString();

  let newToday = supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .gte("created_at", since);
  if (flipDesk) newToday = newToday.eq("deal_verdict", "go");

  const [newCount, pulse, movers, flash] = await Promise.all([
    newToday,
    flipDesk ? supabase.rpc("get_market_pulse") : Promise.resolve({ data: [] }),
    supabase
      .from("market_timing_signals")
      .select("make, model, signal, pct_change")
      .neq("signal", "NEUTRAL")
      .order("data_points", { ascending: false })
      .limit(10),
    flipDesk
      ? supabase.from("flash_deals").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: 0 }),
  ]);

  const items: { label: string; change: number }[] = [];

  if (flipDesk) {
    items.push({
      label: `New BUY deals today: ${newCount.count || 0}`,
      change: 0,
    });
    if (flash.count)
      items.push({ label: `Flash deals live now: ${flash.count}`, change: 0 });
    for (const p of ((pulse as { data?: any[] }).data || []).slice(0, 4)) {
      if (p.avg_profit)
        items.push({
          label: `${p.make} ${p.model}: ${p.go_deals} BUY · $${Math.round(Number(p.avg_profit)).toLocaleString()} avg profit`,
          change: 0,
        });
    }
  } else {
    items.push({
      label: `New listings today: ${newCount.count || 0}`,
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

  return NextResponse.json(
    { items, deskAccess: flipDesk ? "flip" : "personal" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
