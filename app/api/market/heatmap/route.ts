export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { cached } from "@/lib/cache";

// /api/market/heatmap — where the actionable money is, by state. Aggregates the engine-vetted
// (GO/HOLD) inventory per state: how many opportunities + the profit they carry. Powers the US tile
// heatmap so a dealer sees the whole-country opportunity distribution at a glance. GO/HOLD is a small
// set (hundreds), so this is one cheap pass — no full-table scan.
export async function GET() {
  try {
    // Global aggregate — cache 90s so the map paints instantly on every visit.
    const payload = await cached("market:heatmap", 90_000, async () => {
      const sb = createServerComponentClient();
      const byState: Record<
        string,
        { n: number; totalProfit: number; maxProfit: number }
      > = {};
      for (let page = 0; page < 6; page++) {
        const { data, error } = await sb
          .from("deals")
          .select("location_state, true_net_profit")
          .eq("active", true)
          .in("deal_verdict", ["go", "hold"])
          .gt("ask_price", 0)
          .range(page * 1000, (page + 1) * 1000 - 1);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        for (const d of data) {
          const st = (d.location_state || "").toUpperCase();
          if (!st || st.length !== 2) continue;
          const b = (byState[st] ??= { n: 0, totalProfit: 0, maxProfit: 0 });
          const p = Number(d.true_net_profit) || 0;
          b.n += 1;
          b.totalProfit += Math.max(0, p);
          b.maxProfit = Math.max(b.maxProfit, p);
        }
        if (data.length < 1000) break;
      }

      const states = Object.fromEntries(
        Object.entries(byState).map(([st, b]) => [
          st,
          {
            n: b.n,
            avgProfit: b.n ? Math.round(b.totalProfit / b.n) : 0,
            maxProfit: Math.round(b.maxProfit),
          },
        ]),
      );
      const maxN = Math.max(1, ...Object.values(states).map((s) => s.n));
      const total = Object.values(states).reduce((s, v) => s + v.n, 0);
      return { states, maxN, total };
    });
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
