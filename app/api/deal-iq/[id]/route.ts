import {
  completeOutcomeRows,
  OUTCOME_LEDGER_COLUMNS,
} from "@/lib/outcomes/ledger";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { getDealerCalibration } from "@/lib/scoring/calibration";
import {
  RECOMMENDATION_FIELDS,
  recommendationEvidence,
} from "@/lib/deals/recommendation-evidence";
import { vendorIdentity } from "@/lib/sources/vendor-identity";
import {
  computeDealIQ,
  type Confidence,
  type IQInputs,
} from "@/lib/intelligence/deal-iq";
import { extractWinPatterns, matchWin } from "@/lib/intelligence/win-patterns";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// Apply the same purchase-evidence rules used by recommendation outputs.
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
    .select(RECOMMENDATION_FIELDS)
    .eq("id", id)
    .maybeSingle();

  if (error)
    return NextResponse.json(
      { error: "Vehicle research is temporarily unavailable. Try again." },
      { status: 503 },
    );
  if (!d)
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

  const checked = recommendationEvidence(d);
  const evidence = {
    ready: checked.ready,
    label: checked.ready ? "Evidence-backed research" : checked.decision.label,
    nextCheck: checked.decision.nextCheck,
    priceMeaning: checked.price.label,
    sourceUrl: vendorIdentity(d.source, d.source_url).href || null,
    observedAt: d.last_seen_at || null,
  };
  // An incomplete record cannot support profit, a buy score or a guessed price-cause claim.
  if (!checked.ready) return NextResponse.json({ iq: null, evidence });
  const compsConfidence = d.deal_analysis.valuation.confidence as Confidence;

  let winMatch: IQInputs["winMatch"] = null;
  let calibrationProfitBiasPct: number | null = null;
  try {
    const {
      data: { user },
    } = await getServerUser();
    if (user?.id) {
      const { data: outcomes } = await supabase
        .from("deal_outcomes")
        .select(`${OUTCOME_LEDGER_COLUMNS},make,model`)
        .eq("user_id", user.id)
        .eq("costs_complete", true)
        .not("actual_profit", "is", null)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (outcomes && outcomes.length > 0) {
        winMatch = matchWin(
          d.make,
          d.model,
          extractWinPatterns(completeOutcomeRows(outcomes)),
        );
      }
      const cal = await getDealerCalibration(supabase, user.id);
      calibrationProfitBiasPct = cal?.profitBiasPct ?? null;
    }
  } catch {
    /* anonymous — skip personalization */
  }

  const iq = computeDealIQ({
    askPrice: checked.price.cashPrice!,
    sellEstimate: d.sell_estimate ?? d.mmr_value,
    compsConfidence,
    trueNetProfit: checked.profit,
    dealVerdict: d.deal_verdict,
    priceImplausible: !!d.deal_analysis?.priceImplausible,
    winMatch,
    calibrationProfitBiasPct,
  });

  return NextResponse.json({ iq, evidence });
}
