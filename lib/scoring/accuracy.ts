// lib/scoring/accuracy.ts
// Live valuation accuracy — the enterprise trust signal. Holds out a slice of real retail listings,
// predicts each from the comp index, and compares to the market's own ask (× the ask→sold haircut).
// Out-of-sample-ish: the analyzer only trusts deep buckets, where one held-out car barely moves the
// median. Used by /status (cached) and scripts/valuation-backtest.ts. Clean-retail only — eBay-sold
// can't benchmark this (1% has mileage, budget/salvage channel).

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMarketIndex } from "./market-value";
import { analyzeDeal } from "./deal-analyzer";

const RETAIL = ["cars_com", "carvana", "autotrader", "truecar", "cargurus"];

export interface ValuationAccuracy {
  n: number; // held-out cars scored
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
    if (i % 5 !== 0) continue; // 1-in-5 held-out slice
    const d = rows[i];
    const a = analyzeDeal(d);
    if (!a.sellEstimate || a.sellBasis === "baseline") continue;
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
    n: abs.length,
    mape: Math.round(mean * 1000) / 10,
    medianErr: Math.round(at(abs, 0.5) * 1000) / 10,
    bias: Math.round(at(signed, 0.5) * 1000) / 10,
    within10: Math.round(within(0.1) * 100),
    within20: Math.round(within(0.2) * 100),
    within30: Math.round(within(0.3) * 100),
  };
}
