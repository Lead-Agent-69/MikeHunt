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
    return NextResponse.json({ report: null, canGenerate: hasTextModel() });
  }
  if (!hasTextModel()) {
    return NextResponse.json({
      report: null,
      reason: "No AI provider key configured.",
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

  if ((!timing || timing.length === 0) && (!aggs || aggs.length === 0)) {
    return NextResponse.json({
      report: null,
      reason: "Not enough market data accumulated yet.",
    });
  }

  const timingLines = (timing || [])
    .map(
      (t) =>
        `${t.make} ${t.model}: ${t.signal} (${t.pct_change > 0 ? "+" : ""}${t.pct_change}% / 30d, avg $${Math.round(Number(t.current_avg) || 0).toLocaleString()}, n=${t.data_points})`,
    )
    .join("\n");
  const aggLines = (aggs || [])
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
