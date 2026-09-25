import { NextRequest, NextResponse } from "next/server";
import { computeMaxBid, type MaxBidCosts } from "@/lib/scoring/max-bid";

// POST /api/deal/max-bid
// Given a resale estimate, target profit, per-vehicle costs, and the auction source, return the most
// a dealer can bid and still hit their target. Mirrors the MaxBidWidget so automation / external
// callers get the same number the UI shows.
//
// Body: { sellEstimate | market_price, targetProfit | target_profit, costs?, source? }
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Accept both the widget's camelCase and the handoff doc's snake_case field names.
  const sellEstimate = Number(
    body.sellEstimate ?? body.market_price ?? body.sell_estimate ?? 0,
  );
  const targetProfit = Number(body.targetProfit ?? body.target_profit ?? 0);
  const source: string | null = body.source ?? null;

  // Costs may arrive as a structured object or as the doc's flat fields.
  const costs: MaxBidCosts = body.costs ?? {
    repair: body.recon_estimate ?? body.repair,
    transport: body.transport_cost ?? body.transport,
    holding: body.holding,
    selling: body.platform_fee ?? body.selling,
  };

  if (!sellEstimate || sellEstimate <= 0) {
    return NextResponse.json(
      { error: "sellEstimate (or market_price) is required and must be > 0" },
      { status: 400 },
    );
  }

  const result = computeMaxBid({ sellEstimate, targetProfit, costs, source });

  return NextResponse.json({
    max_bid: result.maxBid,
    margin_pct: result.marginPct,
    viable: result.viable,
    breakdown: result.breakdown,
  });
}
