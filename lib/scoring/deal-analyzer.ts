// lib/scoring/deal-analyzer.ts
// Turns a scraped deal into a full buy/sell/repair/profit decision using the comprehensive
// calculateProfit model — replacing the naive "ask × markup" scorer in the live pipeline.
//
// It computes, per deal:
//   • BUY  — bid + realistic auction buyer fees + title fee
//   • REPAIR — from damage_type (+ recon for salvage-auction sources)
//   • TRANSPORT — distance from the listing's state to your home base × carrier rate
//   • SELL — market value (mmr/comps) when known, else a source/condition-aware markup
//   • PROFIT/ROI/score/verdict + a recommended MAX BID to hit a target ROI

import { Deal } from "@/types";
import { calculateProfit, type ProfitResult } from "./profit-calculator";
import { milesBetweenStates, transportCostForMiles } from "@/lib/geo";
import {
  lookupMarketValue,
  lookupMarketAggregate,
  lookupSupply,
  lookupRealSold,
} from "./market-value";
import { estimateBaselineValue } from "./baseline-value";
import {
  conditionAdjustedSell,
  titleSeverityMultiplier,
} from "./condition-value";
import { checkPriceSanity } from "./price-sanity";
import { predict, type Prediction } from "@/lib/intelligence/predict";
import { isKnownMake } from "@/lib/scrapers/tools/deal-normalizer";

// Home base used for transport-distance math (where you recondition/sell). Override via env.
const HOME_BASE_STATE = process.env.HOME_BASE_STATE || "TX";
// Target ROI used to back-solve the recommended max bid (e.g. 0.20 = 20%).
const TARGET_ROI = parseFloat(process.env.TARGET_ROI || "0.20");
// Selling + reconditioning-to-retail load, as a fraction of sale price (real flips run ~8-10%).
const SELL_COST_PCT = parseFloat(process.env.SELL_COST_PCT || "0.09");
// Conservative national-average tow when the listing has no usable location (miles unknown).
const DEFAULT_TRANSPORT_COST = parseFloat(
  process.env.DEFAULT_TRANSPORT_COST || "600",
);

// Map a private/retail condition (when no damage_type is present) to a recon/repair baseline,
// so obviously-damaged private cars don't book $0 repair.
function conditionRepairBaseline(condition?: string): number {
  const c = (condition || "").toLowerCase();
  if (!c) return 0;
  if (
    c.includes("salvage") ||
    c.includes("rebuilt") ||
    c.includes("repairable") ||
    c.includes("parts")
  )
    return 2500;
  if (c.includes("run_drive") || c.includes("run/drive")) return 1500;
  if (
    c.includes("used") ||
    c.includes("clean") ||
    c.includes("fair") ||
    c.includes("good")
  )
    return 400;
  return 0;
}

// Cheap, deterministic body-type demand + seasonality signal so the score adapts per
// vehicle/season instead of staying a flat constant. No DB calls.
function marketSignals(
  make?: string,
  model?: string,
  month?: number,
): {
  demand: number; // 0-10
  velocity: number; // 0-10
  seasonality: number; // 0-5
  competition: number; // 0-5
} {
  const mm = `${make || ""} ${model || ""}`.toLowerCase();
  const m = month ?? new Date().getMonth() + 1; // 1-12

  const isTruckSuv =
    /\b(silverado|sierra|f-?150|f-?250|f-?350|ram|tundra|tacoma|titan|frontier|ranger|colorado|canyon)\b/.test(
      mm,
    ) ||
    /\b(tahoe|suburban|yukon|expedition|explorer|wrangler|4runner|highlander|pilot|telluride|palisade|grand ?cherokee|durango|sequoia|bronco|escalade)\b/.test(
      mm,
    ) ||
    /\b(suv|truck|pickup|4wd|awd)\b/.test(mm);
  const isConvertible = /\b(convertible|roadster|spyder|cabriolet)\b/.test(mm);
  const isSports =
    /\b(corvette|mustang|camaro|challenger|charger|porsche|ferrari|gt-?r|supra|miata|m3|m4)\b/.test(
      mm,
    );

  // Demand (0-10): trucks/SUVs move fastest; sports moderate; convertibles softer.
  let demand = 5;
  if (isTruckSuv) demand = 8;
  else if (isSports) demand = 6;
  else if (isConvertible) demand = 4;

  // Seasonality (0-5): trucks/SUVs peak in winter; convertibles/sports peak in spring/summer.
  let seasonality = 3;
  if (isTruckSuv)
    seasonality = m >= 10 || m <= 2 ? 5 : m >= 3 && m <= 5 ? 3 : 2;
  else if (isConvertible || isSports) seasonality = m >= 4 && m <= 8 ? 5 : 2;

  // Velocity/competition kept neutral-ish but tied to body type (deterministic, cheap).
  const velocity = isTruckSuv ? 6 : 5;
  let competition = isTruckSuv ? 4 : 3;

  // Blend REAL supply scarcity (national active-listing count for this make|model) into the
  // body-type prior: a flooded model is harder to move (more competition, softer demand); a scarce
  // one clears faster. Conservative ±1 nudges so verdicts shift sensibly, not wildly. Falls back to
  // the prior when the index isn't loaded (lookupSupply → null).
  const supply = lookupSupply(make, model);
  if (supply != null && supply > 0) {
    if (supply >= 60) {
      demand = Math.max(2, demand - 1);
      competition = Math.min(5, competition + 1);
    } else if (supply <= 8) {
      demand = Math.min(10, demand + 1);
      competition = Math.max(1, competition - 1);
    }
  }

  return { demand, velocity, seasonality, competition };
}

interface FeeModel {
  feeRate: number; // % of bid charged as buyer premium
  flatFee: number; // flat auction/bid fees
  titleFee: number;
  reconCost: number; // baseline cleanup/keys/detailing for the source type
}

// Realistic-enough acquisition cost model per source (auction fees are otherwise ignored).
function feeModel(source?: string): FeeModel {
  const s = (source || "").toLowerCase();
  if (s === "copart" || s === "iaa")
    return { feeRate: 0.1, flatFee: 130, titleFee: 100, reconCost: 500 };
  if (s === "manheim" || s === "adesa" || s === "acv")
    return { feeRate: 0.0, flatFee: 600, titleFee: 100, reconCost: 300 };
  // Private party / retail marketplaces — no buyer premium.
  return { feeRate: 0, flatFee: 0, titleFee: 0, reconCost: 0 };
}

// Wholesale/auction channels — the ONLY listings where the ask/bid legitimately sits BELOW retail (that's
// the arbitrage). Everything else is a RETAIL ASK: the seller's own researched market price, which must
// anchor the value (see the ask-ceiling in analyzeDeal) so contaminated model-comps can't invent profit.
const AUCTION_SOURCES = new Set([
  "copart",
  "iaa",
  "manheim",
  "adesa",
  "acv",
  "publicsurplus",
  "govdeals",
  "gsa",
  "gsa_auctions",
  "municibid",
  "govplanet",
  "purplewave",
  "govdeals_auction",
]);
function isRetailAsk(source?: string): boolean {
  return !AUCTION_SOURCES.has((source || "").toLowerCase());
}

// Fallback sell value when no market/MMR number is available: source/condition-aware markup on ask.
function estimateSellValue(
  askPrice: number,
  source?: string,
  condition?: string,
): number {
  const c = (condition || "").toLowerCase();
  const s = (source || "").toLowerCase();
  let markup = 1.25;
  if (c.includes("salvage") || c.includes("parts")) markup = 1.35;
  else if (s === "copart" || s === "iaa") markup = 1.3;
  else if (s === "manheim" || s === "adesa" || s === "acv") markup = 1.2;
  else if (
    s === "craigslist" ||
    s === "facebook_marketplace" ||
    s === "offerup"
  )
    markup = 1.15;
  return Math.round(askPrice * markup);
}

export interface ValuationBreakdown {
  basis: "comps" | "market" | "baseline";
  compCount: number;
  compConfidence: "high" | "medium" | "low" | "none";
  cleanComp: number | null;
  soldCount: number;
  soldAnchored: boolean;
  kbbValue: number | null;
  mileageMult: number;
  titleMult: number;
  titleTag: string;
  baseline: number;
}

export interface DealAnalysis extends ProfitResult {
  sellEstimate: number;
  mmrValue?: number;
  sellBasis: "comps" | "market" | "baseline";
  valuation?: ValuationBreakdown;
  recommendedMaxBid: number;
  miles: number | null;
  priceImplausible: boolean;
  // Why the sell estimate is what it is: the title/damage class applied to clean retail, and whether
  // it was anchored to real completed-sale prices (eBay sold) for the damaged/budget segment.
  conditionTag: string;
  soldAnchored: boolean;
  // Wholesale / MMR-equivalent buy-side benchmark — what this unit is worth at auction/wholesale.
  wholesaleEstimate: number;
  // "Too good to be true" detector: 'typo' (dropped-digit, with the likely real price), 'implausible'
  // (bait/deposit), or 'ok'. Lets the UI warn instead of showing fake profit.
  priceSanity: "ok" | "typo" | "implausible";
  inferredPrice?: number;
  // Forward-looking forecasts — time-to-sell, price-drop likelihood, urgency, projected ROI.
  prediction?: Prediction;
}

// Dealer financing / lease / payment bait: a "$999" 2024 truck isn't a sale price — it's a down
// payment ("WE FINANCE/FINANCIAMOS/BHPH"), a monthly ("$/mo"), or a lease takeover. These flood
// the cheap end of a marketplace and would otherwise score as fake GO steals. Title-based, free.
const BAIT_RE =
  /\b(we ?finance|financiamos|buy ?here ?pay ?here|bhph|in[-\s]?house|as low as|lease ?(take ?over|takeover|transfer|assumption)|take ?over (the )?lease|down ?payment|\$\d+\s*down|per month|a month|\/mo\b|\bo\.?a\.?c\.?\b|\bw\.?a\.?c\.?\b|on approved credit|no credit|bad credit)\b/i;

// A listing's price is implausible (not a real purchase price) when it sits too far below the
// vehicle's resale baseline. A plain listing under ~8% of resale is a teaser/deposit/scam. Financing
// /lease "bait" keywords (WE FINANCE, NO CREDIT, $/mo, lease takeover) by themselves don't prove
// anything — a legit dealer can list a real $28k price *and* advertise financing — so a keyword only
// RAISES suspicion: it lifts the threshold to ~40%, catching down-payment numbers ("$4k down on a
// $25k King Ranch") while sparing full-price listings that merely mention financing. Salvage/parts
// can be legitimately cheap, so they're exempt from the price test entirely.
function isPriceImplausible(deal: Partial<Deal>, baseline: number): boolean {
  const ask = deal.ask_price || 0;
  if (ask <= 0 || baseline <= 0) return false; // no price / no baseline → handled elsewhere
  const salvageLike =
    /salvage|parts|rebuilt|repairable|flood|non[- ]?run|not running|mechanic special/.test(
      `${deal.condition || ""} ${deal.title || ""}`.toLowerCase(),
    );
  if (salvageLike) return false;
  const threshold = BAIT_RE.test(deal.title || "") ? 0.4 : 0.08;
  return ask < baseline * threshold;
}

/** Run the full decision model for one deal. */
export function analyzeDeal(deal: Partial<Deal>): DealAnalysis {
  const askPrice = deal.ask_price || 0;
  const fm = feeModel(deal.source);

  // SELL side, in order of trust:
  //  1. real retail comps from our own scraped data (lib/scoring/market-value.ts)
  //  2. a market value already attached to the deal (mmr_value, e.g. from MarketCheck/VIN)
  //  3. the nightly market_aggregates rollup — accumulated history that compounds as we scrape
  //  4. a source/condition markup on ask (fallback)
  const comps = lookupMarketValue(deal.make, deal.model, deal.year, deal.trim);
  const hasMarket = typeof deal.mmr_value === "number" && deal.mmr_value > 0;
  const aggregate = lookupMarketAggregate(deal.make, deal.model, deal.year);

  // Free offline baseline (segment depreciation + trim tier). Doubles as a SANITY GATE so a single
  // outlier comp (e.g. a $42k Shelby setting the "Mustang" median) can't produce a wild resale value.
  const baseline = estimateBaselineValue(
    deal.year,
    deal.make,
    deal.model,
    deal.mileage,
    deal.trim,
    deal.condition,
  );
  // Tight upper bound: over-valuing (fake GO deals that lose money) is worse than under-valuing, so
  // reject any comp/market value above N× the trim-aware baseline and fall back to the baseline. For
  // OLD vehicles the model comps are heavily contaminated by far-newer years (a 2003 Silverado priced
  // off 2020 trucks), so bound them tighter — a 20-yr-old truck can't be worth 1.9× its baseline.
  const vehicleAge = deal.year
    ? Math.max(0, new Date().getFullYear() - deal.year)
    : 0;
  const upperMult = vehicleAge >= 18 ? 1.35 : vehicleAge >= 12 ? 1.5 : 1.9;
  const sane = (v: number) =>
    baseline <= 0 ? v > 0 : v >= baseline * 0.4 && v <= baseline * upperMult;

  // THE MOAT: a clean-market comp is not what THIS car is worth. Convert each clean value (comps,
  // mmr, aggregate) into the car's real value via title/damage + mileage, anchored to real completed
  // sales for the damaged/budget segment. A flooded/salvage 2023 model no longer books clean retail.
  const realSold = lookupRealSold(deal.make, deal.model, deal.year);
  const conditionTag = titleSeverityMultiplier(deal).tag;
  // Comps: anchor the mileage adjustment to the comp pool's actual median mileage (precise).
  const compAdj = comps?.retail
    ? conditionAdjustedSell(
        comps.retail,
        deal,
        realSold,
        undefined,
        comps.mileageMed,
      )
    : null;
  // KBB (mmr) is already priced for THIS vehicle's mileage — pass the deal's own miles as the reference
  // so we don't penalize mileage twice (title/real-sold adjustments still apply).
  const mmrAdj = hasMarket
    ? conditionAdjustedSell(
        deal.mmr_value as number,
        deal,
        realSold,
        undefined,
        deal.mileage,
      )
    : null;
  const aggAdj =
    aggregate && aggregate.value > 0
      ? conditionAdjustedSell(aggregate.value, deal, realSold)
      : null;

  // Comp acceptance. The mileage-anchored comp is REAL market data, so when the bucket is reliable
  // (high/medium confidence) we bound it against the comp median (allowing a legit low-mileage premium)
  // rather than the crude, often-too-low baseline — which otherwise rejected good premiums and slammed
  // the car down to baseline. Thin/low-confidence buckets keep the tight baseline cap (contamination
  // risk). The floor still guards against absurdly-low comps.
  const trustComp =
    comps?.confidence === "high" || comps?.confidence === "medium";
  const compFloor = baseline > 0 ? baseline * 0.4 : 1;
  const compCeil =
    trustComp && comps?.retail
      ? Math.max(
          baseline > 0 ? baseline * upperMult : 0,
          comps.retail * 1.3, // allow up to a ~1.3× low-mileage premium over the median
        )
      : baseline > 0
        ? baseline * upperMult
        : Infinity;
  const compAccept =
    !!compAdj && compAdj.sell >= compFloor && compAdj.sell <= compCeil;

  let sellEstimate: number;
  let sellBasis: "comps" | "market" | "baseline";
  let soldAnchored = false;
  if (compAdj && compAccept) {
    // Confidence-blend: deep buckets trust the comps; thin/mixed-trim buckets get pulled toward the
    // trim-aware baseline (which is itself condition-adjusted) so one outlier can't over-value a unit.
    const w =
      comps!.confidence === "high"
        ? 1
        : comps!.confidence === "medium"
          ? 0.85
          : 0.5;
    sellEstimate =
      baseline > 0
        ? Math.round(compAdj.sell * w + baseline * (1 - w))
        : compAdj.sell;
    sellBasis = "comps";
    soldAnchored = compAdj.soldAnchored;
  } else if (mmrAdj && sane(mmrAdj.sell)) {
    sellEstimate = mmrAdj.sell;
    sellBasis = "market";
    soldAnchored = mmrAdj.soldAnchored;
  } else if (aggAdj && sane(aggAdj.sell)) {
    sellEstimate = aggAdj.sell;
    sellBasis = "market";
    soldAnchored = aggAdj.soldAnchored;
  } else if (baseline > 0) {
    // No trustworthy comp → realistic depreciation estimate (already title/mileage-adjusted).
    sellEstimate = baseline;
    sellBasis = "baseline";
  } else {
    sellEstimate = estimateSellValue(askPrice, deal.source, deal.condition);
    sellBasis = "baseline";
  }

  // ── ASK-ANCHOR (retail listings) ──────────────────────────────────────────────────────────────────
  // A retail ASKING price is the seller's own researched market value — the strongest single signal of
  // THIS exact car's worth. Model-level comps get contaminated (a base Corvette priced off Z06s/C8s, an
  // XLT off a Raptor), so a retail listing must NEVER be valued far above its ask — that manufactures fake
  // profit and misleads the user. Only deep, high-confidence comps justify a real underpricing gap, and
  // even then it's bounded. Auction/wholesale sources are exempt: there the ask IS below retail (the whole
  // point), so retail comps above it are the legitimate arbitrage.
  if (isRetailAsk(deal.source) && askPrice > 0) {
    const overAsk =
      comps?.confidence === "high"
        ? 1.15
        : comps?.confidence === "medium"
          ? 1.08
          : 1.03; // low/no confidence → the ask essentially IS the value
    const askCeiling = Math.round(askPrice * overAsk);
    if (sellEstimate > askCeiling) {
      sellEstimate = askCeiling;
      sellBasis = "market"; // ask-anchored (retail listing's own price is the market read)
    }
    // SYMMETRIC floor: without trustworthy comps, a crude baseline can under-value a retail car far below
    // its ask (a false "overpriced/pass" — the opposite error, just as inaccurate). The ask is the market
    // signal in BOTH directions, so with weak comps don't deviate down without evidence. Confident comps
    // still drive a genuine overpriced read below this floor.
    if (!trustComp) {
      const askFloor = Math.round(askPrice * 0.9);
      if (sellEstimate < askFloor) {
        sellEstimate = askFloor;
        sellBasis = "market";
      }
    }
  }

  // WHOLESALE / MMR-equivalent — the buy-side benchmark (what this unit is worth at auction/wholesale).
  // Prefer our real wholesale-channel median (Copart/private transactions) when it's deep enough; else
  // derive from the condition-adjusted sell estimate (wholesale runs ~17% under retail). Inherits the
  // multi-source, title/mileage/sold-anchored sell number, so it's condition-aware by construction.
  const WHOLESALE_RATIO = 0.83;
  const wholesaleEstimate =
    comps?.wholesale && comps.nWholesale >= 6 && sane(comps.wholesale)
      ? Math.round((comps.wholesale + sellEstimate * WHOLESALE_RATIO) / 2)
      : sellEstimate > 0
        ? Math.round(sellEstimate * WHOLESALE_RATIO)
        : 0;

  // TRANSPORT: listing state → home base. When location is missing (miles null), don't
  // book $0 — use a conservative national-average so deals aren't falsely cheap to move.
  const miles = milesBetweenStates(
    deal.location_state || undefined,
    HOME_BASE_STATE,
  );
  const transportCost =
    miles != null ? transportCostForMiles(miles) : DEFAULT_TRANSPORT_COST;

  const auctionFee = Math.round(askPrice * fm.feeRate + fm.flatFee);

  // REPAIR: auction sources carry damage_type; private/retail sources carry only a condition.
  // When damage_type is absent, derive a recon/repair baseline from condition so damaged
  // private cars aren't scored as $0-repair. Pass it as an explicit repairCost override.
  const hasDamageType = !!(
    deal.damage_type &&
    deal.damage_type.trim() &&
    deal.damage_type.toLowerCase() !== "none"
  );
  const conditionRepair = hasDamageType
    ? undefined
    : conditionRepairBaseline(deal.condition);

  // SELLING + recon-to-retail load (~9% of sale), so profit isn't overstated.
  const sellingFee = Math.round(sellEstimate * SELL_COST_PCT);

  // Cheap, deterministic market-intelligence signals so the score adapts by vehicle/season.
  const signals = marketSignals(deal.make, deal.model);

  const result = calculateProfit({
    askPrice,
    auctionFee,
    titleFee: fm.titleFee,
    damageType: deal.damage_type || undefined,
    repairCost: conditionRepair,
    reconCost: fm.reconCost,
    miles: miles ?? undefined,
    transportCost,
    salePrice: sellEstimate,
    sellingFee,
    // Feed only a real market value into the risk model (comps/market, not the baseline estimate).
    mmrValue: sellBasis === "baseline" ? undefined : sellEstimate,
    make: deal.make || undefined,
    model: deal.model || undefined,
    marketDemandScore: signals.demand,
    marketVelocityScore: signals.velocity,
    seasonalityScore: signals.seasonality,
    competitionScore: signals.competition,
  });

  // Recommended MAX BID to achieve TARGET_ROI, holding non-acquisition costs fixed.
  // totalCost = acquisition + (repair + transport + holding + selling); acquisition = bid*(1+feeRate) + flatFee + titleFee
  // require (sell - totalCost)/totalCost >= TARGET_ROI  →  maxTotal = sell / (1+TARGET_ROI)
  const fixedNonAcq =
    result.repairCost +
    result.transportCost +
    result.holdingCost +
    result.sellingCost;
  const maxTotal = sellEstimate / (1 + TARGET_ROI);
  const maxAcquisition = maxTotal - fixedNonAcq;
  const recommendedMaxBid = Math.max(
    0,
    Math.round((maxAcquisition - fm.flatFee - fm.titleFee) / (1 + fm.feeRate)),
  );

  // Clamp the score to a real 0–100 (the raw model could exceed 100 on strong deals).
  let score = Math.max(0, Math.min(100, Math.round(result.score)));
  let verdict = result.verdict;
  let warnings = result.warnings;

  // Reality gate: a deal isn't a valuation-grade flip if (a) the price is financing/lease/payment
  // bait (fake $999), or (b) the make isn't a recognized automotive brand ("Biz On Wheels" — junk
  // or mis-parsed). Either way, force it out of GO (so it can't reach the scan "GO only" filter, the
  // flash feed, or the market pulse), cap the score, and surface a red warning. The Deal IQ engine
  // reads the same `priceImplausible` flag to hard-floor its score, so the IQ chip can't contradict
  // the PASS verdict on the same card.
  const priceBait = isPriceImplausible(deal, baseline);
  const unknownMake = !!deal.make && !isKnownMake(deal.make);
  // "Too good to be true": a clean late-model car priced at a fraction of its value is a dropped-digit
  // typo or bait, NOT a +$40k steal. Catch it against the (condition-adjusted) sell estimate.
  const sanity = checkPriceSanity(askPrice, sellEstimate, deal.condition);
  // Distribution-aware outlier: priced below the LOWER statistical fence (q1−1.5·IQR) of THIS market's ask
  // comps — adaptive per make/model, no keyword required, so it catches teasers/typos the fixed-ratio check
  // misses in a tight bucket. Salvage/parts can legitimately sit below the clean-comp fence, so exempt them.
  const salvageForFence =
    /salvage|parts|rebuilt|repairable|flood|non[- ]?run|not running|mechanic special/.test(
      `${deal.condition || ""} ${deal.title || ""}`.toLowerCase(),
    );
  const belowMarketFence =
    !salvageForFence &&
    askPrice > 0 &&
    comps?.retailLowFence != null &&
    askPrice < comps.retailLowFence;
  const priceImplausible =
    priceBait || unknownMake || belowMarketFence || sanity.status !== "ok";
  if (priceImplausible) {
    verdict = "pass";
    score = Math.min(score, 20);
    const sanityMsg =
      sanity.status === "typo"
        ? `⚠ ${sanity.reason}`
        : sanity.status === "implausible"
          ? `⚠ ${sanity.reason}`
          : null;
    warnings = [
      ...(sanityMsg ? [sanityMsg] : []),
      ...(priceBait
        ? [
            "Listed price looks like a down payment / monthly / lease takeover — not a real sale price. Verify the actual buy price before bidding.",
          ]
        : []),
      ...(unknownMake && !sanityMsg
        ? [
            `Unrecognized make "${deal.make}" — this isn't a valuation-grade vehicle listing (likely junk or mis-parsed), so it's not scored as a deal.`,
          ]
        : []),
      ...warnings,
    ];
  }

  // TRUST GATE: a GO is a promise about resale value, made with the dealer's money. We never make that
  // promise on a baseline-only estimate (offline depreciation curve, no real market comps) — even if the
  // math pencils out, we can't VERIFY the resale price. Demote those to HOLD so a GO always means
  // "backed by real comps or a third-party market value (KBB/aggregate)". PASS stays PASS. This is the
  // line between a tip and a guarantee, and it's why the GO/PASS can be trusted.
  if (verdict === "go" && sellBasis === "baseline") {
    verdict = "hold";
    score = Math.min(score, 84); // strong HOLD ("great on paper, unverified"), just below the GO band
    warnings = [
      "Resale value here is an offline estimate — we don't yet have real market comps for this exact car, so it's a HOLD, not a confident GO. Verify the resale price before you buy.",
      ...warnings,
    ];
  }

  // Forecasting layer — what's ABOUT to happen, from data we already have (supply scarcity, days-on-market,
  // ask-vs-market, prior cuts, margin). Pure + explainable; degrades to nulls when a signal is missing.
  const firstSeen = (deal as { first_seen_at?: string }).first_seen_at;
  const prediction = predict({
    daysOnMarket: firstSeen
      ? (Date.now() - new Date(firstSeen).getTime()) / 86_400_000
      : null,
    priceVsMarket:
      comps?.retail && askPrice > 0 ? askPrice / comps.retail : null,
    marketSupply: lookupSupply(deal.make ?? "", deal.model ?? ""),
    priceDrops: (deal as { price_drops?: number }).price_drops ?? null,
    netProfit: result.profit ?? null,
    cost: recommendedMaxBid || (askPrice > 0 ? askPrice : null),
    isBuy: verdict === "go",
  });

  return {
    ...result,
    score,
    verdict,
    warnings,
    prediction,
    sellEstimate,
    mmrValue: deal.mmr_value,
    sellBasis,
    recommendedMaxBid,
    miles,
    priceImplausible,
    conditionTag,
    soldAnchored,
    wholesaleEstimate,
    priceSanity: sanity.status,
    inferredPrice: sanity.inferredPrice,
    // The evidence + adjustments behind the resale number — so the UI can show HOW we valued it.
    // This is the moat made transparent: real comps, KBB, sold prices, and the exact title/mileage cuts.
    valuation: {
      basis: sellBasis,
      compCount: comps?.nRetail ?? 0,
      compConfidence: comps?.confidence ?? "none",
      cleanComp: comps?.retail ?? null,
      soldCount: realSold?.n ?? 0,
      soldAnchored,
      kbbValue: deal.mmr_value || null,
      mileageMult: (compAdj ?? mmrAdj ?? aggAdj)?.mileageMult ?? 1,
      titleMult: (compAdj ?? mmrAdj ?? aggAdj)?.titleMult ?? 1,
      titleTag: conditionTag,
      baseline,
    },
  };
}
