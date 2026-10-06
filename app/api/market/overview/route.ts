export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// GET /api/market/overview?make=Honda&model=Accord — everything the /overview/[make]/[model] page
// needs: hero stats, profit-by-trim, scatter points, regional breakdown.
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "overview", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const { searchParams } = new URL(req.url);
  const make = searchParams.get("make");
  const model = searchParams.get("model");
  if (!make || !model)
    return NextResponse.json(
      { error: "make and model required" },
      { status: 400 },
    );

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      make,
      model,
      stats: { goDeals: 0, totalActive: 0 },
      trims: [],
      scatter: [],
      regional: [],
    });
  }
  const supabase = createServerComponentClient();
  const token = model.split(" ")[0];

  const [deals, trims] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "ask_price, true_net_profit, mileage, deal_verdict, location_state",
      )
      .eq("active", true)
      .ilike("make", make)
      .ilike("model", `%${token}%`)
      .gt("ask_price", 0)
      .limit(1500),
    supabase.rpc("get_profit_by_trim", { p_make: make, p_model: token }),
  ]);

  const rows = deals.data || [];
  const go = rows.filter((d: any) => d.deal_verdict === "go");
  const profits = go.map((d: any) => Number(d.true_net_profit) || 0);
  const avgProfit = profits.length
    ? Math.round(profits.reduce((s, x) => s + x, 0) / profits.length)
    : 0;

  // Regional avg profit (where are they most profitable?).
  const byState = new Map<string, number[]>();
  for (const d of go) {
    if (!d.location_state) continue;
    if (!byState.has(d.location_state)) byState.set(d.location_state, []);
    byState.get(d.location_state)!.push(Number(d.true_net_profit) || 0);
  }
  const regional = Array.from(byState.entries())
    .map(([state, ps]) => ({
      state,
      avgProfit: Math.round(ps.reduce((s, x) => s + x, 0) / ps.length),
      count: ps.length,
    }))
    .sort((a, b) => b.avgProfit - a.avgProfit)
    .slice(0, 8);

  const payload = {
    make,
    model,
    stats: { goDeals: go.length, avgProfit, totalActive: rows.length },
    trims: (trims.data || []).map((t: any) => ({
      trim: t.trim_name,
      goDeals: Number(t.go_deals) || 0,
      avgProfit: Math.round(Number(t.avg_profit) || 0),
      avgAsk: Math.round(Number(t.avg_ask) || 0),
    })),
    scatter: rows
      .filter((d: any) => d.mileage && d.ask_price)
      .map((d: any) => ({
        mileage: Number(d.mileage),
        price: Number(d.ask_price),
      })),
    regional,
  };
  const flipDesk = await resolveCallerFlipDesk();
  return NextResponse.json(
    flipDesk
      ? { ...payload, deskAccess: "flip" }
      : redactMarketOverviewForNonFlip(payload),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Average profit is flip economics: personal / diy / parts / signed-out callers get counts and asks only. */
export function redactMarketOverviewForNonFlip(payload: {
  make: string;
  model: string;
  stats: { goDeals: number; avgProfit?: number; totalActive: number };
  trims: Array<{
    trim: string;
    goDeals: number;
    avgProfit?: number;
    avgAsk: number;
  }>;
  scatter: Array<{ mileage: number; price: number }>;
  regional: Array<{ state: string; avgProfit?: number; count: number }>;
}) {
  return {
    make: payload.make,
    model: payload.model,
    stats: {
      goDeals: payload.stats.goDeals,
      totalActive: payload.stats.totalActive,
    },
    trims: payload.trims.map(({ avgProfit: _p, ...rest }) => rest),
    scatter: payload.scatter,
    regional: payload.regional
      .map(({ avgProfit: _p, ...rest }) => rest)
      .sort((a, b) => b.count - a.count),
    deskAccess: "personal" as const,
  };
}
