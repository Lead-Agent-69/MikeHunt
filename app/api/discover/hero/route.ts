export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";

// GET /api/discover/hero?state= — the one-glance money headline for the home hero: how many live GO
// deals, the total profit on the table, and the single best flip right now. Makes the value the
// FIRST thing a dealer feels, not something they have to dig for.
export async function GET(req: NextRequest) {
  const state = new URL(req.url).searchParams.get("state") || "";
  const supabase = createServerComponentClient();

  let q = supabase
    .from("deals")
    .select(
      "id, year, make, model, true_net_profit, ask_price, recommended_max_bid, location_state, source",
      { count: "exact" },
    )
    .eq("active", true)
    .eq("deal_verdict", "go")
    .gt("true_net_profit", 0)
    .order("true_net_profit", { ascending: false })
    .limit(1000);
  if (state) q = q.eq("location_state", state);

  const { data, count, error } = await q;
  if (error)
    return NextResponse.json({ goCount: 0, totalProfit: 0, top: null });

  const rows = data || [];
  const totalProfit = rows.reduce(
    (s: number, d: any) => s + Math.max(0, Number(d.true_net_profit) || 0),
    0,
  );
  const t = rows[0];
  const top = t
    ? {
        id: t.id,
        name: `${t.year || ""} ${t.make || ""} ${t.model || ""}`
          .replace(/\s+/g, " ")
          .trim(),
        profit: Math.round(Number(t.true_net_profit) || 0),
        ask: Math.round(Number(t.ask_price) || 0),
        maxBid: Math.round(Number(t.recommended_max_bid) || 0),
        state: t.location_state || null,
        source: t.source || null,
      }
    : null;

  return NextResponse.json({
    goCount: count ?? rows.length,
    totalProfit: Math.round(totalProfit),
    shown: rows.length, // how many of the GO deals are in the summed total (for honesty)
    top,
  });
}
