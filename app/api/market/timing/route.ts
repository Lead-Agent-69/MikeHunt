export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  computeMarketTiming,
  TIMING_THRESHOLDS,
  type TimingObservation,
} from "@/lib/market/timing";

/**
 * GET /api/market/timing?make=Ford&model=F-150
 *
 * Buy-now / wait signal from a LIKE-FOR-LIKE price trend (lib/market/timing.ts): the same listing's
 * ask over time first, a year/mileage/trim mix-adjusted index second, no signal below the minimum
 * sample. It does not read market_timing_signals. Window: 30 days, recent = last 7 days.
 * Fixed-price asks only (auction bids and asks under $500 excluded). Model matches on its first token.
 *
 * Response fields:
 * - make, model: echo of the query.
 * - signal: "BUY_NOW" | "WAIT" | "NEUTRAL" | null. Null unless confidence is high or medium.
 * - confidence: "high" | "medium" | "low" | "none". Low = trend shown with a caveat, no verdict.
 * - basis: "same_listing" | "mix_adjusted" | "none". Which method produced the trend.
 * - trendPct: like-for-like change in percent (1 dp); null when confidence is none.
 * - current_median_price: median CURRENT ask of the matched sample (context, not a verdict); null if none.
 * - prior_median_price: median EARLIER ask of the same matched sample (same_listing: each listing's
 *   ask before the recent window; mix_adjusted: prior-window asks in matched cohorts); null if none.
 * - matched_count: same_listing = listings compared with their own earlier ask; mix_adjusted =
 *   distinct listings in cohorts seen in both windows. sampleSize is the same number (camelCase).
 * - window: { from, recentFrom, to, days, recentDays } (ISO timestamps, day counts).
 * - reason: plain-language explanation of the result, including why there is no signal.
 * - caveat: set only for low confidence; otherwise null.
 * - detail: { sameListingPairs, mixCohorts, mixRecentListings, mixPriorListings } diagnostics.
 * - avg_days_to_sell: mean days_to_sell from deal_outcomes when 3+ exist; otherwise null.
 *
 * Deprecated compatibility aliases (same values, kept for MarketTiming and older readers):
 * - timing_signal = signal
 * - pct_change_30d = trendPct when signal is set, else null (it is a 7-day like-for-like change, not 30d)
 * - current_avg_price = current_median_price (a median, despite the name)
 * - data_points = matched_count (a matched count, not raw observations)
 * - reasoning = canned one-line text for signal, or null
 */
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
    // @deprecated compatibility aliases (see the doc comment): same values as the honest fields below.
    // timing_signal = signal; pct_change_30d = trendPct (only with a signal);
    // current_avg_price = current_median_price; data_points = matched_count.
    timing_signal: timing.signal,
    pct_change_30d: timing.signal ? timing.trendPct : null,
    current_avg_price: timing.medianAsk,
    data_points: timing.sampleSize,
    reasoning: timing.signal ? REASONING[timing.signal] : null,
    avg_days_to_sell: avgDaysToSell,
    // Honestly named fields.
    current_median_price: timing.medianAsk,
    prior_median_price: timing.priorMedianAsk,
    matched_count: timing.sampleSize,
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
