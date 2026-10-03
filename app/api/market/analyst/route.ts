export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createServerComponentClient } from "@/lib/supabase";
import {
  getTextModel,
  hasTextModel,
  activeProvider,
} from "@/lib/ai/text-model";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// GET /api/market/analyst — Deal IQ Layer 4. A plain-English market read over the REAL aggregated
// data (timing signals + market aggregates). The only AI piece in Deal IQ: generation is explicit
// (?generate=1) and the result is cached in-process for 12h, so token spend is minimal and bounded.
let cache: { text: string; at: number; provider: string } | null = null;
const TTL_MS = 12 * 60 * 60 * 1000;

const money = (value: unknown) =>
  `$${Math.round(Number(value) || 0).toLocaleString()}`;

export function buildDeterministicMarketPulse({
  timing = [],
  aggs = [],
}: {
  timing?: any[];
  aggs?: any[];
}) {
  const buyNow = timing
    .filter((row) => String(row.signal || "").toUpperCase() === "BUY_NOW")
    .slice(0, 2);
  const wait = timing
    .filter((row) => String(row.signal || "").toUpperCase() === "WAIT")
    .slice(0, 2);
  const topProfit = [...aggs]
    .filter((row) => Number.isFinite(Number(row.avg_profit)))
    .sort((a, b) => Number(b.avg_profit || 0) - Number(a.avg_profit || 0))
    .slice(0, 2);
  const topVolume = [...aggs]
    .sort((a, b) => Number(b.unit_count || 0) - Number(a.unit_count || 0))
    .slice(0, 2);
  const firstMove = [...timing].sort(
    (a, b) =>
      Math.abs(Number(b.pct_change || 0)) - Math.abs(Number(a.pct_change || 0)),
  )[0];
  const movement = firstMove
    ? `${firstMove.make} ${firstMove.model} has the sharpest tracked move at ${
        Number(firstMove.pct_change || 0) > 0 ? "+" : ""
      }${Number(firstMove.pct_change || 0)}% over 30 days.`
    : "Market timing signals are still thin, so lean harder on source proof and deal-level economics.";
  const buyText = buyNow.length
    ? `Buy-now watchlist: ${buyNow
        .map(
          (row) =>
            `${row.make} ${row.model} (${row.pct_change > 0 ? "+" : ""}${row.pct_change}%, n=${row.data_points})`,
        )
        .join("; ")}.`
    : "No buy-now timing cluster has enough signal yet.";
  const waitText = wait.length
    ? `Wait/caution list: ${wait
        .map(
          (row) =>
            `${row.make} ${row.model} (${row.pct_change > 0 ? "+" : ""}${row.pct_change}%, n=${row.data_points})`,
        )
        .join("; ")}.`
    : "No wait cluster is currently dominating the timing table.";
  const profitText = topProfit.length
    ? `Highest tracked profit clusters: ${topProfit
        .map(
          (row) =>
            `${row.year} ${row.make} ${row.model} in ${row.state || "US"} at ${money(row.avg_profit)} avg profit`,
        )
        .join("; ")}.`
    : "Profit clusters are not mature enough yet.";
  const volumeText = topVolume.length
    ? `High-volume supply is concentrated in ${topVolume
        .map(
          (row) =>
            `${row.year} ${row.make} ${row.model} (${row.unit_count} units)`,
        )
        .join(" and ")}.`
    : "Volume data is still accumulating.";

  return `${movement} ${buyText} ${waitText} ${profitText} ${volumeText} Source only the segments that also pass live listing proof: photos, source link, title detail, mileage/VIN where available, and verified transport/repair cost.`;
}

export function aggregateLiveDealsForMarketPulse(rows: any[]) {
  const groups = new Map<
    string,
    {
      year: number | null;
      make: string;
      model: string;
      state: string | null;
      unit_count: number;
      marketValues: number[];
      profits: number[];
    }
  >();

  for (const row of rows) {
    const make = String(row.make || "").trim();
    const model = String(row.model || "").trim();
    if (!make || !model) continue;
    const year = Number(row.year || 0) || null;
    const state =
      String(row.location_state || row.state || "US").trim() || "US";
    const key = `${year || "unknown"}|${make.toLowerCase()}|${model.toLowerCase()}|${state.toUpperCase()}`;
    const group = groups.get(key) || {
      year,
      make,
      model,
      state,
      unit_count: 0,
      marketValues: [],
      profits: [],
    };
    group.unit_count += 1;
    const marketValue = Number(row.sell_estimate ?? row.mmr_value ?? 0);
    const profit = Number(row.true_net_profit ?? row.profit_estimate ?? 0);
    if (marketValue > 0) group.marketValues.push(marketValue);
    if (Number.isFinite(profit)) group.profits.push(profit);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      year: group.year,
      make: group.make,
      model: group.model,
      state: group.state,
      unit_count: group.unit_count,
      avg_market_value: group.marketValues.length
        ? Math.round(
            group.marketValues.reduce((sum, value) => sum + value, 0) /
              group.marketValues.length,
          )
        : 0,
      avg_profit: group.profits.length
        ? Math.round(
            group.profits.reduce((sum, value) => sum + value, 0) /
              group.profits.length,
          )
        : 0,
    }))
    .sort((a, b) => b.unit_count - a.unit_count)
    .slice(0, 20);
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "analyst", limit: 15, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const sp = new URL(req.url).searchParams;
  const wantGenerate = sp.get("generate") === "1" || sp.get("refresh") === "1";
  const fresh = sp.get("refresh") === "1";

  if (cache && Date.now() - cache.at < TTL_MS && !fresh) {
    return NextResponse.json({
      report: cache.text,
      cached: true,
      provider: cache.provider,
    });
  }
  if (!wantGenerate) {
    return NextResponse.json({
      report: null,
      canGenerate: true,
      deterministic: !hasTextModel(),
      provider: activeProvider(),
    });
  }

  const supabase = createServerComponentClient();

  // Real signals only — movers from the timing view and high-volume aggregate clusters.
  const { data: timing } = await supabase
    .from("market_timing_signals")
    .select("make, model, signal, pct_change, current_avg, data_points")
    .order("data_points", { ascending: false })
    .limit(20);

  const { data: aggs } = await supabase
    .from("market_aggregates")
    .select(
      "make, model, year, avg_market_value, avg_profit, unit_count, state",
    )
    .order("unit_count", { ascending: false })
    .limit(20);

  let marketAggs = aggs || [];
  if ((!timing || timing.length === 0) && marketAggs.length === 0) {
    const { data: liveDeals } = await supabase
      .from("deals")
      .select(
        "year, make, model, sell_estimate, mmr_value, true_net_profit, profit_estimate, location_state",
      )
      .eq("active", true)
      .limit(1000);
    marketAggs = aggregateLiveDealsForMarketPulse(liveDeals || []);
  }

  if ((!timing || timing.length === 0) && marketAggs.length === 0) {
    return NextResponse.json({
      report: null,
      reason: "Not enough market data accumulated yet.",
    });
  }

  if (!hasTextModel()) {
    const report = buildDeterministicMarketPulse({
      timing: timing || [],
      aggs: marketAggs,
    });
    cache = { text: report, at: Date.now(), provider: "none" };
    return NextResponse.json({
      report,
      cached: false,
      deterministic: true,
      provider: "none",
      reason:
        "No AI provider key configured. This market pulse is deterministic and uses only timing, aggregate, or live deal data.",
    });
  }

  const timingLines = (timing || [])
    .map(
      (t) =>
        `${t.make} ${t.model}: ${t.signal} (${t.pct_change > 0 ? "+" : ""}${t.pct_change}% / 30d, avg $${Math.round(Number(t.current_avg) || 0).toLocaleString()}, n=${t.data_points})`,
    )
    .join("\n");
  const aggLines = marketAggs
    .map(
      (a) =>
        `${a.year} ${a.make} ${a.model} [${a.state || "US"}]: mkt $${Math.round(Number(a.avg_market_value) || 0).toLocaleString()}, avg profit $${Math.round(Number(a.avg_profit) || 0).toLocaleString()} (n=${a.unit_count})`,
    )
    .join("\n");

  const prompt = `You are a wholesale used-car market analyst writing a daily desk note for dealers. Using ONLY the data below (do not invent numbers, vehicles, or trends), write a concise market pulse.

PRICE TREND SIGNALS (make/model, buy-now vs wait, 30-day change):
${timingLines || "(none)"}

HIGH-VOLUME SEGMENTS (market value + avg profit):
${aggLines || "(none)"}

Write 4-6 sentences, plain text, no markdown headers. Lead with the biggest actionable movement, call out 1-2 buy-now and 1-2 wait segments by name, and end with one concrete sourcing suggestion. Be specific and practical; under 130 words.`;

  try {
    const { text } = await generateText({
      model: getTextModel(),
      prompt,
      temperature: 0.5,
    });
    cache = { text: text.trim(), at: Date.now(), provider: activeProvider() };
    return NextResponse.json({
      report: cache.text,
      cached: false,
      provider: cache.provider,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Generation failed" },
      { status: 500 },
    );
  }
}
