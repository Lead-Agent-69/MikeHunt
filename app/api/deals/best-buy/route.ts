export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { sellerContact } from "@/lib/data/deal-contact";
import { assessDecisionEvidence } from "@/lib/intelligence/decision-guard";

function csvParam(value: string | null) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 25);
}

function dealerNeedles(ids: string[]) {
  const map: Record<string, string[]> = {
    "ae-of-miami": ["aeofmiami.com", "aeofamerica"],
    "damage-com": ["damage.com"],
    "dg-auto": ["dgautollc.com"],
    recar: ["recar.com"],
    "stjames-auto": ["stjames"],
    "cas-miami": ["casmiami.com"],
    salvagezone: ["salvagezone.com"],
  };
  return ids.flatMap((id) => map[id] || [id.replace(/-/g, "")]);
}

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
  const source = searchParams.get("source")?.trim().toLowerCase() || "";
  const lane = searchParams.get("lane")?.trim().toLowerCase() || "";
  const sellerType = searchParams.get("sellerType")?.trim().toLowerCase() || "";
  const titleType = searchParams.get("titleType")?.trim().toLowerCase() || "";
  const q = searchParams.get("q")?.trim() || "";
  const make = searchParams.get("make")?.trim() || "";
  const makes = csvParam(searchParams.get("makes"));
  const dealers = csvParam(searchParams.get("dealers")).map(
    (host) =>
      host
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0],
  );
  const dealerSourceIds = csvParam(searchParams.get("dealerSourceIds")).map(
    (id) =>
      id
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_-]/g, ""),
  );
  const maxPrice = parseFloat(searchParams.get("maxPrice") || "0");
  const minMargin = parseFloat(searchParams.get("minMargin") || "10");
  const strategy = searchParams.get("strategy") || "max_roi"; // 'max_roi' | 'max_profit' | 'fastest_flip'

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      bestBuy: null,
      runnerUps: [],
      stats: { totalConsidered: 0, avgRoi: 0, maxProfit: 0 },
      configured: false,
    });
  }

  const supabase = createServerComponentClient();

  const baseSelect = `
      id, year, make, model, trim, vin, mileage, ask_price, sell_estimate,
      true_net_profit, profit_score, deal_verdict, recommended_max_bid,
      location_city, location_state, images, source, source_url, options,
      condition, damage_type, buy_now_price, auction_end_at, deal_analysis
    `;

  const buildQuery = (positiveOnly: boolean) => {
    let query = supabase
      .from("deals")
      .select(baseSelect)
      .eq("active", true)
      .gte("ask_price", 3000)
      .gt("sell_estimate", 0)
      .not("true_net_profit", "is", null)
      .limit(hasTightScope ? 80 : 300);

    if (!hasTightScope) {
      query = query.order("true_net_profit", {
        ascending: false,
        nullsFirst: false,
      });
    }

    if (positiveOnly) query = query.gt("true_net_profit", 0);
    if (state) query = query.eq("location_state", state);
    if (source && source !== "all") query = query.eq("source", source);
    if (maxPrice > 0) query = query.lte("ask_price", maxPrice);
    if (make) query = query.ilike("make", make);
    if (makes.length) query = query.in("make", makes);
    // This table shape does not always expose seller_type. Dealer intent is enforced
    // through dealer host/source filters below; auction/government intent is covered by lane.
    if (titleType && titleType !== "all") {
      query = query.ilike("damage_type", `%${titleType}%`);
    }
    if (lane === "damaged") {
      query = query.or(
        "damage_type.ilike.%salvage%,damage_type.ilike.%repairable%,damage_type.ilike.%damage%",
      );
    } else if (lane === "government") {
      query = query.in("source", [
        "govdeals",
        "gsa_auctions",
        "publicsurplus",
        "municibid",
      ]);
    }
    if (dealers.length) {
      query = query.or(
        dealers.map((host) => `source_url.ilike.%${host}%`).join(","),
      );
    } else if (dealerSourceIds.length) {
      query = query.eq("source", "independent_dealer");
    }
    if (searchParams.get("q")?.trim()) {
      const search = searchParams.get("q")!.trim();
      query = query.or(
        `title.ilike.%${search}%,make.ilike.%${search}%,model.ilike.%${search}%,vin.ilike.%${search}%`,
      );
    }

    return query;
  };

  const hasTightScope =
    dealerSourceIds.length > 0 ||
    dealers.length > 0 ||
    makes.length > 0 ||
    Boolean(make) ||
    Boolean(source && source !== "all") ||
    Boolean(maxPrice > 0);
  const positive = hasTightScope
    ? { data: null, error: null }
    : await buildQuery(true);
  const { data: positiveRows, error: positiveError } = positive;
  let rows = positiveRows || [];
  let fallbackMode = hasTightScope;

  if ((hasTightScope || !rows || rows.length === 0) && !positiveError) {
    const fallback = await buildQuery(false);
    rows = fallback.data || [];
    fallbackMode = true;
    if (fallback.error) {
      return NextResponse.json({
        bestBuy: null,
        runnerUps: [],
        stats: { totalConsidered: 0, avgRoi: 0, maxProfit: 0 },
        mode: "error",
        error: "Scoped best-buy query failed",
      });
    }
  }

  if (positiveError || !rows || rows.length === 0) {
    return NextResponse.json({
      bestBuy: null,
      runnerUps: [],
      stats: { totalConsidered: 0, avgRoi: 0, maxProfit: 0 },
      mode: positiveError ? "error" : "empty",
      error: positiveError ? "Best-buy query failed" : undefined,
    });
  }
  if (dealerSourceIds.length) {
    const needles = dealerNeedles(dealerSourceIds).map((needle) =>
      needle.toLowerCase(),
    );
    rows = rows.filter((row: any) => {
      const url = String(row.source_url || "").toLowerCase();
      return needles.some((needle) => url.includes(needle));
    });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({
      bestBuy: null,
      runnerUps: [],
      stats: { totalConsidered: 0, avgRoi: 0, maxProfit: 0 },
      mode: "empty",
    });
  }

  // Positive projected profit alone is not evidence that a listing is safe to buy. Prefer only
  // evidence-backed GO records; otherwise keep the best non-anomalous result in a research/watch state.
  const evidenceFor = (deal: any) =>
    assessDecisionEvidence({
      source: deal.source,
      condition: deal.condition,
      damageType: deal.damage_type,
      vin: deal.vin,
      mileage: deal.mileage,
      buyNowPrice: deal.buy_now_price,
      dealVerdict: deal.deal_verdict,
      dealAnalysis: deal.deal_analysis,
    });
  const verifiedRows = rows.filter(
    (deal: any) => evidenceFor(deal).acquisitionReady,
  );
  if (verifiedRows.length > 0) {
    rows = verifiedRows;
    fallbackMode = false;
  } else {
    rows = rows.filter(
      (deal: any) => evidenceFor(deal).state !== "price_anomaly",
    );
    fallbackMode = true;
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
      const evidence = evidenceFor(deal);

      // Strategy composite ranking
      let rankScore = 0;
      if (fallbackMode) {
        // When there are no true BUY deals, "best" means closest to a profitable buy. Liquidity still
        // matters, but it should never outrank a materially better walk-away gap.
        rankScore =
          profit * 10 + liquidityScore * 4 + Number(deal.profit_score || 0);
      } else if (strategy === "max_profit") {
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
        dealVerdict: evidence.acquisitionReady ? "go" : "hold",
        recommendedMaxBid: maxBid,
        targetOffer: Math.round(ask * 0.88),
        locationCity: deal.location_city,
        locationState: deal.location_state,
        images: deal.images || [],
        source: deal.source,
        sourceUrl: deal.source_url,
        sellerPhone: sellerContact(deal).phone,
        matchScope: {
          state,
          source: source || undefined,
          lane,
          sellerType,
          titleType,
          q,
          make: make || undefined,
          makes,
          maxPrice: maxPrice > 0 ? maxPrice : undefined,
          dealerSourceIds,
          dealers,
        },
        liquidityScore,
        daysToTurn,
        downsideBuffer: Math.round(downsideBuffer),
        discountToComps: Math.round(discountToComps),
        evidence,
        rankScore,
      };
    })
    .filter((d) => {
      // Filter by min margin only when the system has true positive-profit buys. In fallback mode,
      // users still need the best available candidate instead of an empty surface.
      if (!fallbackMode && d.roiPct < minMargin) return false;
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
      mode: fallbackMode ? "watchlist" : "buy",
    });
  }

  const best = scoredDeals[0];

  // Generate dynamic AI rationale for the #1 best buy
  const isVerifiedBuy = best.evidence.acquisitionReady;
  const aiRationale = {
    headline: isVerifiedBuy
      ? `Evidence-backed buy — projected $${best.trueNetProfit.toLocaleString()} net`
      : `${best.evidence.label} — research before any offer`,
    spreadAnalysis: isVerifiedBuy
      ? `Listed at $${best.askPrice.toLocaleString()} against evidence-backed comparable value of $${best.sellEstimate.toLocaleString()} before final transaction checks.`
      : best.evidence.summary,
    turnSpeed: isVerifiedBuy
      ? `Estimated turnover time is ${best.daysToTurn} days (${best.liquidityScore}/100 liquidity signal).`
      : "Turnover is not estimated until the listing's condition and final all-in price are verified.",
    riskBuffer: isVerifiedBuy
      ? `Projected cushion is $${best.downsideBuffer.toLocaleString()} after current modeled costs; final transaction terms still require confirmation.`
      : "Projected profit is intentionally withheld from the decision until the missing evidence is resolved.",
    recommendedAction: isVerifiedBuy
      ? `Review the source listing, then keep the final purchase below $${best.recommendedMaxBid.toLocaleString()} after confirming the transaction terms.`
      : best.evidence.nextCheck,
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
      opportunityMode: isVerifiedBuy ? "buy" : "watchlist",
    },
    runnerUps,
    stats: {
      totalConsidered: scoredDeals.length,
      avgRoi,
      maxProfit,
      strategyUsed: strategy,
    },
    mode: isVerifiedBuy ? "buy" : "watchlist",
  });
}
