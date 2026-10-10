// "Check any listing": the MikeHunt read on one car, as one card.
//
// Pure: no DB, no network. The route loads comps (our live asks + sold records), the timing signal
// and the listing's own price history, then calls readListing. Valuation, costs, title handling and
// confidence all come from Eva's arbitrage engine (lib/arbitrage evaluateOpportunity, which uses
// comps-aggregate, max-bid fee models, buyer-distance transport and the repair/recon baselines).
// Nothing is re-implemented here: this file only picks the sell market, solves the engine's own
// cost line for a max buy price, and words the verdict. Contract: docs/intelligence-advisor.md.
//
// Honesty rules (docs/intelligence-advisor.md): every number carries a basis; too few comps means
// "not enough data", never a guess; a listing is never its own comp; "removed" is never "sold".

import {
  evaluateOpportunity,
  type ArbitrageComp,
  type ArbitrageListing,
  type ScoredOpportunity,
} from "@/lib/arbitrage";
import { COMP_MIN_SAMPLES } from "@/lib/scoring/comps-aggregate";
import { feeModel } from "@/lib/scoring/max-bid";
import type { GeoPoint } from "@/lib/geo/buyer-distance";

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
  /** Source id for the fee model ("copart", "iaa", "craigslist", ...). */
  source?: string | null;
  /** Listing URL, so the listing is never used as its own comp. */
  url?: string | null;
  /** Our deal id when the URL matches a car we already track. */
  dealId?: string | null;
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
export type Verdict = "buy" | "wait" | "pass" | "not_enough_data";

export interface CheckListingRead {
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
  fairValue: { value: number | null; basis: Basis; state: string | null; comps: number };
  maxBuy: { value: number | null; basis: Basis; targetProfit: number | null };
  resale: { value: number | null; basis: Basis; state: string | null };
  profit: {
    net: number | null;
    basis: Basis;
    fees: number;
    transport: number;
    recon: number;
    repair: number;
    sellingCost: number | null;
  };
  confidence: { label: "high" | "medium" | "low" | "none"; score: number };
  /** Two to four short sentences: the evidence behind the verdict. */
  why: string[];
  /** Every estimate that is not measured (from the engine), for the "Why" sheet. */
  assumptions: string[];
  comps: {
    asks: number;
    sold: number;
    compKind: "sold" | "ask" | "none";
    compScope: string;
    newestAt: string | null;
  };
  trend: { pctChange: number; dataPoints: number } | null;
  priceHistory: { firstPrice: number; firstSeenAt: string; changes: number } | null;
}

/** Profit a flip should clear before we say Buy: $1,000 or 10% of resale, whichever is more. */
export function targetProfitFor(resale: number): number {
  return Math.max(1000, Math.round(resale * 0.1));
}

const money = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

const basisOf = (o: ScoredOpportunity): Basis =>
  o.spread.compKind === "sold" && o.spread.compScope !== "title_discount_fallback"
    ? "measured"
    : "estimate";

/**
 * Highest ask at which the engine's own cost line still clears `target`:
 *   net(ask) = resale − ask − (ask·feeRate + flat + titleFee) − transport − recon − repair − selling
 */
export function maxBuyFor(o: ScoredOpportunity, source: string | null | undefined, target: number) {
  const s = o.spread;
  const fm = feeModel(source);
  const resale = s.expectedResale as number;
  const fixed = s.transport + s.recon + s.repair + (s.sellingCost ?? 0) + fm.flatFee + fm.titleFee;
  return Math.max(0, Math.floor((resale - fixed - target) / (1 + fm.feeRate) / 50) * 50);
}

export function readListing(
  input: CheckListingInput,
  comps: readonly ArbitrageComp[],
  opts: {
    /** Buyer's home market, always considered as a place to sell. */
    buyerHome?: GeoPoint | null;
    timing?: TimingSignal | null;
    priceHistory?: readonly PricePoint[];
    now?: number;
  } = {},
): CheckListingRead {
  const state = input.state ? input.state.toUpperCase() : null;
  const location: GeoPoint = { zip: input.zip ?? null, state };
  const listing: ArbitrageListing = {
    id: input.dealId || input.url || input.vin || "check",
    ask: input.price,
    source: input.source ?? null,
    sourceDealId: input.dealId ?? null,
    title: input.title ?? null,
    damageType: input.damageType ?? null,
    location,
    lastSeenAt: null,
  };
  // The listing itself never counts as a comp (by id/url/source id). The engine also drops self
  // comps; this covers the URL / VIN of a car pasted from outside.
  const pool = comps.filter(
    (c) =>
      !(
        (input.dealId && c.id === input.dealId) ||
        (input.url && (c as any).url === input.url) ||
        (input.vin && (c as any).vin && String((c as any).vin).toUpperCase() === input.vin.toUpperCase())
      ),
  );
  const now = opts.now;

  // Fair value: what the comps say it's worth where it sits (its own state, else national).
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

  const vehicle = {
    year: input.year ?? null,
    make: input.make,
    model: input.model,
    trim: input.trim ?? null,
    mileage: input.mileage ?? null,
    price: input.price,
    state,
  };
  const askN = pool.filter((c) => c.kind === "ask").length;
  const soldN = pool.filter((c) => c.kind === "sold").length;
  const trend =
    opts.timing && Number.isFinite(opts.timing.pctChange)
      ? { pctChange: opts.timing.pctChange, dataPoints: opts.timing.dataPoints }
      : null;
  const history = summarizeHistory(opts.priceHistory || []);

  if (!sell) {
    const spread = "spread" in here ? here.spread : null;
    return {
      vehicle,
      verdict: "not_enough_data",
      headline: `Not enough data: fewer than ${COMP_MIN_SAMPLES} comparable cars to value this one.`,
      fairValue: { value: null, basis: "insufficient", state, comps: 0 },
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
        `We found ${askN} live asks and ${soldN} sales for this car${state ? ` around ${state}` : ""}; we need at least ${COMP_MIN_SAMPLES} to price it.`,
        "Check again after the next sweep, or widen to nearby years.",
      ],
      assumptions: "assumptions" in here ? here.assumptions : [],
      comps: { asks: askN, sold: soldN, compKind: "none", compScope: "none", newestAt: null },
      trend,
      priceHistory: history,
    };
  }

  const resale = sell.spread.expectedResale as number;
  const target = targetProfitFor(resale);
  const maxBuy = maxBuyFor(sell, input.source, target);
  const net = sell.profit;
  const conf = sell.confidence;
  const fair = fallback?.spread.expectedResale ?? null;

  let verdict: Verdict;
  if (net <= 0) verdict = "pass";
  else if (net < target) verdict = "wait";
  else if (conf.label === "low" || conf.label === "none") verdict = "wait";
  else if (trend && trend.pctChange <= -5) verdict = "wait";
  else verdict = "buy";

  const sellState = sell.comps.sellState;
  const where = sellState && sellState !== state ? ` in ${sellState}` : "";
  const headline =
    verdict === "buy"
      ? `Buy: pay up to ${money(maxBuy)}. Sells ~${money(resale)}${where}.`
      : verdict === "wait"
        ? net < target && net > 0
          ? `Wait: offer ${money(maxBuy)} or less. At ${money(input.price)} the profit is thin.`
          : trend && trend.pctChange <= -5
            ? `Wait: prices are down ${Math.abs(trend.pctChange)}% this week.`
            : "Wait: the numbers work, but comps are thin. Verify first."
        : `Pass: at ${money(input.price)} it loses ~${money(Math.abs(net))} after costs.`;

  const why: string[] = [];
  const kindWord = sell.spread.compKind === "sold" ? "recent sales" : "live asks";
  why.push(
    `Valued on ${sell.spread.compsCount} ${kindWord}${sell.comps.geoScope === "state" && sellState ? ` in ${sellState}` : " nationwide"}${sell.spread.compKind === "ask" ? " (asks less 5% to estimate a sale)" : ""}.`,
  );
  why.push(
    `After fees ${money(sell.spread.fees)}, transport ${money(sell.spread.transport)}, recon ${money(sell.spread.recon)}, repair ${money(sell.spread.repair)} and selling costs ${money(sell.spread.sellingCost ?? 0)}: ${net >= 0 ? "profit" : "loss"} ~${money(Math.abs(net))}.`,
  );
  if (trend)
    why.push(
      trend.pctChange >= 5
        ? `Prices for this model are up ${trend.pctChange}% this week (${trend.dataPoints} cars tracked).`
        : trend.pctChange <= -5
          ? `Prices for this model are down ${Math.abs(trend.pctChange)}% this week (${trend.dataPoints} cars tracked).`
          : `Prices for this model are steady this week (${trend.dataPoints} cars tracked).`,
    );
  if (history && history.changes > 0 && history.firstPrice !== input.price)
    why.push(
      input.price < history.firstPrice
        ? `This listing has dropped ${money(history.firstPrice - input.price)} since we first saw it.`
        : `This listing has gone up ${money(input.price - history.firstPrice)} since we first saw it.`,
    );
  if (why.length < 4 && sell.spread.titleCategory !== "Clean")
    why.push(
      sell.spread.titleCategory === "Unknown"
        ? "Title not stated: we valued it as clean or unknown. Confirm the title before buying."
        : `${sell.spread.titleCategory} title: compared only with ${sell.spread.compScope === "title_discount_fallback" ? "clean cars, then discounted for the brand" : `other ${sell.spread.titleCategory.toLowerCase()}-title cars`}.`,
    );

  return {
    vehicle,
    verdict,
    headline,
    fairValue: {
      value: fair,
      basis: fallback ? basisOf(fallback) : "insufficient",
      state: fallback?.comps.geoScope === "state" ? fallback.comps.sellState : null,
      comps: fallback?.spread.compsCount ?? 0,
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
      asks: askN,
      sold: soldN,
      compKind: sell.spread.compKind,
      compScope: sell.spread.compScope,
      newestAt: sell.spread.compsNewestAt,
    },
    trend,
    priceHistory: history,
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
