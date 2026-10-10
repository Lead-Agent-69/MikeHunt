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
import {
  buyerDistance,
  transportCostForDistance,
  type DistanceBasis,
  type GeoPoint,
} from "@/lib/geo/buyer-distance";
import {
  lookupMarketValue,
  lookupSupply,
  lookupRealSold,
  lookupSalvageSold,
} from "./market-value";
import { estimateBaselineValue } from "./baseline-value";
import {
  aggregateComps,
  compConfidence,
  COMP_MIN_SAMPLES,
  type CompAggregate,
  type CompObservation,
} from "./comps-aggregate";
import {
  conditionAdjustedSell,
  titleSeverityMultiplier,
} from "./condition-value";
import { checkPriceSanity } from "./price-sanity";
import { predict, type Prediction } from "@/lib/intelligence/predict";
import { isKnownMake } from "@/lib/scrapers/tools/deal-normalizer";

// Home base for transport. A caller's profile home_state wins. HOME_BASE_STATE is an
// explicit operator override. There is no Texas default — a missing state keeps the
// flat DEFAULT_TRANSPORT_COST instead of inventing miles.
function resolveHomeState(explicit?: string | null): string {
  const fromCaller = explicit?.trim();
  if (fromCaller) return fromCaller.toUpperCase();
  const fromEnv = process.env.HOME_BASE_STATE?.trim();
  return fromEnv ? fromEnv.toUpperCase() : "";
}
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
function conditionRepairBaseline(
  condition?: string,
  retailAsk = false,
): number {
  const c = (condition || "").toLowerCase();
  if (!c) return 0;
  // "run_drive" is an auction grade (Copart/IAA "runs and drives", sold as-is). On a retail ask it is
  // only the scraper's legacy default for "no title/condition parsed" — pipeline.ts now writes NULL
  // instead — so a dealer or Craigslist car is not booked $1,500 of auction-grade repair for it. It
  // gets the same used-retail recon as an explicit "used"/"clean" listing.
  if (retailAsk && (c.includes("run_drive") || c.includes("run/drive")))
    return 400;
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
  // Generic government-surplus lane (GovDeals/municipal feeds normalized to one source). Its price is
  // a current bid, not a seller's retail ask, so it must not be ask-anchored like a dealer listing.
  "gov_auction",
]);
function isRetailAsk(source?: string): boolean {
  return !AUCTION_SOURCES.has((source || "").toLowerCase());
}

// Channels whose live asks feed the in-memory retail comp index (lib/scoring/market-value.ts
// RETAIL_SOURCES on master). A listing from one of these is very likely INSIDE the median it is
// graded against, so analyzeDeal discounts one comp for it (see selfInclusionGuard).
const ASK_INDEX_SOURCES = new Set([
  "cars_com",
  "ebay_motors",
  "cargurus",
  "autotrader",
  "carvana",
  "truecar",
  "vroom",
  "carmax",
  "craigslist_dealer",
]);

// Max resale / ask for a RETAIL listing whose value is backed by ≥ COMP_MIN_SAMPLES live comps, by comp
// confidence (3-5 low, 6-11 medium, 12+ high). Bounds how far under its own market a dealer/private ask
// can be read before we stop believing the comps (trim contamination, mis-parsed model). Env-tunable.
const RETAIL_COMP_UPLIFT: Record<"high" | "medium" | "low" | "none", number> = {
  high: parseFloat(process.env.RETAIL_COMP_UPLIFT_HIGH || "1.4"),
  medium: parseFloat(process.env.RETAIL_COMP_UPLIFT_MEDIUM || "1.3"),
  low: parseFloat(process.env.RETAIL_COMP_UPLIFT_LOW || "1.2"),
  none: 1.03,
};

type IndexComps = NonNullable<ReturnType<typeof lookupMarketValue>>;

const CONF_RANK = { none: 0, low: 1, medium: 2, high: 3 } as const;

/**
 * Approximate circularity guard for the ask index, used only when the listing has no id and no
 * source + source_deal_id (so market-value cannot remove its row exactly). A retail-channel
 * listing's own ask is probably one of the comps behind the median it is graded against. Count it
 * out — if fewer than COMP_MIN_SAMPLES OTHER listings remain, there is no independent market value
 * (retail → null). Confidence can only go down.
 */
export function selfInclusionGuard(
  comps: IndexComps | null,
  deal: Partial<Deal>,
): IndexComps | null {
  if (!comps || comps.retail == null) return comps;
  const ask = Number(deal.ask_price) || 0;
  const likelyInPool =
    ASK_INDEX_SOURCES.has((deal.source || "").toLowerCase()) &&
    ask > 1000 &&
    ask < 200000;
  if (!likelyInPool) return comps;
  const others = Math.max(0, (comps.nRetail || 0) - 1);
  if (others < COMP_MIN_SAMPLES)
    return { ...comps, retail: null, nRetail: others, confidence: "none" };
  const capped = compConfidence(others);
  return {
    ...comps,
    nRetail: others,
    confidence:
      CONF_RANK[capped] < CONF_RANK[comps.confidence]
        ? capped
        : comps.confidence,
  };
}

/** Asking-price comps never read as "high" confidence; completed sales can. */
function capAskConfidence(
  c: "high" | "medium" | "low" | "none",
  askBasis: boolean,
): "high" | "medium" | "low" | "none" {
  return askBasis && c === "high" ? "medium" : c;
}

/** A supplied comp feed (CompObservation[]) as the index shape analyzeDeal consumes. */
function compsFromFeed(agg: CompAggregate): IndexComps | null {
  if (agg.value == null) return null;
  return {
    retail: agg.value,
    wholesale: null,
    nRetail: agg.n,
    nWholesale: 0,
    mileageMed: agg.mileageMed,
    confidence: agg.confidence,
    retailLowFence: null,
  };
}

export interface ValuationBreakdown {
  basis: "comps" | "market" | "baseline";
  source:
    | "comparables"
    | "third_party"
    | "historical_estimate"
    | "asking_price"
    | "baseline";
  confidence: "high" | "medium" | "low" | "none";
  sampleCount: number;
  compCount: number;
  compConfidence: "high" | "medium" | "low" | "none";
  cleanComp: number | null;
  soldCount: number;
  soldAt?: string | null;
  soldLane?: "clean" | "salvage";
  soldAnchored: boolean;
  kbbValue: number | null;
  mileageMult: number;
  titleMult: number;
  titleTag: string;
  baseline: number;
  /** Where the comp value came from: supplied feed (same-state / national) or the ask index. */
  compScope?: "state" | "national" | "index" | "none";
  compKind?: "sold" | "ask" | "none";
  /** Comps dropped because they were this listing (circularity guard). */
  compExcludedSelf?: number;
  /** ≥3 usable comps or a third-party value backed the verdict. False → verdict "not_enough_data". */
  resaleEvidence?: boolean;
}

/**
 * Engine verdict. "not_enough_data" = we can't judge the price: fewer than COMP_MIN_SAMPLES live comps
 * and no third-party market value (the resale is an offline baseline or the ask itself). It is NOT a
 * pass — "pass" is reserved for rows where the evidence is there and the deal is bad (or the price is
 * implausible). Same key the Check-any-listing read uses.
 */
export type DealVerdict = "go" | "hold" | "pass" | "not_enough_data";

/** Rows with at least this much independent resale evidence get a real go/hold/pass. */
export function hasResaleEvidence(
  sellBasis: "comps" | "market" | "baseline",
  source: ValuationBreakdown["source"],
  compCount: number,
  compConfidence: "high" | "medium" | "low" | "none" = "low",
): boolean {
  if (source === "third_party") return true; // KBB/MMR-style value attached to the listing
  return (
    (sellBasis === "comps" || source === "comparables") &&
    compCount >= COMP_MIN_SAMPLES &&
    compConfidence !== "none" // the index marks a too-dispersed bucket "none": not usable evidence
  );
}

export interface DealAnalysis extends Omit<ProfitResult, "verdict"> {
  verdict: DealVerdict;
  sellEstimate: number;
  mmrValue?: number;
  sellBasis: "comps" | "market" | "baseline";
  valuation?: ValuationBreakdown;
  recommendedMaxBid: number;
  miles: number | null;
  /** How `miles` was measured: real coords, state centroids, same state (unmeasured), or unknown. */
  distanceBasis: DistanceBasis;
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
export function analyzeDeal(
  deal: Partial<Deal>,
  opts?: {
    homeState?: string | null;
    /** Buyer home with coords / ZIP / state. Coords give a real haversine distance. */
    home?: GeoPoint | null;
    /**
     * External comp feed (see lib/scoring/comps-aggregate.ts for the row shape), pre-filtered to
     * this make/model/year band and title lane. When it yields a value it replaces the ask index.
     */
    comps?: readonly CompObservation[] | null;
  },
): DealAnalysis {
  const askPrice = deal.ask_price || 0;
  const fm = feeModel(deal.source);

  // SELL side, in order of trust:
  //  1. real retail comps from our own scraped data (lib/scoring/market-value.ts)
  //  2. a market value already attached to the deal (mmr_value, e.g. from MarketCheck/VIN)
  //  3. a source/condition markup on ask (fallback)
  // Nightly averages of our own estimates are not independent valuation evidence.
  //  The listing's own price is never its own comp (selfInclusionGuard / aggregateComps).
  const feedAgg = opts?.comps?.length
    ? aggregateComps(
        {
          id: (deal as { id?: string }).id,
          source: deal.source,
          sourceDealId: (deal as { source_deal_id?: string }).source_deal_id,
          state: deal.location_state,
        },
        opts.comps,
      )
    : null;
  const feedComps = feedAgg ? compsFromFeed(feedAgg) : null;
  // Exact leave-one-out when the listing is identifiable (deal id, or source + source_deal_id):
  // market-value removes its own row from the bucket. Only an unidentifiable listing falls back
  // to the approximate selfInclusionGuard.
  const indexRaw = feedComps
    ? null
    : lookupMarketValue(deal.make, deal.model, deal.year, deal.trim, {
        id: (deal as { id?: string }).id,
        source: deal.source,
        sourceDealId: (deal as { source_deal_id?: string }).source_deal_id,
      });
  const comps =
    feedComps ??
    (indexRaw?.selfChecked ? indexRaw : selfInclusionGuard(indexRaw, deal));
  const compExcludedSelf = feedComps
    ? (feedAgg?.excludedSelf ?? 0)
    : indexRaw?.selfChecked
      ? (indexRaw.excludedSelf ?? 0)
      : indexRaw && comps && indexRaw.nRetail !== comps.nRetail
        ? indexRaw.nRetail - comps.nRetail
        : 0;
  const hasMarket = typeof deal.mmr_value === "number" && deal.mmr_value > 0;

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
  // mmr) into the car's real value via title/damage + mileage, anchored to real completed
  // sales for the damaged/budget segment. A flooded/salvage 2023 model no longer books clean retail.
  const titleCut = titleSeverityMultiplier(deal);
  const conditionTag = titleCut.tag;
  const salvageLane = titleCut.mult < 0.95;
  const realSold = (salvageLane ? lookupSalvageSold : lookupRealSold)(
    deal.make,
    deal.model,
    deal.year,
    deal.location_state,
  );
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
  let valuationSource: ValuationBreakdown["source"] = "baseline";
  let soldAnchored = false;
  let valuationUnknown = false;
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
    valuationSource = "comparables";
    soldAnchored = compAdj.soldAnchored;
  } else if (mmrAdj && sane(mmrAdj.sell)) {
    sellEstimate = mmrAdj.sell;
    sellBasis = "market";
    valuationSource = "third_party";
    soldAnchored = mmrAdj.soldAnchored;
  } else if (baseline > 0) {
    // No trustworthy comp → realistic depreciation estimate (already title/mileage-adjusted).
    sellEstimate = baseline;
    sellBasis = "baseline";
  } else {
    // No comps, no market value, no baseline (e.g. missing year/make). We used to book ask × 1.15–1.35
    // here — a resale "value" derived from the very price being graded, i.e. invented profit. Now the
    // resale is unknown: hold it at the ask (zero gross margin), label it asking_price so no deal grade
    // is drawn from it, and say so.
    sellEstimate = askPrice;
    sellBasis = "baseline";
    valuationSource = "asking_price";
    valuationUnknown = true;
  }

  // What the evidence said BEFORE the retail ask-anchor below reshapes the number. The anchor bounds the
  // value; it does not erase the fact that we had comps or a third-party value (evidence gate).
  const evidenceBasis = sellBasis;
  const evidenceSource = valuationSource;

  // ── ASK-ANCHOR (retail listings) ──────────────────────────────────────────────────────────────────
  // A retail ASKING price is the seller's own researched market value — the strongest single signal of
  // THIS exact car's worth. Model-level comps get contaminated (a base Corvette priced off Z06s/C8s, an
  // XLT off a Raptor), so a retail listing must NEVER be valued far above its ask — that manufactures fake
  // profit and misleads the user. Only deep, high-confidence comps justify a real underpricing gap, and
  // even then it's bounded. Auction/wholesale sources are exempt: there the ask IS below retail (the whole
  // point), so retail comps above it are the legitimate arbitrage.
  //
  // The old ceiling (1.03 / 1.08 / 1.15 × ask by confidence) applied even when the value came from
  // ≥3 live same-model comps. With the ~9% selling load, a $600 tow, $490 of holding and recon on top,
  // that made a retail GO arithmetically impossible: the best retail row on hosted netted −$979 (Oct
  // 2026 diagnosis, 2,299 retail rows with ≥3 comps). Comp-backed values now get a bounded uplift that
  // grows with comp depth (RETAIL_COMP_UPLIFT); the comp value itself is still the limit, and the
  // low-fence / price-sanity gates below still reject a price that is too far under the market.
  // Without comp backing the ask still IS the value (1.03×) and the verdict is "not_enough_data".
  if (isRetailAsk(deal.source) && askPrice > 0) {
    const compBacked =
      sellBasis === "comps" &&
      !!comps &&
      Number(comps.nRetail || 0) >= COMP_MIN_SAMPLES;
    const overAsk = compBacked ? RETAIL_COMP_UPLIFT[comps!.confidence] : 1.03; // no comp backing → the ask essentially IS the value
    const askCeiling = Math.round(askPrice * overAsk);
    if (sellEstimate > askCeiling) {
      sellEstimate = askCeiling;
      if (!compBacked) {
        sellBasis = "market"; // ask-anchored (retail listing's own price is the market read)
        valuationSource = "asking_price";
      }
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
        valuationSource = "asking_price";
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

  // TRANSPORT: buyer home → listing, by haversine (lib/geo/buyer-distance). Real coords when both
  // sides have them, else state centroids. Same state without coords books the carrier minimum
  // (we no longer pretend it is 45 miles). Unknown location → conservative national default.
  const homeState = resolveHomeState(opts?.home?.state ?? opts?.homeState);
  const home: GeoPoint | null =
    opts?.home || homeState
      ? { ...(opts?.home || {}), state: homeState || null }
      : null;
  const listingGeo = deal as { lat?: number | null; lng?: number | null };
  const distance = home
    ? buyerDistance(home, {
        lat: listingGeo.lat,
        lng: listingGeo.lng,
        zip: deal.location_zip,
        state: deal.location_state,
      })
    : {
        miles: null,
        basis: "unknown" as const,
        homeState: null,
        listingState: null,
      };
  const miles = distance.miles;
  const transportCost =
    transportCostForDistance(distance, DEFAULT_TRANSPORT_COST) ??
    DEFAULT_TRANSPORT_COST;

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
    : conditionRepairBaseline(deal.condition, isRetailAsk(deal.source));

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
  let verdict: DealVerdict = result.verdict;
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

  if (valuationUnknown) {
    warnings = [
      "No market evidence for this vehicle (no comps, no market value, no year/make baseline) — resale is unknown. Profit shown assumes it resells at its ask.",
      ...warnings,
    ];
  }

  // EVIDENCE GATE (replaces the old baseline→HOLD trust gate). A go/hold/pass is a claim about resale
  // value. We only make it with independent evidence: ≥ COMP_MIN_SAMPLES live comps or a third-party
  // market value. Everything else — an offline baseline, the ask itself, thin comps — is
  // "not_enough_data", never "pass" (a pass would say "we checked and it's bad"). Implausible/bait
  // prices keep their pass: that verdict is about the listing, not the market.
  const compCountForEvidence = Number(comps?.nRetail || 0);
  const resaleEvidence = hasResaleEvidence(
    evidenceBasis,
    evidenceSource,
    compCountForEvidence,
    comps?.confidence ?? "none",
  );
  if (!resaleEvidence && !priceImplausible) {
    verdict = "not_enough_data";
    score = Math.min(score, 40);
    if (!valuationUnknown) {
      warnings = [
        compCountForEvidence > 0
          ? `Only ${compCountForEvidence} comparable listing${compCountForEvidence === 1 ? "" : "s"} for this car (need ${COMP_MIN_SAMPLES}) and no third-party value, so there isn't enough data to call it a buy or a pass. Verify the resale price yourself.`
          : "No comparable listings or third-party value for this car yet, so there isn't enough data to call it a buy or a pass. The resale shown is an estimate. Verify it before you buy.",
        ...warnings,
      ];
    }
  }

  // A current auction bid is not the buyer's final all-in cost. Keep auction inventory useful for
  // research and disciplined max-bid planning, but do not turn an in-progress bid into a BUY promise.
  // A true buy-now listing is the exception because its purchase price is known.
  const activeAuctionBid =
    AUCTION_SOURCES.has((deal.source || "").toLowerCase()) &&
    !(Number(deal.buy_now_price) > 0);
  if (activeAuctionBid) {
    if (verdict === "go") {
      verdict = "hold";
      score = Math.min(score, 84);
    }
    warnings = [
      "Current auction bid is not a final purchase price. Verify the final bid, buyer fees, title, condition, and repair scope before treating this as a buy.",
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
    distanceBasis: distance.basis,
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
      source: valuationSource,
      // Asking-price comps are a read of what sellers WANT, not what cars sold for: cap at medium.
      // A retail value bounded by its own ask still reports the comps that drove the verdict.
      confidence:
        valuationSource === "comparables" ||
        (resaleEvidence && evidenceSource === "comparables")
          ? capAskConfidence(
              comps?.confidence ?? "none",
              !(feedComps && feedAgg?.kind === "sold"),
            )
          : valuationSource === "third_party"
            ? "low"
            : "none",
      sampleCount:
        valuationSource === "comparables"
          ? Number(comps?.nRetail || 0)
          : valuationSource === "third_party" ||
              valuationSource === "asking_price"
            ? 1
            : 0,
      compCount: comps?.nRetail ?? 0,
      compConfidence: comps?.confidence ?? "none",
      cleanComp: comps?.retail ?? null,
      soldCount: realSold?.n ?? 0,
      soldAt: realSold?.soldAt ?? null,
      soldLane: salvageLane ? "salvage" : "clean",
      soldAnchored,
      kbbValue: deal.mmr_value || null,
      mileageMult: (compAdj ?? mmrAdj)?.mileageMult ?? 1,
      titleMult: (compAdj ?? mmrAdj)?.titleMult ?? 1,
      titleTag: conditionTag,
      baseline,
      compScope: feedComps
        ? (feedAgg?.scope ?? "none")
        : comps?.retail != null
          ? "index"
          : "none",
      compKind: feedComps
        ? (feedAgg?.kind ?? "none")
        : comps?.retail != null
          ? "ask"
          : "none",
      compExcludedSelf,
      resaleEvidence,
    },
  };
}
