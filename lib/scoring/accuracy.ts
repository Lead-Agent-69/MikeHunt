// lib/scoring/accuracy.ts
// In-sample asking-price proxy check. The live index may include every sampled listing.
// A 7% discount is an assumption, never an observed sale or a held-out prediction target.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMarketIndex } from "./market-value";
import { analyzeDeal } from "./deal-analyzer";

const RETAIL = ["cars_com", "carvana", "autotrader", "truecar", "cargurus"];

export interface ValuationAccuracy {
  basis: "asking_price_proxy";
  sampleMode: "in_sample";
  assumedDiscountPct: 7;
  n: number; // sampled listings scored
  mape: number; // mean absolute % error
  medianErr: number; // median absolute % error
  bias: number; // median signed % error (+ = over-value)
  within10: number; // share within 10%
  within20: number;
  within30: number;
}

export async function computeValuationAccuracy(
  supabase: SupabaseClient,
  sampleCap = 6000,
): Promise<ValuationAccuracy | null> {
  await loadMarketIndex(supabase);

  const rows: any[] = [];
  for (let from = 0; from < sampleCap; from += 1000) {
    const { data, error } = await supabase
      .from("deals")
      .select("make, model, year, mileage, ask_price, condition, source")
      .eq("active", true)
      .in("source", RETAIL)
      .gt("ask_price", 2000)
      .lt("ask_price", 90000)
      .gt("mileage", 0)
      .range(from, from + 999);
    if (error || !data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  if (rows.length < 100) return null;

  const abs: number[] = [];
  const signed: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (i % 5 !== 0) continue; // Sampling does not remove rows from the live comp index.
    const d = rows[i];
    const a = analyzeDeal(d);
    if (
      !Number.isFinite(a.sellEstimate) ||
      a.sellEstimate <= 0 ||
      a.sellBasis === "baseline"
    )
      continue;
    const truth = d.ask_price * 0.93;
    const e = (a.sellEstimate - truth) / truth;
    abs.push(Math.abs(e));
    signed.push(e);
  }
  if (abs.length < 50) return null;
  abs.sort((a, b) => a - b);
  signed.sort((a, b) => a - b);
  const mean = abs.reduce((s, v) => s + v, 0) / abs.length;
  const at = (arr: number[], p: number) => arr[Math.floor(arr.length * p)] ?? 0;
  const within = (t: number) => abs.filter((v) => v <= t).length / abs.length;

  return {
    basis: "asking_price_proxy",
    sampleMode: "in_sample",
    assumedDiscountPct: 7,
    n: abs.length,
    mape: Math.round(mean * 1000) / 10,
    medianErr: Math.round(at(abs, 0.5) * 1000) / 10,
    bias: Math.round(at(signed, 0.5) * 1000) / 10,
    within10: Math.round(within(0.1) * 100),
    within20: Math.round(within(0.2) * 100),
    within30: Math.round(within(0.3) * 100),
  };
}
