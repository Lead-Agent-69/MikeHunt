// lib/deal-check/sold-comps.ts
// Completed-sale comps for Deal Check, read with the same filters as the other sold_listings
// consumers (market-value sold index, /api/sold): US/USD, sold_price > 0, sold in the last
// SOLD_MEDIAN_WINDOW_DAYS (180), basis = 'sold' (withSoldBasis), make + normalized model, year ±1.
// The title lane is applied later by dealCheckMarketValue (market-comps.ts), from each row's headline.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeModel,
  soldWindowCutoffIso,
} from "@/lib/scoring/market-value";
import { SOLD_BASIS, withSoldBasis } from "@/lib/scoring/sold-basis";
import { splitSoldMakeModelTrim } from "@/lib/scrapers/sources/ebay-sold";
import type { DealCheckCompRow } from "./market-comps";

export const DEAL_CHECK_SOLD_LIMIT = 300;

/**
 * Normalized model key for a vehicle read off a document, split the same way the eBay sold collector
 * stores sold_listings.model: "F-150 XLT" → "f150", "Grand Cherokee Laredo" → "grandcherokee".
 */
export function dealCheckModelKey(
  make: string | null | undefined,
  model: string | null | undefined,
): { make: string; model: string } {
  const words = `${make || ""} ${model || ""}`.trim().split(/\s+/);
  const split = splitSoldMakeModelTrim(words);
  return {
    make: (split.make || make || "").trim(),
    model: split.model || normalizeModel(model),
  };
}

const PG_SAFE = /^[A-Za-z0-9.-]+$/;

/** sold_listings row → DealCheckCompRow (source_item_id is the sold row's source id). */
export function toDealCheckSoldRow(r: any): DealCheckCompRow {
  return {
    sold_price: r.sold_price == null ? null : Number(r.sold_price),
    sold_at: r.sold_at ?? null,
    location_state: r.location_state ?? null,
    source: r.source ?? null,
    source_deal_id: r.source_item_id ?? null,
    source_url: r.source_url ?? null,
    vin: r.vin ?? null,
    year: r.year ?? null,
    mileage: r.mileage ?? null,
    title: r.title ?? null,
  };
}

/** Load sold comps for one vehicle. Throws on a read error so the caller can say "unavailable". */
export async function loadDealCheckSoldRows(
  supabase: SupabaseClient,
  vehicle: { make: string; model: string; year?: number | null },
  now: number = Date.now(),
): Promise<DealCheckCompRow[]> {
  const { make, model: key } = dealCheckModelKey(vehicle.make, vehicle.model);
  if (!key || !make) return [];
  const firstWord = String(vehicle.model).trim().split(/\s+/)[0] || "";
  // Normalized rows (eBay sold collector) match exactly; legacy/ingest rows by their raw first word.
  const modelOr = PG_SAFE.test(firstWord)
    ? `model.eq.${key},model.ilike.${firstWord}*`
    : `model.eq.${key}`;
  const year = Number(vehicle.year) || 0;
  const { data, error } = await withSoldBasis((filterBasis) => {
    let q = supabase
      .from("sold_listings")
      .select(
        "sold_price, sold_at, location_state, source, source_item_id, source_url, vin, year, mileage, title, model, make",
      )
      .ilike("make", make.replace(/[\\%_]/g, "\\$&"))
      .or(modelOr)
      .eq("currency_code", "USD")
      .eq("country_code", "US");
    if (filterBasis) q = q.eq("basis", SOLD_BASIS);
    q = q
      .gt("sold_price", 0)
      .gte("sold_at", soldWindowCutoffIso(now))
      .lte("sold_at", new Date(now).toISOString());
    if (year > 0) q = q.gte("year", year - 1).lte("year", year + 1);
    return q
      .order("sold_at", { ascending: false })
      .limit(DEAL_CHECK_SOLD_LIMIT);
  });
  if (error) throw new Error("sold comps unavailable");
  return ((data || []) as any[])
    .filter(
      (r) =>
        String(r.make || "")
          .trim()
          .toLowerCase() === make.toLowerCase() &&
        normalizeModel(r.model) === key,
    )
    .map(toDealCheckSoldRow);
}
