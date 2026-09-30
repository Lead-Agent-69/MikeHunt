export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { sellerContact } from "@/lib/data/deal-contact";

// High-velocity liquidity models (turn in under 18 days on average)
const HIGH_VELOCITY_MODELS = [
  "civic",
  "accord",
  "camry",
  "corolla",
  "cr-v",
  "rav4",
  "tacoma",
  "tundra",
  "f-150",
  "silverado",
  "sierra",
  "wrangler",
  "outback",
  "forester",
  "cx-5",
  "prius",
];

function calculateLiquidityScore(
  make?: string,
  model?: string,
  mileage?: number,
): { score: number; daysToTurn: number } {
  const normModel = (model || "").toLowerCase();
  const normMake = (make || "").toLowerCase();

  let baseScore = 75;
  let daysToTurn = 28;

  if (HIGH_VELOCITY_MODELS.some((m) => normModel.includes(m))) {
    baseScore = 95;
    daysToTurn = 11;
  } else if (["toyota", "honda", "subaru", "mazda"].includes(normMake)) {
    baseScore = 90;
    daysToTurn = 14;
  } else if (["ford", "chevrolet", "gmc", "ram", "jeep"].includes(normMake)) {
    baseScore = 85;
    daysToTurn = 19;
  } else if (
    ["bmw", "mercedes-benz", "audi", "lexus", "porsche"].includes(normMake)
  ) {
    baseScore = 72;
    daysToTurn = 34;
  }

  // Mileage modifier
  if (mileage && mileage < 75000) {
    baseScore = Math.min(99, baseScore + 5);
    daysToTurn = Math.max(7, daysToTurn - 3);
  } else if (mileage && mileage > 150000) {
    baseScore = Math.max(50, baseScore - 10);
    daysToTurn += 7;
  }

  return { score: baseScore, daysToTurn };
}

// GET /api/deals/best-buy
// Finds the #1 highest-margin, highest-velocity flip based on dealer capital and strategy.
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const capital = parseFloat(searchParams.get("capital") || "0");
  const state = searchParams.get("state")?.trim().toUpperCase() || "";
  const minMargin = parseFloat(searchParams.get("minMargin") || "10");
  const strategy = searchParams.get("strategy") || "max_roi"; // 'max_roi' | 'max_profit' | 'fastest_flip'

  const supabase = createServerComponentClient();

  let query = supabase
    .from("deals")
    .select(
      `
      id, year, make, model, trim, vin, mileage, ask_price, sell_estimate,
      true_net_profit, profit_score, deal_verdict, recommended_max_bid,
      location_city, location_state, images, source, source_url, options,
      condition, deal_analysis
    `,
    )
    .eq("active", true)
    .gt("true_net_profit", 0)
    .order("true_net_profit", { ascending: false })
    .limit(300);

  if (state) {
    query = query.eq("location_state", state);
  }

  const { data: rows, error } = await query;

  if (error || !rows || rows.length === 0) {
    return NextResponse.json({
      bestBuy: null,
      runnerUps: [],
      stats: { totalConsidered: 0, avgRoi: 0, maxProfit: 0 },
    });
  }

  // Score and rank deals
  const scoredDeals = rows
    .map((deal) => {
      const ask = Number(deal.ask_price) || 0;
      const profit = Number(deal.true_net_profit) || 0;
      const sellEst = Number(deal.sell_estimate) || ask + profit;
      const maxBid =
        Number(deal.recommended_max_bid) ||
        (ask > 0 ? Math.round(ask * 0.92) : 0);
      const roi = ask > 0 ? (profit / ask) * 100 : 0;
      const { score: liquidityScore, daysToTurn } = calculateLiquidityScore(
        deal.make,
        deal.model,
        deal.mileage,
      );

      // Strategy composite ranking
      let rankScore = 0;
      if (strategy === "max_profit") {
        rankScore = profit * 0.7 + roi * 20 + liquidityScore * 10;
      } else if (strategy === "fastest_flip") {
        rankScore = liquidityScore * 50 + roi * 25 + (profit / 100) * 25;
      } else {
        // max_roi default
        rankScore = roi * 50 + profit / 50 + liquidityScore * 15;
      }

      // Safety buffer: how much can market drop before breaking even
      const downsideBuffer = profit;
      const discountToComps = Math.max(0, sellEst - ask);

      return {
        id: deal.id,
        year: deal.year,
        make: deal.make,
        model: deal.model,
        trim: deal.trim,
        title:
          `${deal.year || ""} ${deal.make || ""} ${deal.model || ""} ${deal.trim || ""}`.trim(),
        vin: deal.vin,
        mileage: deal.mileage,
        askPrice: ask,
        sellEstimate: sellEst,
        trueNetProfit: Math.round(profit),
        roiPct: Math.round(roi * 10) / 10,
        profitScore: deal.profit_score ?? 85,
        dealVerdict: deal.deal_verdict || "go",
        recommendedMaxBid: maxBid,
        targetOffer: Math.round(ask * 0.88),
        locationCity: deal.location_city,
        locationState: deal.location_state,
        images: deal.images || [],
        source: deal.source,
        sourceUrl: deal.source_url,
        sellerPhone: sellerContact(deal).phone,
        liquidityScore,
        daysToTurn,
        downsideBuffer: Math.round(downsideBuffer),
        discountToComps: Math.round(discountToComps),
        rankScore,
      };
    })
    .filter((d) => {
      // Filter by min margin
      if (d.roiPct < minMargin) return false;
      // Filter by capital if specified (allow up to 10% negotiation leverage)
      if (capital > 0 && d.askPrice > capital * 1.1) return false;
      return true;
    })
    .sort((a, b) => b.rankScore - a.rankScore);

  if (scoredDeals.length === 0) {
    return NextResponse.json({
      bestBuy: null,
      runnerUps: [],
      stats: { totalConsidered: rows.length, avgRoi: 0, maxProfit: 0 },
    });
  }

  const best = scoredDeals[0];

  // Generate dynamic AI rationale for the #1 best buy
  const aiRationale = {
    headline: `${best.roiPct}% ROI — Projected $${best.trueNetProfit.toLocaleString()} Net Cash Flip`,
    spreadAnalysis: `Listed at $${best.askPrice.toLocaleString()} against a live comps average of $${best.sellEstimate.toLocaleString()} ($${best.discountToComps.toLocaleString()} instant equity spread).`,
    turnSpeed: `Estimated turnover time is ${best.daysToTurn} days (${best.liquidityScore}/100 high-demand liquidity index).`,
    riskBuffer: `Downside safety buffer of $${best.downsideBuffer.toLocaleString()} protects your capital against unexpected recon surprises or price cuts.`,
    recommendedAction: `Open negotiation with a cash-offer of $${best.targetOffer.toLocaleString()}. Cap your final walk-away bid at $${best.recommendedMaxBid.toLocaleString()}.`,
  };

  // Group runner-ups by budget tiers
  const budgetTier = scoredDeals.find(
    (d) => d.id !== best.id && d.askPrice <= 8000,
  );
  const midTier = scoredDeals.find(
    (d) => d.id !== best.id && d.askPrice > 8000 && d.askPrice <= 18000,
  );
  const highTier = scoredDeals.find(
    (d) => d.id !== best.id && d.askPrice > 18000,
  );

  const runnerUps = [budgetTier, midTier, highTier].filter(Boolean);

  // Platform summary stats
  const totalRoi = scoredDeals.reduce((sum, d) => sum + d.roiPct, 0);
  const avgRoi = Math.round((totalRoi / scoredDeals.length) * 10) / 10;
  const maxProfit = Math.max(...scoredDeals.map((d) => d.trueNetProfit));

  return NextResponse.json({
    bestBuy: {
      ...best,
      aiRationale,
    },
    runnerUps,
    stats: {
      totalConsidered: scoredDeals.length,
      avgRoi,
      maxProfit,
      strategyUsed: strategy,
    },
  });
}
