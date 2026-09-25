// lib/scoring/profit-calculator.ts
// ─── Comprehensive profit calculator with full scoring algorithm ──────────────

export interface DealInputs {
  // Acquisition
  askPrice: number;
  auctionFee?: number;
  titleFee?: number;

  // Repair
  damageType?: string;
  repairCost?: number;
  reconCost?: number;

  // Transport
  fromState?: string;
  toState?: string;
  miles?: number;
  transportCost?: number;

  // Sale
  salePrice: number;
  mmrValue?: number;
  sellingFee?: number;

  // Holding
  holdingDays?: number;
  dailyFloorRate?: number;

  // Market Intelligence (optional)
  make?: string;
  model?: string;
  marketDemandScore?: number; // 0-10 from market intelligence
  marketVelocityScore?: number; // 0-10 from market intelligence
  seasonalityScore?: number; // 0-5 from market intelligence
  competitionScore?: number; // 0-5 from market intelligence
}

export interface ProfitResult {
  // Costs
  totalCost: number;
  acquisitionCost: number;
  repairCost: number;
  transportCost: number;
  holdingCost: number;
  sellingCost: number;

  // Profit Metrics
  profit: number;
  roi: number;
  profitMargin: number;
  breakEvenDay: number;

  // Scoring
  score: number; // 0-130 (enhanced with market intelligence)
  verdict: "go" | "hold" | "pass";
  scoreBreakdown: {
    profitScore: number; // 0-40 points
    roiScore: number; // 0-30 points
    speedScore: number; // 0-15 points
    riskScore: number; // 0-15 points
    marketDemandScore: number; // 0-10 points (NEW)
    marketVelocityScore: number; // 0-10 points (NEW)
    seasonalityScore: number; // 0-5 points (NEW)
    competitionScore: number; // 0-5 points (NEW)
  };

  // Recommendations
  warnings: string[];
  recommendations: string[];
}

/**
 * Calculate comprehensive profit metrics and deal score
 */
export function calculateProfit(inputs: DealInputs): ProfitResult {
  // ─── COST BREAKDOWN ───────────────────────────────────────────────────────────

  const acquisitionCost =
    inputs.askPrice + (inputs.auctionFee || 0) + (inputs.titleFee || 0);

  const repairCost =
    (inputs.repairCost || estimateRepairCost(inputs.damageType)) +
    (inputs.reconCost || 0);

  const transportCost =
    inputs.transportCost || estimateTransportCost(inputs.miles || 0);

  const holdingDays = inputs.holdingDays || 14;
  const dailyFloorRate = inputs.dailyFloorRate || 35;
  const holdingCost = holdingDays * dailyFloorRate;

  const sellingCost = inputs.sellingFee || 0;

  const totalCost =
    acquisitionCost + repairCost + transportCost + holdingCost + sellingCost;

  // ─── PROFIT METRICS ───────────────────────────────────────────────────────────

  const profit = inputs.salePrice - totalCost;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const profitMargin =
    inputs.salePrice > 0 ? (profit / inputs.salePrice) * 100 : 0;
  const breakEvenDay =
    dailyFloorRate > 0 ? Math.ceil(profit / dailyFloorRate) : 0;

  // ─── SCORING ALGORITHM ────────────────────────────────────────────────────────

  // 1. Profit Score (0-40 points) - Absolute profit amount
  let profitScore = 0;
  if (profit >= 5000) profitScore = 40;
  else if (profit >= 4000) profitScore = 35;
  else if (profit >= 3000) profitScore = 30;
  else if (profit >= 2000) profitScore = 25;
  else if (profit >= 1500) profitScore = 20;
  else if (profit >= 1000) profitScore = 15;
  else if (profit >= 500) profitScore = 10;
  else if (profit >= 0) profitScore = 5;
  else profitScore = 0;

  // 2. ROI Score (0-30 points) - Return on investment percentage
  let roiScore = 0;
  if (roi >= 50) roiScore = 30;
  else if (roi >= 40) roiScore = 27;
  else if (roi >= 30) roiScore = 24;
  else if (roi >= 25) roiScore = 21;
  else if (roi >= 20) roiScore = 18;
  else if (roi >= 15) roiScore = 15;
  else if (roi >= 10) roiScore = 12;
  else if (roi >= 5) roiScore = 8;
  else if (roi >= 0) roiScore = 4;
  else roiScore = 0;

  // 3. Speed Score (0-15 points) - How quickly can we flip this
  let speedScore = 0;
  const estimatedDaysToSell = estimateDaysToSell(inputs);
  if (estimatedDaysToSell <= 7) speedScore = 15;
  else if (estimatedDaysToSell <= 14) speedScore = 13;
  else if (estimatedDaysToSell <= 21) speedScore = 11;
  else if (estimatedDaysToSell <= 30) speedScore = 9;
  else if (estimatedDaysToSell <= 45) speedScore = 7;
  else if (estimatedDaysToSell <= 60) speedScore = 5;
  else speedScore = 3;

  // 4. Risk Score (0-15 points) - Lower risk = higher score
  let riskScore = 15; // Start with full points, deduct for risks

  // Deduct for high repair costs
  if (repairCost > 3000) riskScore -= 3;
  else if (repairCost > 2000) riskScore -= 2;
  else if (repairCost > 1000) riskScore -= 1;

  // Deduct for long transport
  if ((inputs.miles || 0) > 1000) riskScore -= 2;
  else if ((inputs.miles || 0) > 500) riskScore -= 1;

  // Deduct for long holding period
  if (holdingDays > 30) riskScore -= 3;
  else if (holdingDays > 21) riskScore -= 2;
  else if (holdingDays > 14) riskScore -= 1;

  // Deduct if price is significantly below MMR (might be hidden issues)
  if (inputs.mmrValue && inputs.askPrice < inputs.mmrValue * 0.5)
    riskScore -= 2;

  // Ensure risk score doesn't go negative
  riskScore = Math.max(0, riskScore);

  // 5-8. Market Intelligence Scores (0-30 points total)
  const marketDemandScore = inputs.marketDemandScore || 5; // Default moderate
  const marketVelocityScore = inputs.marketVelocityScore || 5; // Default moderate
  const seasonalityScore = inputs.seasonalityScore || 3; // Default neutral
  const competitionScore = inputs.competitionScore || 3; // Default moderate

  // ─── TOTAL SCORE & VERDICT ───────────────────────────────────────────────────

  const score = Math.round(
    profitScore +
      roiScore +
      speedScore +
      riskScore +
      marketDemandScore +
      marketVelocityScore +
      seasonalityScore +
      competitionScore,
  );

  let verdict: "go" | "hold" | "pass";
  // Adjusted thresholds for 130-point scale
  if (score >= 90 && profit >= 1500) verdict = "go";
  else if (score >= 65 && profit >= 500) verdict = "hold";
  else verdict = "pass";

  // ─── WARNINGS & RECOMMENDATIONS ──────────────────────────────────────────────

  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (profit < 0) {
    warnings.push("Negative profit - this deal will lose money");
  } else if (profit < 500) {
    warnings.push("Low profit margin - consider negotiating price down");
  }

  if (roi < 10) {
    warnings.push("Low ROI - your money could work harder elsewhere");
  }

  if (holdingDays > 30) {
    warnings.push("Long holding period - high carrying costs");
  }

  if (repairCost > 3000) {
    warnings.push("High repair costs - verify estimates before buying");
  }

  if ((inputs.miles || 0) > 1000) {
    warnings.push("Long distance transport - verify transport quote");
  }

  if (inputs.mmrValue && inputs.salePrice > inputs.mmrValue * 1.1) {
    warnings.push("Sale price above MMR - may take longer to sell");
  }

  // Recommendations
  if (profit >= 2000 && roi >= 20) {
    recommendations.push("Strong deal - move quickly before competition");
  }

  if (estimatedDaysToSell <= 14) {
    recommendations.push("Fast-moving vehicle - good for quick flip");
  }

  if (repairCost < 1000 && profit >= 1500) {
    recommendations.push("Low repair risk with good profit - ideal deal");
  }

  if (holdingDays <= 14 && profit >= 1000) {
    recommendations.push("Short holding period - minimizes carrying costs");
  }

  return {
    totalCost,
    acquisitionCost,
    repairCost,
    transportCost,
    holdingCost,
    sellingCost,
    profit,
    roi,
    profitMargin,
    breakEvenDay,
    score,
    verdict,
    scoreBreakdown: {
      profitScore,
      roiScore,
      speedScore,
      riskScore,
      marketDemandScore,
      marketVelocityScore,
      seasonalityScore,
      competitionScore,
    },
    warnings,
    recommendations,
  };
}

/**
 * Estimate repair cost based on damage type
 */
function estimateRepairCost(damageType?: string): number {
  if (!damageType) return 0;

  // Auction feeds (Copart/IAA) emit free-text like "FRONT END", "ALL OVER", "REAR END",
  // "BURN", "WATER/FLOOD" — keyword-match case-insensitively rather than exact-keying.
  const d = damageType.toLowerCase().trim();
  if (!d || d === "none") return 0;

  // Order matters: most severe / most specific buckets first.
  if (d.includes("all over") || d.includes("total")) return 6000;
  if (d.includes("frame") || d.includes("structural") || d.includes("roll"))
    return 5000;
  if (d.includes("burn") || d.includes("fire")) return 4000;
  if (d.includes("water") || d.includes("flood")) return 3500;
  if (d.includes("front")) return 2500;
  if (d.includes("side")) return 2200;
  if (d.includes("rear")) return 2000;
  if (d.includes("mechanical")) return 2000;
  if (d.includes("hail")) return 1500;
  if (d.includes("minor") || d.includes("scratch")) return 500;

  return 1500; // sensible default for unrecognized but present damage
}

/** Normalize free-text damage into a coarse bucket the day-to-sell heuristic understands. */
function damageBucket(damageType?: string): "severe" | "minor" | "none" {
  if (!damageType) return "none";
  const d = damageType.toLowerCase().trim();
  if (!d || d === "none") return "none";
  if (
    d.includes("all over") ||
    d.includes("total") ||
    d.includes("frame") ||
    d.includes("structural") ||
    d.includes("roll") ||
    d.includes("burn") ||
    d.includes("fire") ||
    d.includes("water") ||
    d.includes("flood")
  )
    return "severe";
  if (d.includes("minor") || d.includes("scratch") || d.includes("hail"))
    return "minor";
  return "minor";
}

/**
 * Estimate transport cost based on miles
 */
function estimateTransportCost(miles: number): number {
  if (miles === 0) return 0;

  // Base rate + per-mile rate
  const baseRate = 200;
  const perMileRate = miles <= 500 ? 0.6 : miles <= 1000 ? 0.5 : 0.45;

  return Math.round(baseRate + miles * perMileRate);
}

/**
 * Estimate days to sell based on vehicle characteristics
 */
function estimateDaysToSell(inputs: DealInputs): number {
  let baseDays = 21; // Average days to sell

  // Adjust for price point
  if (inputs.salePrice > 30000)
    baseDays += 14; // Luxury takes longer
  else if (inputs.salePrice < 10000) baseDays -= 7; // Budget sells faster

  // Adjust for condition (keyword-matched to handle auction free-text).
  const dmg = damageBucket(inputs.damageType);
  if (dmg === "severe")
    baseDays += 21; // Salvage takes much longer
  else if (dmg === "minor") baseDays += 7; // Minor damage adds some time

  // Adjust for pricing vs MMR
  if (inputs.mmrValue && inputs.salePrice) {
    const pricingRatio = inputs.salePrice / inputs.mmrValue;
    if (pricingRatio > 1.1)
      baseDays += 14; // Overpriced
    else if (pricingRatio < 0.9) baseDays -= 7; // Underpriced sells faster
  }

  return Math.max(7, baseDays); // Minimum 7 days
}

/**
 * Quick score calculation for scraped deals (without full inputs)
 */
export function quickScore(
  askPrice: number,
  mmrValue: number,
  miles?: number,
): number {
  const estimatedProfit = mmrValue - askPrice - 1500; // Rough estimate
  const estimatedROI = askPrice > 0 ? (estimatedProfit / askPrice) * 100 : 0;

  let score = 50; // Base score

  // Profit component
  if (estimatedProfit >= 3000) score += 25;
  else if (estimatedProfit >= 2000) score += 20;
  else if (estimatedProfit >= 1000) score += 15;
  else if (estimatedProfit >= 500) score += 10;
  else if (estimatedProfit < 0) score -= 20;

  // ROI component
  if (estimatedROI >= 30) score += 20;
  else if (estimatedROI >= 20) score += 15;
  else if (estimatedROI >= 10) score += 10;
  else if (estimatedROI < 0) score -= 15;

  // Mileage component (lower is better)
  if (miles) {
    if (miles < 50000) score += 5;
    else if (miles > 150000) score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}
