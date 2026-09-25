export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { getDealerCalibration } from "@/lib/scoring/calibration";
import { categorize } from "@/lib/discovery/categorize";
import {
  computeDealIQ,
  type Confidence,
  type IQInputs,
} from "@/lib/intelligence/deal-iq";
import { extractWinPatterns, matchWin } from "@/lib/intelligence/win-patterns";
import { mispricingOf } from "@/lib/intelligence/mispricing";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// GET /api/deal-iq/[id] — the unified Deal IQ for one deal. Assembles every intelligence signal the
// platform produces (market position, profit, demand, timing, your win-patterns, mispricing, your
// calibration) and fuses them into one explainable score. All-free except the (optional) per-dealer
// personalization, which is cheap DB reads.
function modelToken(model?: string | null): string {
  return (model || "").split(" ")[0] || "";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = rateLimit(req, { key: "deal-iq", limit: 90, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const { id } = await params;
  const supabase = createServerComponentClient();

  const { data: d, error } = await supabase
    .from("deals")
    .select(
      "id, title, year, make, model, condition, damage_type, ask_price, sell_estimate, mmr_value, true_net_profit, deal_verdict, location_state, deal_analysis",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !d)
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const sellBasis = d.deal_analysis?.sellBasis as string | undefined;
  const compsConfidence: Confidence =
    sellBasis === "comps" ? "high" : sellBasis === "market" ? "medium" : "none";
  const distressed = categorize({ ...d, sellBasis }).distressed;

  // ── Demand (state-scoped) ──
  let demand: IQInputs["demand"] = null;
  if (d.make && d.model && d.location_state) {
    try {
      const { getMarketDemand } =
        await import("@/lib/hotFunctions/demandIndex");
      const dm = await getMarketDemand(d.make, d.model, d.location_state);
      demand = dm.demandLevel as IQInputs["demand"];
    } catch {
      /* optional */
    }
  }

  // ── Timing ──
  let timing: IQInputs["timing"] = null;
  try {
    const { data: t } = await supabase
      .from("market_timing_signals")
      .select("signal")
      .eq("make", d.make)
      .ilike("model", `%${modelToken(d.model)}%`)
      .order("data_points", { ascending: false })
      .limit(1);
    timing = (t?.[0]?.signal as IQInputs["timing"]) ?? null;
  } catch {
    /* optional */
  }

  // ── Mispricing vs the make/model/year cluster ──
  let mispricing: IQInputs["mispricing"] = null;
  try {
    let q = supabase
      .from("deals")
      .select("ask_price")
      .eq("active", true)
      .eq("make", d.make)
      .gt("ask_price", 0)
      .neq("id", id)
      .limit(300);
    if (d.model) q = q.ilike("model", `%${modelToken(d.model)}%`);
    if (d.year) q = q.gte("year", d.year - 1).lte("year", d.year + 1);
    const { data: peers } = await q;
    mispricing = mispricingOf(
      Number(d.ask_price),
      (peers || []).map((p: any) => Number(p.ask_price)),
    );
  } catch {
    /* optional */
  }

  // ── Personalized: win-match + calibration (requires a signed-in dealer) ──
  let winMatch: IQInputs["winMatch"] = null;
  let calibrationProfitBiasPct: number | null = null;
  try {
    const {
      data: { user },
    } = await getServerUser();
    if (user?.id) {
      const { data: outcomes } = await supabase
        .from("deal_outcomes")
        .select("make, model, actual_profit")
        .eq("user_id", user.id)
        .not("actual_profit", "is", null)
        .limit(200);
      if (outcomes && outcomes.length > 0) {
        winMatch = matchWin(d.make, d.model, extractWinPatterns(outcomes));
      }
      const cal = await getDealerCalibration(supabase, user.id);
      calibrationProfitBiasPct = cal?.profitBiasPct ?? null;
    }
  } catch {
    /* anonymous — skip personalization */
  }

  const iq = computeDealIQ({
    askPrice: Number(d.ask_price) || 0,
    sellEstimate: d.sell_estimate ?? d.mmr_value,
    compsConfidence,
    trueNetProfit: d.true_net_profit,
    dealVerdict: d.deal_verdict,
    priceImplausible: !!d.deal_analysis?.priceImplausible,
    demand,
    timing,
    winMatch,
    mispricing,
    calibrationProfitBiasPct,
    distress: distressed,
  });

  return NextResponse.json({ iq });
}
