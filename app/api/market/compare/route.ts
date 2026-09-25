export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { fitDepreciationCurve } from "@/lib/scoring/depreciation";
import { daysOnMarket } from "@/lib/intelligence/days-on-market";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// GET /api/market/compare?vehicles=Honda:Accord:2018,Toyota:Camry:2018
// Side-by-side dealer economics: GO deals, avg profit, days-on-market, $/1k-mi depreciation, trend.
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "compare", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const raw = new URL(req.url).searchParams.get("vehicles") || "";
  const specs = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (specs.length === 0) return NextResponse.json({ comparison: [] });

  const supabase = createServerComponentClient();

  const comparison = await Promise.all(
    specs.map(async (spec) => {
      const [make, model, yearStr] = spec.split(":");
      const year = parseInt(yearStr || "0", 10);
      if (!make || !model) return null;

      let q = supabase
        .from("deals")
        .select(
          "ask_price, true_net_profit, mileage, deal_verdict, first_seen_at",
        )
        .eq("active", true)
        .ilike("make", make)
        .ilike("model", `%${model.split(" ")[0]}%`)
        .gt("ask_price", 0)
        .limit(800);
      if (year) q = q.gte("year", year - 1).lte("year", year + 1);
      const { data } = await q;

      const rows = data || [];
      const go = rows.filter((d: any) => d.deal_verdict === "go");
      const profits = go.map((d: any) => Number(d.true_net_profit) || 0);
      const doms = rows
        .map((d: any) => daysOnMarket(d.first_seen_at))
        .filter((n): n is number => n != null);
      const fit = fitDepreciationCurve(
        rows.map((d: any) => ({
          mileage: Number(d.mileage),
          price: Number(d.ask_price),
        })),
      );

      // 30-day timing signal if we have one.
      const { data: t } = await supabase
        .from("market_timing_signals")
        .select("signal, pct_change")
        .ilike("make", make)
        .ilike("model", `%${model.split(" ")[0]}%`)
        .order("data_points", { ascending: false })
        .limit(1);

      return {
        make,
        model,
        year: year || null,
        totalListings: rows.length,
        goDeals: go.length,
        avgProfit: profits.length
          ? Math.round(profits.reduce((s, x) => s + x, 0) / profits.length)
          : 0,
        avgDaysOnMarket: doms.length
          ? Math.round(doms.reduce((s, x) => s + x, 0) / doms.length)
          : null,
        depreciationPer1000Miles: fit?.depreciationPer1000Miles ?? null,
        timingSignal: t?.[0]?.signal ?? null,
        pctChange30d: t?.[0]?.pct_change ?? null,
      };
    }),
  );

  return NextResponse.json({ comparison: comparison.filter(Boolean) });
}
