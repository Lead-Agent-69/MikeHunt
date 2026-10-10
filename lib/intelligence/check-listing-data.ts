// Loads what readListing needs from our own tables: live asks (retail channels only, last 7 days),
// recorded sales (last 180 days), the model's timing signal and, when the pasted URL is a car we
// already track, its own price history. Read-only; RLS applies (anon/public reads).

import type { ArbitrageComp } from "@/lib/arbitrage";
import { eligibleAskingPrices } from "@/lib/ai/asking-price-context";
import {
  ASK_COMP_WINDOW_DAYS,
  SOLD_COMP_WINDOW_DAYS,
} from "@/lib/deal-check/market-comps";
import type {
  CheckListingInput,
  CheckListingRead,
  PricePoint,
  TimingSignal,
} from "./check-listing";

const like = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export interface CheckListingData {
  comps: ArbitrageComp[];
  timing: TimingSignal | null;
  priceHistory: PricePoint[];
  dealId: string | null;
}

export async function loadCheckListingData(
  supabase: any,
  input: CheckListingInput,
  now = Date.now(),
): Promise<CheckListingData> {
  const make = like(input.make.trim());
  const modelWord = like(input.model.trim().split(/\s+/)[0] || input.model);
  const year = Number(input.year) || 0;

  let asksQ = supabase
    .from("deals")
    .select(
      "id, year, make, model, mileage, ask_price, source, source_deal_id, source_url, vin, location_state, last_seen_at, condition, damage_type, title, auction_end_at",
    )
    .eq("active", true)
    .ilike("make", make)
    .ilike("model", `${modelWord}%`)
    .gt("ask_price", 0)
    .gte("last_seen_at", new Date(now - ASK_COMP_WINDOW_DAYS * 86_400_000).toISOString())
    .limit(500);
  if (year) asksQ = asksQ.gte("year", year - 1).lte("year", year + 1);

  let soldQ = supabase
    .from("sold_listings")
    .select("year, make, model, mileage, sold_price, sold_at, title, source, source_url")
    .ilike("make", make)
    .ilike("model", `${modelWord}%`)
    .eq("currency_code", "USD")
    .eq("country_code", "US")
    .gt("sold_price", 0)
    .gte("sold_at", new Date(now - SOLD_COMP_WINDOW_DAYS * 86_400_000).toISOString())
    .lte("sold_at", new Date(now).toISOString())
    .limit(200);
  if (year) soldQ = soldQ.gte("year", year - 1).lte("year", year + 1);

  const timingQ = supabase
    .from("market_timing_signals")
    .select("pct_change, data_points")
    .ilike("make", make)
    .ilike("model", like(input.model.trim()))
    .limit(1);

  const [asks, sold, timing] = await Promise.all([
    asksQ.then((r: any) => (r.error ? [] : r.data || []), () => []),
    soldQ.then((r: any) => (r.error ? [] : r.data || []), () => []),
    timingQ.then((r: any) => (r.error ? [] : r.data || []), () => []),
  ]);

  // The pasted car, if we already track it: never a comp, and its price history is evidence.
  const self = input.url
    ? asks.find((d: any) => d.source_url && d.source_url === input.url) ?? null
    : null;
  let dealId: string | null = self?.id ?? input.dealId ?? null;
  if (!dealId && input.url) {
    const r = await supabase
      .from("deals")
      .select("id")
      .eq("source_url", input.url)
      .limit(1)
      .then((x: any) => x, () => ({ data: null }));
    dealId = r?.data?.[0]?.id ?? null;
  }
  let priceHistory: PricePoint[] = [];
  if (dealId) {
    const r = await supabase
      .from("price_history")
      .select("price, observed_at")
      .eq("deal_id", dealId)
      .order("observed_at", { ascending: true })
      .limit(100)
      .then((x: any) => x, () => ({ data: null }));
    priceHistory = (r?.data || []).map((p: any) => ({
      price: Number(p.price),
      observedAt: p.observed_at,
    }));
  }

  const askComps: ArbitrageComp[] = eligibleAskingPrices(asks as any[]).map((d: any) => ({
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
    // Extra keys the check uses to drop the pasted car itself.
    ...({ url: d.source_url ?? null, vin: d.vin ?? null } as object),
  }));
  const soldComps: ArbitrageComp[] = (sold as any[]).map((s, i) => ({
    id: `sold-${i}-${s.source_url || ""}`,
    price: Number(s.sold_price),
    kind: "sold",
    state: null,
    year: s.year ?? null,
    mileage: s.mileage ?? null,
    observedAt: s.sold_at ?? null,
    source: s.source ?? null,
    title: s.title ?? null,
    ...({ url: s.source_url ?? null } as object),
  }));

  const t = timing[0];
  return {
    comps: [...askComps, ...soldComps],
    timing:
      t && Number.isFinite(Number(t.pct_change))
        ? { pctChange: Number(t.pct_change), dataPoints: Number(t.data_points) || 0 }
        : null,
    priceHistory,
    dealId,
  };
}

/**
 * Desk gate (docs/intelligence-advisor.md): personal buyers see the verdict, Buy ≤ and fair price.
 * Profit, expected resale and where to sell stay on the flip desk. For someone buying to drive,
 * "Buy ≤" is the fair value where the car sits (not the flip ceiling), and the verdict compares
 * the price with it: at or under → Buy, up to 5% over → Wait (negotiate), more → Pass.
 */
export function readForDesk(read: CheckListingRead, flipDesk: boolean): CheckListingRead {
  if (flipDesk) return read;
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const fair = read.fairValue.value;
  const price = read.vehicle.price;
  let verdict = read.verdict;
  let headline = read.headline;
  if (fair == null) {
    verdict = "not_enough_data";
    headline = "Not enough data: too few comparable cars to price this one.";
  } else if (price <= fair) {
    verdict = "buy";
    headline = `Good price: about ${money(fair - price)} under fair value (${money(fair)}).`;
  } else if (price <= fair * 1.05) {
    verdict = "wait";
    headline = `Close: offer ${money(fair)} or less.`;
  } else {
    verdict = "pass";
    headline = `Overpriced by about ${money(price - fair)}. Fair value is ${money(fair)}.`;
  }
  return {
    ...read,
    verdict,
    headline,
    maxBuy: {
      value: fair == null ? null : Math.floor(fair / 50) * 50,
      basis: read.fairValue.basis,
      targetProfit: null,
    },
    resale: { value: null, basis: read.resale.basis, state: null },
    profit: { ...read.profit, net: null, sellingCost: null },
    why: read.why.filter((w) => !/^After fees/.test(w)),
  };
}
