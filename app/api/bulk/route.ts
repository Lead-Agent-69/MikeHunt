export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// /api/bulk — multi-unit sourcing for fleet/wholesale buyers. Groups currently-active deals by
// make+model so a buyer can spot "5 Transit vans under $15k across 3 sources" in one place — a
// capability the single-car scanner never offered.
//   ?minCount=2&state=TX&maxPrice=20000&titleType=clean

function normModel(model?: string | null): string {
  return (model || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export async function GET(req: NextRequest) {
  try {
    const rl = rateLimit(req, { key: "bulk", limit: 60, windowMs: 60_000 });
    if (!rl.allowed) return tooManyRequests(rl);

    const { searchParams } = new URL(req.url);
    const minCount = Math.max(
      2,
      parseInt(searchParams.get("minCount") || "2", 10) || 2,
    );
    const state = searchParams.get("state")?.toUpperCase();
    const maxPrice = parseInt(searchParams.get("maxPrice") || "0", 10);
    const titleType = searchParams.get("titleType") || "";

    const supabase = createServerComponentClient();
    let q = supabase
      .from("deals")
      .select(
        "id, source, source_url, year, make, model, ask_price, mileage, condition, deal_verdict, true_net_profit, sell_estimate, profit_score, location_state, location_city, images",
      )
      .eq("active", true)
      .gt("ask_price", 0)
      .order("profit_score", { ascending: false, nullsFirst: false })
      .limit(5000);

    if (state) q = q.eq("location_state", state);
    if (maxPrice > 0) q = q.lte("ask_price", maxPrice);
    if (titleType && titleType !== "all") {
      const map: Record<string, string> = {
        clean: "clean_title",
        rebuilt: "rebuilt_title",
        salvage: "salvage_title",
        parts: "parts_only",
      };
      q = q.eq("condition", map[titleType] || titleType);
    }

    const { data, error } = await q;
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Group by make + normalized model.
    const groups = new Map<string, any[]>();
    for (const d of data || []) {
      if (!d.make || !d.model) continue;
      const k = `${d.make.toLowerCase()}|${normModel(d.model)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(d);
    }

    const out = Array.from(groups.values())
      .filter((g) => g.length >= minCount)
      .map((g) => {
        const prices = g.map((d) => Number(d.ask_price)).filter((p) => p > 0);
        const profits = g.map((d) => Number(d.true_net_profit) || 0);
        const states = Array.from(
          new Set(g.map((d) => d.location_state).filter(Boolean)),
        );
        const sources = Array.from(
          new Set(g.map((d) => d.source).filter(Boolean)),
        );
        const first = g[0];
        return {
          key: `${first.make}|${normModel(first.model)}`,
          make: first.make,
          model: first.model,
          count: g.length,
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
          avgProfit: Math.round(profits.reduce((s, x) => s + x, 0) / g.length),
          totalProfit: Math.round(profits.reduce((s, x) => s + x, 0)),
          goCount: g.filter((d) => d.deal_verdict === "go").length,
          states,
          sources,
          image: g.map((d) => d.images?.[0]).find(Boolean) || null,
          deals: g
            .sort((a, b) => Number(a.ask_price) - Number(b.ask_price))
            .map((d) => ({
              id: d.id,
              year: d.year,
              askPrice: Number(d.ask_price),
              mileage: d.mileage,
              condition: d.condition,
              verdict: d.deal_verdict,
              profit: Number(d.true_net_profit) || 0,
              state: d.location_state,
              city: d.location_city,
              source: d.source,
            })),
        };
      })
      .sort((a, b) => b.totalProfit - a.totalProfit || b.count - a.count)
      .slice(0, 100);

    return NextResponse.json({
      groups: out,
      count: out.length,
      state: state || "nationwide",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
