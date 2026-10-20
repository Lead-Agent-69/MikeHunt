// Personal model adjustments from complete owner-reported records and matched, dated snapshots.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ledgerTotals,
  OUTCOME_LEDGER_COLUMNS,
  type LedgerRow,
} from "@/lib/outcomes/ledger";
export interface DealerCalibration {
  sampleSize: number;
  transportMultiplier: number;
  reconMultiplier: number;
  sellMultiplier: number;
  profitAccuracyPct: number | null;
  profitBiasPct: number | null;
  message: string;
  matchedSamples?: {
    sell: number;
    transport: number;
    recon: number;
    profit: number;
  };
}
const MIN = 5;
function mean(values: number[]) {
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}
function multiplier(values: number[]) {
  return values.length < MIN
    ? 1
    : Number(Math.min(2, Math.max(0.5, mean(values))).toFixed(2));
}
export function calibrationFromRows(
  input: LedgerRow[],
): DealerCalibration | null {
  const seen = new Set<string>();
  const rows = input.filter((row) => {
    if (
      !ledgerTotals(row).complete ||
      row.prediction_basis !== "market_supported" ||
      !row.prediction_captured_at ||
      !row.sold_at
    )
      return false;
    const captured = Date.parse(row.prediction_captured_at);
    if (
      !Number.isFinite(captured) ||
      captured > Date.now() ||
      row.prediction_captured_at.slice(0, 10) > row.sold_at.slice(0, 10)
    )
      return false;
    const key =
      row.inventory_id ||
      (row.deal_id
        ? `${row.deal_id}:${row.purchased_at?.slice(0, 10)}`
        : row.id);
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
  if (rows.length < MIN) return null;
  const ratio = (
    actual: "sell_price" | "actual_transport" | "actual_recon",
    predicted: "predicted_sell" | "predicted_transport" | "predicted_recon",
  ) =>
    rows.flatMap((row) => {
      const a = row[actual],
        p = row[predicted];
      return a != null && typeof p === "number" && Number.isFinite(p) && p > 0
        ? [Number(a) / p]
        : [];
    });
  const sell = ratio("sell_price", "predicted_sell"),
    transport = ratio("actual_transport", "predicted_transport"),
    recon = ratio("actual_recon", "predicted_recon");
  const profitPairs = rows.flatMap((row) => {
    const a = ledgerTotals(row).profit,
      p = row.predicted_profit;
    return a != null &&
      typeof p === "number" &&
      Number.isFinite(p) &&
      Math.abs(p) > 1
      ? [{ actual: a, predicted: p }]
      : [];
  });
  if (
    Math.max(sell.length, transport.length, recon.length, profitPairs.length) <
    MIN
  )
    return null;
  const accuracy =
    profitPairs.length >= MIN
      ? Math.max(
          0,
          Math.round(
            (1 -
              mean(
                profitPairs.map(
                  (r) =>
                    Math.abs(r.actual - r.predicted) / Math.abs(r.predicted),
                ),
              )) *
              100,
          ),
        )
      : null;
  const bias =
    profitPairs.length >= MIN
      ? Math.round(
          mean(
            profitPairs.map(
              (r) => (r.actual - r.predicted) / Math.abs(r.predicted),
            ),
          ) * 100,
        )
      : null;
  return {
    sampleSize: rows.length,
    sellMultiplier: multiplier(sell),
    transportMultiplier: multiplier(transport),
    reconMultiplier: multiplier(recon),
    profitAccuracyPct: accuracy,
    profitBiasPct: bias,
    matchedSamples: {
      sell: sell.length,
      transport: transport.length,
      recon: recon.length,
      profit: profitPairs.length,
    },
    message: `Based on ${rows.length} complete owner-reported sales with dated model snapshots. Each adjustment needs at least ${MIN} matched pairs; actual results can differ.`,
  };
}
export async function getDealerCalibration(
  sb: SupabaseClient,
  userId: string,
): Promise<DealerCalibration | null> {
  const { data, error } = await sb
    .from("deal_outcomes")
    .select(
      `${OUTCOME_LEDGER_COLUMNS},prediction_basis,prediction_captured_at,predicted_profit,predicted_sell,predicted_transport,predicted_recon`,
    )
    .eq("user_id", userId)
    .eq("costs_complete", true)
    .not("sell_price", "is", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  return error || !data ? null : calibrationFromRows(data as LedgerRow[]);
}
export function applyCalibration(
  estimate: {
    sellEstimate?: number | null;
    transport?: number | null;
    recon?: number | null;
  },
  cal: DealerCalibration | null,
) {
  const sell = Number(estimate.sellEstimate) || 0,
    transport = Number(estimate.transport) || 0,
    recon = Number(estimate.recon) || 0;
  return {
    sellEstimate: cal ? Math.round(sell * cal.sellMultiplier) : sell,
    transport: cal
      ? Math.round(transport * cal.transportMultiplier)
      : transport,
    recon: cal ? Math.round(recon * cal.reconMultiplier) : recon,
    calibrated: !!cal,
  };
}
