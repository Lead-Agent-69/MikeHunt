export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  computeMarketTiming,
  TIMING_THRESHOLDS,
  type TimingObservation,
} from "@/lib/market/timing";

// GET /api/market/timing?make=Ford&model=F-150
// Buy-now / wait signal from a LIKE-FOR-LIKE price trend (lib/market/timing.ts): the same listing's
// ask over time first, a year/mileage/trim mix-adjusted index second, no signal below the minimum
// sample. It no longer reads market_timing_signals, which averaged different cars week to week.
// Also returns a real average days-to-sell from logged outcomes once enough exist.
const REASONING: Record<string, string> = {
  BUY_NOW: "Prices are rising — buying now beats waiting.",
  WAIT: "Prices are softening — waiting may land a better basis.",
  NEUTRAL: "Prices are stable — timing isn’t a major factor.",
};

const PAGE = 1000;
const MAX_ROWS = 5000;

type Supa = ReturnType<typeof createServerComponentClient>;

/** Price observations for make + model-token over the timing window, joined to listing attributes. */
async function loadObservations(
  supabase: Supa,
  make: string,
  modelToken: string,
  since: string,
): Promise<TimingObservation[] | null> {
  const out: TimingObservation[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from("price_history")
      .select(
        "deal_id, price, observed_at, deals!inner(make, model, year, mileage, trim, source, auction_end_at, last_seen_at)",
      )
      .eq("deals.make", make)
      .ilike("deals.model", `%${modelToken}%`)
      .gte("observed_at", since)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return null;
    const rows = (data ?? []) as any[];
    for (const r of rows) {
      const d = Array.isArray(r.deals) ? r.deals[0] : r.deals;
      if (!d) continue;
      out.push({
        dealId: String(r.deal_id),
        price: Number(r.price),
        observedAt: String(r.observed_at),
        year: d.year ?? null,
        mileage: d.mileage ?? null,
        trim: d.trim ?? null,
        source: d.source ?? null,
        auctionEndAt: d.auction_end_at ?? null,
        lastSeenAt: d.last_seen_at ?? null,
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "timing", limit: 120, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const { searchParams } = new URL(req.url);
  const make = searchParams.get("make");
  const model = searchParams.get("model");
  if (!make || !model) {
    return NextResponse.json(
      { error: "make and model are required" },
      { status: 400 },
    );
  }

  const supabase = createServerComponentClient();

  // Timing signal — match on make + the first model token to be resilient to trims.
  const now = new Date();
  const since = new Date(
    now.getTime() - TIMING_THRESHOLDS.windowDays * 86_400_000,
  ).toISOString();
  const obs = await loadObservations(supabase, make, model.split(" ")[0], since);
  const timing = computeMarketTiming(obs ?? [], now);
  if (!obs) timing.reason = "Price history is temporarily unavailable.";

  // Real days-to-sell from completed outcomes (anonymized aggregate; needs a few data points).
  let avgDaysToSell: number | null = null;
  try {
    const { data: outcomes } = await supabase
      .from("deal_outcomes")
      .select("days_to_sell")
      .eq("make", make)
      .ilike("model", `%${model.split(" ")[0]}%`)
      .not("days_to_sell", "is", null)
      .limit(200);
    if (outcomes && outcomes.length >= 3) {
      const days = outcomes
        .map((o) => Number(o.days_to_sell))
        .filter((n) => Number.isFinite(n));
      avgDaysToSell = Math.round(days.reduce((s, x) => s + x, 0) / days.length);
    }
  } catch {
    // table may be empty — fine
  }

  return NextResponse.json({
    make,
    model,
    // Legacy fields (MarketTiming badge, other readers). timing_signal is null unless confidence is
    // high or medium; pct_change_30d is the like-for-like trend, never a raw mix average.
    timing_signal: timing.signal,
    pct_change_30d: timing.signal ? timing.trendPct : null,
    current_avg_price: timing.medianAsk,
    data_points: timing.sampleSize,
    reasoning: timing.signal ? REASONING[timing.signal] : null,
    avg_days_to_sell: avgDaysToSell,
    // Like-for-like detail.
    signal: timing.signal,
    confidence: timing.confidence,
    basis: timing.basis,
    sampleSize: timing.sampleSize,
    trendPct: timing.trendPct,
    window: timing.window,
    reason: timing.reason,
    caveat:
      timing.confidence === "low"
        ? "Low confidence: too few like-for-like matches for a buy/wait call."
        : null,
    detail: timing.detail,
  });
}
