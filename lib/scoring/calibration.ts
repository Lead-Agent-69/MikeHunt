// lib/scoring/calibration.ts
// The feedback loop that makes verdicts get SHARPER over time (not just broader). As a dealer logs
// real outcomes (deal_outcomes), we measure how the engine's predictions diverged from reality and
// derive per-dealer multipliers — their transport really runs 1.2× our baseline, their cars sell
// for 0.94× our resale estimate, etc. Applied to future estimates, the app calibrates to THIS
// dealer's actual cost structure and market. The more they log, the more personal it gets.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface DealerCalibration {
  sampleSize: number;
  transportMultiplier: number; // actual transport / predicted
  reconMultiplier: number; // actual recon / predicted
  sellMultiplier: number; // actual sale price / predicted resale
  profitAccuracyPct: number; // 100 - mean abs % error of profit prediction
  profitBiasPct: number; // signed: + means we UNDER-predicted profit, - means OVER
  message: string;
}

// Minimum logged outcomes before we trust calibration. Below this we don't bend estimates.
const MIN_SAMPLES = 5;
// Clamp multipliers so a couple of weird outliers can't wildly distort estimates.
const CLAMP_LO = 0.5;
const CLAMP_HI = 2.0;

function clamp(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(CLAMP_HI, Math.max(CLAMP_LO, n));
}

// Mean of a ratio actual/predicted across rows where both sides are present & positive.
function meanRatio(
  rows: any[],
  actualKey: string,
  predictedKey: string,
): number {
  const ratios: number[] = [];
  for (const r of rows) {
    const a = Number(r[actualKey]);
    const p = Number(r[predictedKey]);
    if (Number.isFinite(a) && Number.isFinite(p) && a > 0 && p > 0)
      ratios.push(a / p);
  }
  if (!ratios.length) return 1;
  return ratios.reduce((s, x) => s + x, 0) / ratios.length;
}

/**
 * Compute a dealer's calibration from their logged outcomes. Returns null until there are enough
 * samples to be meaningful (so we never bend estimates on one lucky/unlucky flip).
 */
export async function getDealerCalibration(
  supabase: SupabaseClient,
  userId: string,
): Promise<DealerCalibration | null> {
  const { data, error } = await supabase
    .from("deal_outcomes")
    .select(
      "deal_id, inventory_id, predicted_profit, predicted_sell, predicted_transport, predicted_recon, actual_profit, sell_price, actual_transport, actual_recon",
    )
    .eq("user_id", userId)
    .not("actual_profit", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) return null;

  // Dedupe: a fleet seed (POST /api/inventory) and a later "Track this flip" log (POST /api/outcomes)
  // can both land in deal_outcomes for the SAME deal. Count each real flip once so calibration isn't
  // double-weighted. Rows are created_at DESC, so the latest (sale-confirmed) row per deal wins;
  // untied manual logs (no deal_id/inventory_id) are always kept.
  const seen = new Set<string>();
  const dedup: any[] = [];
  for (const r of data) {
    const k = r.deal_id || r.inventory_id;
    if (k) {
      if (seen.has(k)) continue;
      seen.add(k);
    }
    dedup.push(r);
  }
  if (dedup.length < MIN_SAMPLES) return null;
  const rows = dedup;

  const transportMultiplier = clamp(
    meanRatio(rows, "actual_transport", "predicted_transport"),
  );
  const reconMultiplier = clamp(
    meanRatio(rows, "actual_recon", "predicted_recon"),
  );
  const sellMultiplier = clamp(meanRatio(rows, "sell_price", "predicted_sell"));

  // Profit accuracy: mean absolute % error; bias: signed mean % error.
  const absErrs: number[] = [];
  const biases: number[] = [];
  for (const r of rows) {
    const a = Number(r.actual_profit);
    const p = Number(r.predicted_profit);
    if (Number.isFinite(a) && Number.isFinite(p) && Math.abs(p) > 1) {
      absErrs.push(Math.abs(a - p) / Math.abs(p));
      biases.push((a - p) / Math.abs(p));
    }
  }
  const mae = absErrs.length
    ? absErrs.reduce((s, x) => s + x, 0) / absErrs.length
    : 0;
  const bias = biases.length
    ? biases.reduce((s, x) => s + x, 0) / biases.length
    : 0;
  const profitAccuracyPct = Math.max(0, Math.round((1 - mae) * 100));
  const profitBiasPct = Math.round(bias * 100);

  const tPct = Math.round((transportMultiplier - 1) * 100);
  const message =
    tPct !== 0
      ? `Based on ${rows.length} logged deals, your transport runs ${Math.abs(tPct)}% ${tPct > 0 ? "higher" : "lower"} than our baseline — estimates now adjust for it.`
      : `Calibrated to your ${rows.length} logged deals.`;

  return {
    sampleSize: rows.length,
    transportMultiplier: Number(transportMultiplier.toFixed(2)),
    reconMultiplier: Number(reconMultiplier.toFixed(2)),
    sellMultiplier: Number(sellMultiplier.toFixed(2)),
    profitAccuracyPct,
    profitBiasPct,
    message,
  };
}

/** Apply a dealer's calibration to a raw deal estimate. Pure — safe to call with null calibration. */
export function applyCalibration(
  estimate: {
    sellEstimate?: number | null;
    transport?: number | null;
    recon?: number | null;
  },
  cal: DealerCalibration | null,
): {
  sellEstimate: number;
  transport: number;
  recon: number;
  calibrated: boolean;
} {
  const sell = Number(estimate.sellEstimate) || 0;
  const transport = Number(estimate.transport) || 0;
  const recon = Number(estimate.recon) || 0;
  if (!cal) return { sellEstimate: sell, transport, recon, calibrated: false };
  return {
    sellEstimate: Math.round(sell * cal.sellMultiplier),
    transport: Math.round(transport * cal.transportMultiplier),
    recon: Math.round(recon * cal.reconMultiplier),
    calibrated: true,
  };
}
