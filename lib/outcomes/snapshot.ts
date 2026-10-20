import type { SupabaseClient } from "@supabase/supabase-js";
import { marketValuation } from "@/lib/market/valuation";
import { uuid } from "./ledger";
/** Capture a supported model before a sale is reported; never reconstruct a prediction after sale. */
export async function outcomePredictionSnapshot(
  sb: SupabaseClient,
  dealId: unknown,
) {
  if (!uuid(dealId)) return null;
  const { data: d, error } = await sb
    .from("deals")
    .select("id,year,make,model,sell_estimate,true_net_profit,deal_analysis")
    .eq("id", dealId)
    .maybeSingle();
  if (error) throw error;
  if (!d) return null;
  const supported = marketValuation(
    d.deal_analysis?.valuation,
    d.sell_estimate,
  ).supported;
  const finite = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    year: d.year,
    make: d.make,
    model: d.model,
    prediction_basis: supported ? "market_supported" : "none",
    prediction_captured_at: supported ? new Date().toISOString() : null,
    predicted_sell: supported ? finite(d.sell_estimate) : null,
    predicted_profit: supported ? finite(d.true_net_profit) : null,
    predicted_transport: supported
      ? finite(d.deal_analysis?.costs?.transport)
      : null,
    predicted_recon: supported ? finite(d.deal_analysis?.costs?.repair) : null,
  };
}
