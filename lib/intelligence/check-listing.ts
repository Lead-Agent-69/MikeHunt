// "Check any listing": the MikeHunt read on one car, as one card.
//
// Pure: no DB, no network. The route loads comps (our live asks + sold records), the listing's own
// tracked row and price history, then calls readListing (flip desk) or readPersonal (everyone
// else). Contract: docs/intelligence-advisor.md.
//
//  • Flip desk (readListing): dealer resale, costs, title handling and confidence all come from
//    Eva's arbitrage engine (lib/arbitrage evaluateOpportunity: comps-aggregate, max-bid fee
//    models, buyer-distance transport, repair/recon baselines). This file only picks the sell
//    market, asks the engine for the max buy (maxAskForNet) and words the verdict.
//  • Personal desk (readPersonal): retail fair value where the car sits
//    (lib/intelligence/retail-fair-value: sold retail comps, else live retail asks with no
//    haircut). Nothing from the flip evaluation (sell market, resale, profit, its confidence or
//    evidence) is computed into, or leaks onto, this card.
//
// Honesty rules: every number carries a basis; too few comps means "not enough data", never a
// guess; a listing is never its own comp; a listing that is not live says so; the model-wide
// timing signal is informational only and never changes the verdict.

import {
  evaluateOpportunity,
  maxAskForNet,
  type ArbitrageComp,
  type ArbitrageListing,
  type ScoredOpportunity,
} from "@/lib/arbitrage";
import { COMP_MIN_SAMPLES, isSelfComp } from "@/lib/scoring/comps-aggregate";
import type { GeoPoint } from "@/lib/geo/buyer-distance";
import { dealFreshness, type FreshnessState } from "@/lib/deals/freshness";
import { isSameVehicleOrListing } from "@/lib/deal-check/market-comps";
import {
  retailFairValue,
  retailVerdict,
  type PriceRating,
  type RetailFairValue,
} from "./retail-fair-value";

export interface CheckListingInput {
  year?: number | null;
  make: string;
  model: string;
  trim?: string | null;
  mileage?: number | null;
  /** Asking price / current bid, USD. */
  price: number;
  zip?: string | null;
  /** Two-letter state where the car is. */
  state?: string | null;
  /** Title / condition text ("salvage", "rebuilt", "clean"). */
  title?: string | null;
  damageType?: string | null;
  vin?: string | null;
  /** Source id for the fee model ("copart", "iaa", "craigslist", "ebay_motors", ...). */
  source?: string | null;
  /** The channel's own listing id (e.g. the eBay item id from the URL), for self-exclusion. */
  sourceDealId?: string | null;
  /** Listing URL, so the listing is never used as its own comp. */
  url?: string | null;
  /** Our deal id when the URL matches a car we already track. */
  dealId?: string | null;
}

/** The tracked deals row for the pasted URL (lib/intelligence/check-listing-data). */
export interface CheckListingSelf {
  id: string;
  source: string | null;
  sourceDealId: string | null;
  sourceUrl: string | null;
  lastSeenAt: string | null;
  auctionEndAt: string | null;
}

export interface TimingSignal {
  /** % change of the average ask, last 7 days vs the 23 days before (market_timing_signals). */
  pctChange: number;
  dataPoints: number;
}

export interface PricePoint {
  price: number;
  observedAt: string;
}

export type Basis = "measured" | "estimate" | "insufficient";
export type Verdict = "buy" | "wait" | "pass" | "not_enough_data" | "not_live";

export interface CheckListingRead {
  desk: "flip" | "personal";
  vehicle: {
    year: number | null;
    make: string;
    model: string;
    trim: string | null;
    mileage: number | null;
    price: number;
    state: string | null;
  };
  verdict: Verdict;
  /** One plain sentence under the verdict. */
  headline: string;
  /** Is the listing itself live? "unknown" for typed-in details. */
  live: { state: FreshnessState | "unknown"; label: string };
  fairValue: {
    value: number | null;
    basis: Basis;
    state: string | null;
    comps: number;
    /** Buyer-facing basis line ("Typical selling price · 7 recent sales in IL"). */
    label: string | null;
    kind: "sold" | "ask" | "none";
    /** 25th–75th percentile of the comps behind the value (personal desk). */
    range: { p25: number; p75: number } | null;
  };
  /** Personal desk: good / fair / negotiate / over. Null on the flip desk. */
  priceRating: PriceRating | null;
  maxBuy: { value: number | null; basis: Basis; targetProfit: number | null };
  resale: { value: number | null; basis: Basis; state: string | null };
  /** Flip desk only; null on the personal desk. */
  profit: {
    net: number | null;
    basis: Basis;
    fees: number;
    transport: number;
    recon: number;
    repair: number;
    sellingCost: number | null;
  } | null;
  confidence: { label: "high" | "medium" | "low" | "none"; score: number | null };
  /** Two to four short sentences: the evidence behind the verdict. */
  why: string[];
  /** Every estimate that is not measured, for the "Why" sheet. */
  assumptions: string[];
  comps: {
    asks: number;
    sold: number;
    compKind: "sold" | "ask" | "none";
    compScope: string;
    newestAt: string | null;
  };
  /** Model-wide trend (all years and trims). Informational only: never changes the verdict. */
  trend: { pctChange: number; dataPoints: number; usedInVerdict: false } | null;
  priceHistory: { firstPrice: number; firstSeenAt: string; changes: number } | null;
}

export interface ReadOptions {
  /** Buyer's home market, always considered as a place to sell (flip desk). */
  buyerHome?: GeoPoint | null;
  timing?: TimingSignal | null;
  priceHistory?: readonly PricePoint[];
  /** Our tracked row for this listing, when there is one: decides "live" and self ids. */
  self?: CheckListingSelf | null;
  /** True when the listing page was fetched just now (its last-seen time is now). */
  fetchedNow?: boolean;
  now?: number;
}

/** Profit a flip should clear before we say Buy: $1,000 or 10% of resale, whichever is more. */
export function targetProfitFor(resale: number): number {
  return Math.max(1000, Math.round(resale * 0.1));
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const basisOf = (o: ScoredOpportunity): Basis =>
  o.spread.compKind === "sold" && o.spread.compScope !== "title_discount_fallback"
    ? "measured"
    : "estimate";

/** Highest ask at which the engine's own cost line still clears `target` (lib/arbitrage). */
export function maxBuyFor(o: ScoredOpportunity, source: string | null | undefined, target: number) {
  return maxAskForNet(o.spread, source, target) ?? 0;
}

interface Prepared {
  state: string | null;
  location: GeoPoint;
  listing: ArbitrageListing;
  pool: ArbitrageComp[];
  now: number;
  live: CheckListingRead["live"];
  vehicle: CheckListingRead["vehicle"];
  askN: number;
  soldN: number;
  trend: CheckListingRead["trend"];
  history: CheckListingRead["priceHistory"];
}

function prepare(
  input: CheckListingInput,
  comps: readonly ArbitrageComp[],
  opts: ReadOptions,
): Prepared {
  const now = opts.now ?? Date.now();
  const state = input.state ? input.state.toUpperCase() : null;
  const location: GeoPoint = { zip: input.zip ?? null, state };
  const self = opts.self ?? null;

  // Freshness of the listing itself: our tracked row when we have one, else "just fetched".
  let live: CheckListingRead["live"] = { state: "unknown", label: "" };
  let lastSeenAt: string | null = null;
  if (self) {
    const f = dealFreshness(
      {
        source: self.source,
        source_url: self.sourceUrl,
        last_seen_at: self.lastSeenAt,
        auction_end_at: self.auctionEndAt,
      },
      now,
    );
    // A row we track keeps its own freshness, even when its page was just read: a frozen
    // (terms-gated, not refreshed) or ended listing is not called live.
    live = { state: f.state, label: f.label };
    lastSeenAt = self.lastSeenAt;
  } else if (opts.fetchedNow) {
    live = { state: "live", label: "" };
    lastSeenAt = new Date(now).toISOString();
  }

  const listing: ArbitrageListing = {
    id: self?.id || input.dealId || input.url || input.vin || "check",
    ask: input.price,
    source: self?.source ?? input.source ?? null,
    sourceDealId: self?.sourceDealId ?? input.sourceDealId ?? null,
    title: input.title ?? null,
    damageType: input.damageType ?? null,
    location,
    lastSeenAt,
  };
  // The listing itself never counts as a comp: by deal id, by id or source + source id
  // (comps-aggregate isSelfComp, e.g. ebay_motors + item id), and by normalized URL / VIN
  // (market-comps isSameVehicleOrListing). The engine re-checks id / source ids.
  const target = { vin: input.vin ?? null, url: input.url ?? self?.sourceUrl ?? null };
  const ids = new Set([self?.id, input.dealId].filter(Boolean) as string[]);
  const selfIds = { id: listing.id, source: listing.source, sourceDealId: listing.sourceDealId };
  const pool = comps.filter((c) => {
    if (c.id && ids.has(c.id)) return false;
    if (isSelfComp(c, selfIds)) return false;
    const extra = c as ArbitrageComp & { url?: string | null; vin?: string | null };
    return !isSameVehicleOrListing({ vin: extra.vin ?? null, source_url: extra.url ?? null }, target);
  });

  return {
    state,
    location,
    listing,
    pool,
    now,
    live,
    vehicle: {
      year: input.year ?? null,
      make: input.make,
      model: input.model,
      trim: input.trim ?? null,
      mileage: input.mileage ?? null,
      price: input.price,
      state,
    },
    askN: pool.filter((c) => c.kind === "ask").length,
    soldN: pool.filter((c) => c.kind === "sold").length,
    trend:
      opts.timing && Number.isFinite(opts.timing.pctChange)
        ? { pctChange: opts.timing.pctChange, dataPoints: opts.timing.dataPoints, usedInVerdict: false }
        : null,
    history: summarizeHistory(opts.priceHistory || []),
  };
}

const notLiveHeadline = (live: CheckListingRead["live"]) =>
  `Not live: ${live.label || "this listing is no longer current"}. The price may not be buyable.`;
/** Frozen (terms-gated, not refreshed) or ended listings are not buyable at the shown price.
 *  "stale" only lowers confidence through the engine's last-seen penalty. */
const isNotLive = (live: CheckListingRead["live"]) =>
  live.state === "frozen" || live.state === "ended";

function historyLine(history: CheckListingRead["priceHistory"], price: number): string | null {
  if (!history || history.changes <= 0 || history.firstPrice === price) return null;
  return price < history.firstPrice
    ? `This listing has dropped ${money(history.firstPrice - price)} since we first saw it.`
    : `This listing has gone up ${money(price - history.firstPrice)} since we first saw it.`;
}

/** Flip desk: dealer resale, profit, max buy and where to sell, all from the engine. */
export function readListing(
  input: CheckListingInput,
  comps: readonly ArbitrageComp[],
  opts: ReadOptions = {},
): CheckListingRead {
  const p = prepare(input, comps, opts);
  const { listing, pool, location, state, now } = p;

  // Dealer resale where the car sits (its own state, else national).
  const here = evaluateOpportunity(listing, pool, { sellMarket: location, now });

  // Where to sell: every state with enough same-state comps, plus the buyer's home.
  const counts = new Map<string, number>();
  for (const c of pool) {
    const st = String(c.state || "").toUpperCase();
    if (/^[A-Z]{2}$/.test(st)) counts.set(st, (counts.get(st) || 0) + 1);
  }
  const markets = new Set<string>(
    Array.from(counts)
      .filter(([, n]) => n >= COMP_MIN_SAMPLES)
      .map(([s]) => s),
  );
  const home = opts.buyerHome?.state ? String(opts.buyerHome.state).toUpperCase() : null;
  let best: ScoredOpportunity | null = null;
  for (const st of Array.from(markets).concat(home ? [home] : [])) {
    const o = evaluateOpportunity(listing, pool, {
      sellMarket: st === home && opts.buyerHome ? opts.buyerHome : { state: st },
      now,
    });
    if (!("status" in o) || o.status !== "scored") continue;
    // A market only counts as "sell in X" when X's own comps priced it.
    if (o.comps.geoScope !== "state" && st !== home) continue;
    if (!best || o.profit > best.profit) best = o;
  }
  const fallback = "status" in here && here.status === "scored" ? here : null;
  const sell = best ?? fallback;
  const base = {
    desk: "flip" as const,
    vehicle: p.vehicle,
    live: p.live,
    priceRating: null,
    trend: p.trend,
    priceHistory: p.history,
  };

  if (!sell) {
    const spread = "spread" in here ? here.spread : null;
    return {
      ...base,
      verdict: isNotLive(p.live) ? "not_live" : "not_enough_data",
      headline: isNotLive(p.live)
        ? notLiveHeadline(p.live)
        : `Not enough data: fewer than ${COMP_MIN_SAMPLES} comparable cars to value this one.`,
      fairValue: { value: null, basis: "insufficient", state, comps: 0, label: null, kind: "none", range: null },
      maxBuy: { value: null, basis: "insufficient", targetProfit: null },
      resale: { value: null, basis: "insufficient", state: null },
      profit: {
        net: null,
        basis: "insufficient",
        fees: spread?.fees ?? 0,
        transport: spread?.transport ?? 0,
        recon: spread?.recon ?? 0,
        repair: spread?.repair ?? 0,
        sellingCost: null,
      },
      confidence: { label: "none", score: 0 },
      why: [
        `We found ${p.askN} live asks and ${p.soldN} sales for this car${state ? ` around ${state}` : ""}; we need at least ${COMP_MIN_SAMPLES} to price it.`,
        "Check again after the next sweep, or widen to nearby years.",
      ],
      assumptions: "assumptions" in here ? here.assumptions : [],
      comps: { asks: p.askN, sold: p.soldN, compKind: "none", compScope: "none", newestAt: null },
    };
  }

  const resale = sell.spread.expectedResale as number;
  const target = targetProfitFor(resale);
  const maxBuy = maxBuyFor(sell, listing.source, target);
  const net = sell.profit;
  const conf = sell.confidence;
  const unknownTitle = sell.spread.titleCategory === "Unknown";

  // The timing signal is a model-wide listing-mix average; it never changes the verdict.
  let verdict: Verdict;
  if (isNotLive(p.live)) verdict = "not_live";
  else if (net <= 0) verdict = "pass";
  else if (net < target) verdict = "wait";
  else if (conf.label === "low" || conf.label === "none") verdict = "wait";
  else verdict = "buy";

  const sellState = sell.comps.sellState;
  const where = sellState && sellState !== state ? ` in ${sellState}` : "";
  const headline =
    verdict === "not_live"
      ? notLiveHeadline(p.live)
      : verdict === "buy"
        ? `Buy: pay up to ${money(maxBuy)}. Sells ~${money(resale)}${where}.`
        : verdict === "wait"
          ? net < target && net > 0
            ? `Wait: offer ${money(maxBuy)} or less. At ${money(input.price)} the profit is thin.`
            : unknownTitle
              ? "Wait: the numbers work, but the title is not stated. Confirm it before buying."
              : "Wait: the numbers work, but confidence is low. Verify first."
          : `Pass: at ${money(input.price)} it loses ~${money(Math.abs(net))} after costs.`;

  const why: string[] = [];
  const kindWord = sell.spread.compKind === "sold" ? "recent sales" : "live asks";
  why.push(
    `Valued on ${sell.spread.compsCount} ${kindWord}${sell.comps.geoScope === "state" && sellState ? ` in ${sellState}` : " nationwide"}${sell.spread.compKind === "ask" ? " (asks less 5% to estimate a sale)" : ""}.`,
  );
  why.push(
    `After fees ${money(sell.spread.fees)}, transport ${money(sell.spread.transport)}, recon ${money(sell.spread.recon)}, repair ${money(sell.spread.repair)} and selling costs ${money(sell.spread.sellingCost ?? 0)}: ${net >= 0 ? "profit" : "loss"} ~${money(Math.abs(net))}.`,
  );
  const hist = historyLine(p.history, input.price);
  if (hist) why.push(hist);
  if (why.length < 4 && sell.spread.titleCategory !== "Clean")
    why.push(
      unknownTitle
        ? "Title not stated: we valued it as clean or unknown. Confirm the title before buying."
        : `${sell.spread.titleCategory} title: compared only with ${sell.spread.compScope === "title_discount_fallback" ? "clean cars, then discounted for the brand" : `other ${sell.spread.titleCategory.toLowerCase()}-title cars`}.`,
    );
  if (why.length < 4 && isNotLive(p.live)) why.push(notLiveHeadline(p.live));

  return {
    ...base,
    verdict,
    headline,
    fairValue: {
      value: fallback?.spread.expectedResale ?? null,
      basis: fallback ? basisOf(fallback) : "insufficient",
      state: fallback?.comps.geoScope === "state" ? fallback.comps.sellState : null,
      comps: fallback?.spread.compsCount ?? 0,
      label: fallback
        ? `Dealer resale · ${fallback.spread.compsCount} ${fallback.spread.compKind === "sold" ? "recent sales" : "live asks less 5%"}`
        : null,
      kind: fallback ? (fallback.spread.compKind as "sold" | "ask") : "none",
      range: null,
    },
    maxBuy: { value: maxBuy, basis: basisOf(sell), targetProfit: target },
    resale: { value: resale, basis: basisOf(sell), state: sellState },
    profit: {
      net,
      basis: basisOf(sell),
      fees: sell.spread.fees,
      transport: sell.spread.transport,
      recon: sell.spread.recon,
      repair: sell.spread.repair,
      sellingCost: sell.spread.sellingCost,
    },
    confidence: { label: conf.label, score: conf.score },
    why: why.slice(0, 4),
    assumptions: sell.assumptions,
    comps: {
      asks: p.askN,
      sold: p.soldN,
      compKind: sell.spread.compKind,
      compScope: sell.spread.compScope,
      newestAt: sell.spread.compsNewestAt,
    },
  };
}

function retailAssumptions(fv: RetailFairValue, mileage: number | null): string[] {
  const out: string[] = [];
  if (fv.basis === "sold")
    out.push("Retail basis: completed sales to retail buyers (auction and wholesale sales left out).");
  else if (fv.basis === "ask")
    out.push(
      "Retail basis: live retail asking prices with no discount. No recent sales on file, so this is what sellers ask, not what cars sell for.",
    );
  if (mileage) out.push("Compared only with cars within 25,000 miles of this one.");
  if (fv.titleCategory === "Unknown")
    out.push("Listing title not stated: compared with clean and unknown-title cars.");
  return out;
}

/**
 * Personal desk: what this car is worth to someone buying it to drive, where it sits. Only the
 * at-location retail valuation is used: no sell market, resale, profit or flip evidence.
 */
export function readPersonal(
  input: CheckListingInput,
  comps: readonly ArbitrageComp[],
  opts: ReadOptions = {},
): CheckListingRead {
  const p = prepare(input, comps, opts);
  const fv = retailFairValue(
    {
      id: p.listing.id,
      source: p.listing.source,
      sourceDealId: p.listing.sourceDealId,
      state: p.state,
      mileage: input.mileage ?? null,
      title: input.title ?? null,
    },
    p.pool,
    { now: p.now },
  );
  const rv = retailVerdict(input.price, fv);
  const notLive = isNotLive(p.live);
  const verdict: Verdict = notLive ? "not_live" : rv.verdict;
  const headline = notLive ? notLiveHeadline(p.live) : rv.headline;

  const why: string[] = [];
  if (fv.value != null && fv.label) {
    why.push(`${fv.label}.`);
    if (fv.range)
      why.push(`The middle half of those cars are ${money(fv.range.p25)} to ${money(fv.range.p75)}.`);
  } else {
    why.push(
      `We found ${p.askN} live asks and ${p.soldN} sales for this car${p.state ? ` around ${p.state}` : ""}; after matching title and miles we need at least ${COMP_MIN_SAMPLES} to price it.`,
    );
  }
  const hist = historyLine(p.history, input.price);
  if (hist) why.push(hist);
  if (fv.titleCategory !== "Clean")
    why.push(
      fv.titleCategory === "Unknown"
        ? "Title not stated: compared with clean or unknown-title cars. Confirm the title before buying."
        : `${fv.titleCategory} title: compared only with other ${fv.titleCategory.toLowerCase()}-title cars.`,
    );
  if (notLive) why.push(notLiveHeadline(p.live));

  return {
    desk: "personal",
    vehicle: p.vehicle,
    verdict,
    headline,
    live: p.live,
    fairValue: {
      value: fv.value,
      basis: fv.basis === "sold" ? "measured" : fv.basis === "ask" ? "estimate" : "insufficient",
      state: fv.state,
      comps: fv.n,
      label: fv.label,
      kind: fv.basis,
      range: fv.range,
    },
    priceRating: notLive ? null : rv.rating,
    maxBuy: {
      value: fv.value == null ? null : Math.floor(fv.value / 50) * 50,
      basis: fv.basis === "sold" ? "measured" : fv.basis === "ask" ? "estimate" : "insufficient",
      targetProfit: null,
    },
    resale: { value: null, basis: "insufficient", state: null },
    profit: null,
    confidence: { label: fv.confidence.label, score: null },
    why: why.slice(0, 4),
    assumptions: retailAssumptions(fv, input.mileage ?? null),
    comps: {
      asks: p.askN,
      sold: p.soldN,
      compKind: fv.basis,
      compScope: fv.scope === "state" ? "same_state" : fv.scope,
      newestAt: fv.newestAt,
    },
    trend: p.trend,
    priceHistory: p.history,
  };
}

function summarizeHistory(points: readonly PricePoint[]) {
  const rows = points
    .filter((p) => Number(p.price) > 0 && p.observedAt)
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  if (!rows.length) return null;
  let changes = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].price !== rows[i - 1].price) changes++;
  return { firstPrice: rows[0].price, firstSeenAt: rows[0].observedAt, changes };
}
