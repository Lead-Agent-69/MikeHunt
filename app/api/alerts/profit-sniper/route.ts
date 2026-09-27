export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";

interface SniperAlertCandidate {
  dealId: string;
  title: string;
  year: number;
  make: string;
  model: string;
  askPrice: number;
  trueNetProfit: number;
  roiPct: number;
  locationState: string;
  source: string;
  sourceUrl: string;
}

// GET & POST /api/alerts/profit-sniper
// Evaluates active deals for ultra-high margin profit anomalies (>35% ROI or >$4,000 profit)
// and prepares/dispatches high-priority alerts to subscribed dealers.
export async function GET(req: NextRequest) {
  return handleSniperEvaluation(req);
}

export async function POST(req: NextRequest) {
  return handleSniperEvaluation(req);
}

async function handleSniperEvaluation(req: NextRequest) {
  const supabase = createServerComponentClient();

  // Allow custom minRoi and minProfit parameters in body
  let minRoi = 35;
  let minProfit = 4000;
  try {
    const body = await req.json();
    if (body.minRoi) minRoi = Number(body.minRoi);
    if (body.minProfit) minProfit = Number(body.minProfit);
  } catch {
    // defaults apply
  }

  // 1. Fetch live active GO deals
  const { data: deals, error } = await supabase
    .from("deals")
    .select(`
      id, year, make, model, trim, ask_price, sell_estimate,
      true_net_profit, profit_score, deal_verdict, location_state,
      source, source_url, created_at
    `)
    .eq("active", true)
    .eq("deal_verdict", "go")
    .gt("true_net_profit", 0)
    .order("true_net_profit", { ascending: false })
    .limit(100);

  if (error || !deals || deals.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No active GO deals available for alert processing",
      alertsDispatched: 0,
      candidates: [],
    });
  }

  // 2. Filter for sniper criteria
  const sniperCandidates: SniperAlertCandidate[] = deals
    .map((d) => {
      const ask = Number(d.ask_price) || 0;
      const profit = Number(d.true_net_profit) || 0;
      const roi = ask > 0 ? (profit / ask) * 100 : 0;
      return {
        dealId: d.id,
        title: `${d.year || ""} ${d.make || ""} ${d.model || ""}`.trim(),
        year: d.year,
        make: d.make,
        model: d.model,
        askPrice: ask,
        trueNetProfit: Math.round(profit),
        roiPct: Math.round(roi * 10) / 10,
        locationState: d.location_state || "Nationwide",
        source: d.source || "Private",
        sourceUrl: d.source_url || `https://mikehunt.app/deal/${d.id}`,
      };
    })
    .filter((d) => d.roiPct >= minRoi || d.trueNetProfit >= minProfit);

  // 3. Match against user saved searches or alert subscriptions
  const { data: savedSearches } = await supabase
    .from("user_saved_searches")
    .select("*")
    .eq("notify_email", true);

  const matchedAlerts: Array<{
    userId: string;
    dealId: string;
    dealTitle: string;
    profit: number;
    roi: number;
    matchReason: string;
  }> = [];

  for (const candidate of sniperCandidates) {
    // Check specific searches
    for (const search of savedSearches || []) {
      const matchesMake = !search.make || search.make.toLowerCase() === candidate.make.toLowerCase();
      const matchesState = !search.location_state || search.location_state === candidate.locationState;
      const meetsTarget = !search.target_profit || candidate.trueNetProfit >= Number(search.target_profit);

      if (matchesMake && matchesState && meetsTarget) {
        matchedAlerts.push({
          userId: search.user_id,
          dealId: candidate.dealId,
          dealTitle: candidate.title,
          profit: candidate.trueNetProfit,
          roi: candidate.roiPct,
          matchReason: `Matches saved search '${search.name || candidate.make}' (>=$${candidate.trueNetProfit} profit)`,
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    criteria: { minRoi, minProfit },
    candidatesFound: sniperCandidates.length,
    matchedAlertsCount: matchedAlerts.length,
    topSniperDeals: sniperCandidates.slice(0, 5),
    matchedAlerts: matchedAlerts.slice(0, 20),
    timestamp: new Date().toISOString(),
  });
}
