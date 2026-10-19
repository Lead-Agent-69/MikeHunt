import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  calculateFlipScenario,
  type ScenarioInput,
} from "@/lib/scoring/flip-scenario";

// POST /api/deal/max-bid
// Scenario arithmetic only. Every cost must be explicit, including zero. Source names never
// select a guessed fee schedule. Legacy field names remain accepted but omissions stay unknown.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "max-bid", limit: 60, windowMs: 60000 });
  if (!rl.allowed) return tooManyRequests(rl);
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Invalid body");
    body = parsed;
  } catch {
    return NextResponse.json(
      { error: "Send a JSON object with explicit scenario inputs." },
      { status: 400 },
    );
  }
  let input: ScenarioInput;
  if ("scenario" in body) {
    if (
      !body.scenario ||
      typeof body.scenario !== "object" ||
      Array.isArray(body.scenario)
    ) {
      return NextResponse.json(
        { error: "scenario must be an object." },
        { status: 400 },
      );
    }
    input = body.scenario as ScenarioInput;
  } else {
    const costs =
      body.costs && typeof body.costs === "object" && !Array.isArray(body.costs)
        ? (body.costs as Record<string, unknown>)
        : {};
    input = {
      purchase: body.purchase ?? body.askPrice ?? body.ask_price,
      resale:
        body.resale ??
        body.sellEstimate ??
        body.market_price ??
        body.sell_estimate,
      targetProfit: body.targetProfit ?? body.target_profit,
      buyerFees: body.buyerFees ?? costs.buyerFees,
      buyerFeeRate: body.buyerFeeRate ?? costs.buyerFeeRate,
      taxTitle: body.taxTitle ?? costs.taxTitle,
      repair: body.repair ?? costs.repair ?? body.recon_estimate,
      transport: body.transport ?? costs.transport ?? body.transport_cost,
      holding: body.holding ?? costs.holding,
      sellingFees: body.sellingFees ?? costs.selling ?? body.platform_fee,
      sellingFeeRate: body.sellingFeeRate ?? costs.sellingFeeRate,
      otherCosts: body.otherCosts ?? costs.otherCosts,
    };
  }
  const result = calculateFlipScenario(input);
  return NextResponse.json(
    {
      ...result,
      max_bid: result.metrics?.purchaseCeiling ?? null,
      margin_pct: result.metrics?.marginPct ?? null,
      roi_pct: result.metrics?.roiPct ?? null,
      viable:
        result.metrics?.purchaseCeiling != null &&
        result.metrics.purchaseCeiling > 0,
      basis:
        "User-entered scenario; price, condition and costs are not verified by this calculation.",
    },
    { status: result.status === "invalid" ? 400 : 200 },
  );
}
