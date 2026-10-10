// Loads what readListing / readPersonal need from our own tables: live retail asks (last 7 days
// and live per lib/deals/freshness isLiveDeal), recorded sales (last 180 days), the model's timing
// signal (informational only, never used in the verdict) and, when the pasted URL is a car we
// already track, that row (freshness, source ids) and its price history.
//
// Uses the service-role client (lib/supabase createServerComponentClient), so RLS and column
// grants do NOT apply here: nothing from these rows reaches the browser except through the
// desk-specific reads in lib/intelligence/check-listing.ts (route: app/api/check-listing).
//
// Sold rows: once the sold_listings `basis` migration lands (separate PR), the sold query below
// filters basis = 'sold' so removed-listing events never count as sales.

import { COMP_MIN_SAMPLES } from "@/lib/scoring/comps-aggregate";
import type { ArbitrageComp } from "@/lib/arbitrage";
import { eligibleAskingPrices } from "@/lib/ai/asking-price-context";
import { isLiveDeal } from "@/lib/deals/freshness";
import {
  ASK_COMP_WINDOW_DAYS,
  SOLD_COMP_WINDOW_DAYS,
  isSameVehicleOrListing,
} from "@/lib/deal-check/market-comps";
import { soldTitleLane } from "@/lib/scoring/market-value";
import type {
  CheckListingInput,
  CheckListingSelf,
  PricePoint,
  TimingSignal,
} from "./check-listing";

const like = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/** Comps must be within this many miles of the car when its mileage is known. */
export const COMP_MILEAGE_BAND = 25_000;

export interface CheckListingData {
  comps: ArbitrageComp[];
  timing: TimingSignal | null;
  priceHistory: PricePoint[];
  dealId: string | null;
  /** The tracked deals row for the pasted URL, when there is one. */
  self: CheckListingSelf | null;
  /** Model / trim / mileage matching applied to the comp pool. */
  matching: CompMatchInfo;
}

export interface CompMatchInfo {
  trimMatched: boolean;
  mileageBand: number | null;
  droppedModel: number;
  droppedMileage: number;
}

/** "F-150 XLT" → ["f150", "xlt"]: lower-case, punctuation dropped inside a word. */
export function modelTokens(model?: string | null): string[] {
  return String(model || "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
}

const isPrefix = (a: string[], b: string[]) =>
  a.length > 0 && a.length <= b.length && a.every((t, i) => t === b[i]);

/**
 * Same model, compared on the normalized model name rather than its first word: "Model S" no
 * longer matches "Model 3", while "Civic" still matches a sold row stored as "Civic EX" (eBay
 * sold rows keep the trim in `model`) and vice versa.
 */
export function sameModel(
  target?: string | null,
  comp?: string | null,
): boolean {
  const t = modelTokens(target);
  const c = modelTokens(comp);
  return isPrefix(t, c) || isPrefix(c, t);
}

/** The comp's trim words: its `trim`, else whatever its model name carries past the target's. */
function compTrimTokens(
  targetModel: string,
  c: { model?: unknown; trim?: unknown },
): string[] {
  const own = modelTokens(String(c.trim || ""));
  if (own.length) return own;
  const t = modelTokens(targetModel);
  const m = modelTokens(String(c.model || ""));
  return isPrefix(t, m) ? m.slice(t.length) : [];
}

/**
 * Like-for-like comp pool (pure):
 *  • normalized model match (sameModel);
 *  • when the car's trim is known and >= COMP_MIN_SAMPLES comps share it, only those;
 *  • when its mileage is known, only comps within ±COMP_MILEAGE_BAND miles (comps with no
 *    mileage are left out then: their mileage could be anything).
 */
export function matchComps<T extends ArbitrageComp>(
  comps: readonly T[],
  input: Pick<CheckListingInput, "model" | "trim" | "mileage">,
): { comps: T[]; info: CompMatchInfo } {
  const byModel = comps.filter((c) => sameModel(input.model, (c as any).model));
  let pool: T[] = byModel;
  let trimMatched = false;
  const trim = modelTokens(input.trim);
  if (trim.length) {
    const sameTrim = byModel.filter(
      (c) => compTrimTokens(input.model, c as any)[0] === trim[0],
    );
    if (sameTrim.length >= COMP_MIN_SAMPLES) {
      pool = sameTrim;
      trimMatched = true;
    }
  }
  const miles = Number(input.mileage);
  const band = Number.isFinite(miles) && miles > 0 ? COMP_MILEAGE_BAND : null;
  const banded =
    band == null
      ? pool
      : pool.filter((c) => {
          const m = Number(c.mileage);
          return Number.isFinite(m) && m > 0 && Math.abs(m - miles) <= band;
        });
  return {
    comps: banded,
    info: {
      trimMatched,
      mileageBand: band,
      droppedModel: comps.length - byModel.length,
      droppedMileage: pool.length - banded.length,
    },
  };
}

/** eBay item id from a listing URL (…/itm/<id> or …/itm/<slug>/<id>), else null. */
export function ebayItemId(url?: string | null): string | null {
  try {
    const u = new URL(String(url || ""));
    if (!/(^|\.)ebay\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})(?:[/?]|$)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Title of a sold row, from its listing headline (sold_listings.title is the source's headline,
 * not a title document). Uses market-value's soldTitleLane so the two never disagree: only an
 * explicit "clean title" is Clean; brand words are branded; everything else stays Unknown.
 */
export function soldTitleCondition(headline?: string | null): string | null {
  const lane = soldTitleLane(headline);
  const text = String(headline || "");
  if (lane === "salvage") {
    if (/\brebuil(?:t|d)\b/i.test(text)) return "rebuilt_title";
    if (/\b(repairable|rebuildable)\b/i.test(text)) return "repairable";
    return "salvage_title";
  }
  return lane === "clean" ? "clean_title" : null;
}

export async function loadCheckListingData(
  supabase: any,
  input: CheckListingInput,
  now = Date.now(),
  /** The tracked row when the caller already loaded it (dealId requests): skips the lookup. */
  preloadedSelf: CheckListingSelf | null = null,
): Promise<CheckListingData> {
  const make = like(input.make.trim());
  // Broad DB prefilter on the first word; sameModel() does the real match below.
  const modelWord = like(input.model.trim().split(/\s+/)[0] || input.model);
  const year = Number(input.year) || 0;

  let asksQ = supabase
    .from("deals")
    .select(
      "id, year, make, model, trim, mileage, ask_price, source, source_deal_id, source_url, vin, location_state, last_seen_at, condition, damage_type, title, auction_end_at",
    )
    .eq("active", true)
    .ilike("make", make)
    .ilike("model", `${modelWord}%`)
    .gt("ask_price", 0)
    .gte(
      "last_seen_at",
      new Date(now - ASK_COMP_WINDOW_DAYS * 86_400_000).toISOString(),
    )
    .limit(1000);
  if (year) asksQ = asksQ.gte("year", year - 1).lte("year", year + 1);

  let soldQ = supabase
    .from("sold_listings")
    .select(
      "year, make, model, trim, mileage, sold_price, sold_at, title, source, source_item_id, source_url, vin, location_state",
    )
    .ilike("make", make)
    .ilike("model", `${modelWord}%`)
    .eq("currency_code", "USD")
    .eq("country_code", "US")
    .gt("sold_price", 0)
    .gte(
      "sold_at",
      new Date(now - SOLD_COMP_WINDOW_DAYS * 86_400_000).toISOString(),
    )
    .lte("sold_at", new Date(now).toISOString())
    .limit(500);
  if (year) soldQ = soldQ.gte("year", year - 1).lte("year", year + 1);

  const timingQ = supabase
    .from("market_timing_signals")
    .select("pct_change, data_points")
    .ilike("make", make)
    .ilike("model", like(input.model.trim()))
    .limit(1);

  const [asks, sold, timing] = await Promise.all([
    asksQ.then(
      (r: any) => (r.error ? [] : r.data || []),
      () => [],
    ),
    soldQ.then(
      (r: any) => (r.error ? [] : r.data || []),
      () => [],
    ),
    timingQ.then(
      (r: any) => (r.error ? [] : r.data || []),
      () => [],
    ),
  ]);

  // The pasted car, if we already track it: never a comp, its freshness decides "live", and its
  // price history is evidence. Matched by normalized URL (market-comps normUrl) or VIN.
  const target = { vin: input.vin ?? null, url: input.url ?? null };
  let selfRow: any = preloadedSelf
    ? {
        id: preloadedSelf.id,
        source: preloadedSelf.source,
        source_deal_id: preloadedSelf.sourceDealId,
        source_url: preloadedSelf.sourceUrl,
        last_seen_at: preloadedSelf.lastSeenAt,
        auction_end_at: preloadedSelf.auctionEndAt,
      }
    : input.url || input.vin
      ? ((asks as any[]).find((d) => isSameVehicleOrListing(d, target)) ?? null)
      : null;
  if (!selfRow && input.dealId)
    selfRow = (asks as any[]).find((d) => d.id === input.dealId) ?? null;
  if (!selfRow && (input.url || input.dealId)) {
    let q = supabase
      .from("deals")
      .select(
        "id, source, source_deal_id, source_url, last_seen_at, auction_end_at",
      );
    q = input.dealId ? q.eq("id", input.dealId) : q.eq("source_url", input.url);
    const r = await q.limit(1).then(
      (x: any) => x,
      () => ({ data: null }),
    );
    selfRow = r?.data?.[0] ?? null;
  }
  const self: CheckListingSelf | null = selfRow
    ? {
        id: String(selfRow.id),
        source: selfRow.source ?? null,
        sourceDealId: selfRow.source_deal_id ?? null,
        sourceUrl: selfRow.source_url ?? null,
        lastSeenAt: selfRow.last_seen_at ?? null,
        auctionEndAt: selfRow.auction_end_at ?? null,
      }
    : null;
  const dealId = self?.id ?? input.dealId ?? null;

  let priceHistory: PricePoint[] = [];
  if (dealId) {
    const r = await supabase
      .from("price_history")
      .select("price, observed_at")
      .eq("deal_id", dealId)
      .order("observed_at", { ascending: true })
      .limit(100)
      .then(
        (x: any) => x,
        () => ({ data: null }),
      );
    priceHistory = (r?.data || []).map((p: any) => ({
      price: Number(p.price),
      observedAt: p.observed_at,
    }));
  }

  // Asks: retail channels only (no auction bids) AND live right now (not stale, frozen or ended).
  const liveAsks = eligibleAskingPrices(asks as any[]).filter((d: any) =>
    isLiveDeal(d, now),
  );
  const askComps: ArbitrageComp[] = liveAsks.map((d: any) => ({
    id: d.id,
    price: Number(d.ask_price),
    kind: "ask",
    state: d.location_state ?? null,
    year: d.year ?? null,
    mileage: d.mileage ?? null,
    observedAt: d.last_seen_at ?? null,
    source: d.source ?? null,
    sourceDealId: d.source_deal_id ?? null,
    title: d.condition ?? null,
    // Extra keys: self check (url / vin) and model / trim matching.
    ...({
      url: d.source_url ?? null,
      vin: d.vin ?? null,
      model: d.model,
      trim: d.trim ?? null,
    } as object),
  }));
  const soldComps: ArbitrageComp[] = (sold as any[]).map((s, i) => ({
    id: `sold:${s.source_item_id || s.source_url || i}`,
    price: Number(s.sold_price),
    kind: "sold",
    state: s.location_state ?? null,
    year: s.year ?? null,
    mileage: s.mileage ?? null,
    observedAt: s.sold_at ?? null,
    source: s.source || "ebay_motors",
    sourceDealId: s.source_item_id ?? null,
    title: soldTitleCondition(s.title),
    ...({
      url: s.source_url ?? null,
      vin: s.vin ?? null,
      model: s.model,
      trim: s.trim ?? null,
    } as object),
  }));

  const matched = matchComps([...askComps, ...soldComps], input);
  const t = timing[0];
  return {
    comps: matched.comps,
    timing:
      t && Number.isFinite(Number(t.pct_change))
        ? {
            pctChange: Number(t.pct_change),
            dataPoints: Number(t.data_points) || 0,
          }
        : null,
    priceHistory,
    dealId,
    self,
    matching: matched.info,
  };
}
