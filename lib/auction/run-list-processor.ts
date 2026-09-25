import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeVin, isValidVin } from "../vehicle/vin";

// Match an uploaded auction run list against our REAL scored inventory. For each VIN a dealer is eyeing at
// an upcoming auction, we report whether we already track it as a live deal and its verdict / max-bid /
// net profit — so they know what to bid BEFORE the lane. We MATCH real deals only; we NEVER fabricate a
// deal from a bare VIN (that would inject fake listings into the live feed — a no-fake-data violation).
// Fast: a single indexed VIN `IN` query, so it runs inline in the request — no Redis/queue needed.

export interface RunListMatch {
  vin: string;
  found: boolean;
  dealId?: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  askPrice?: number | null;
  verdict?: string | null;
  maxBid?: number | null;
  netProfit?: number | null;
  score?: number | null;
}

export async function matchRunList(
  sb: SupabaseClient,
  runListId: string,
): Promise<RunListMatch[]> {
  const { data: runList, error } = await sb
    .from("auction_run_lists")
    .select("vins")
    .eq("id", runListId)
    .single();
  if (error || !runList) return [];

  const vins = Array.from(
    new Set(
      (((runList.vins as string[]) || []) as string[])
        .map(normalizeVin)
        .filter(isValidVin),
    ),
  );

  let results: RunListMatch[] = [];
  if (vins.length) {
    // One query: which of these VINs do we already track as real, active deals?
    const { data: deals } = await sb
      .from("deals")
      .select(
        "id, vin, year, make, model, ask_price, deal_verdict, recommended_max_bid, true_net_profit, profit_score",
      )
      .in("vin", vins)
      .eq("active", true);

    const byVin = new Map<string, any>();
    for (const d of deals || []) {
      const v = String(d.vin || "").toUpperCase();
      // If a VIN appears on multiple sources, keep the best-scored real deal.
      if (
        !byVin.has(v) ||
        (d.profit_score ?? 0) > (byVin.get(v).profit_score ?? 0)
      )
        byVin.set(v, d);
    }

    results = vins.map((vin) => {
      const d = byVin.get(vin.toUpperCase());
      if (!d) return { vin, found: false };
      return {
        vin,
        found: true,
        dealId: d.id,
        year: d.year,
        make: d.make,
        model: d.model,
        askPrice: d.ask_price != null ? Number(d.ask_price) : null,
        verdict: d.deal_verdict,
        maxBid:
          d.recommended_max_bid != null ? Number(d.recommended_max_bid) : null,
        netProfit: d.true_net_profit != null ? Number(d.true_net_profit) : null,
        score: d.profit_score != null ? Number(d.profit_score) : null,
      };
    });
  }

  await sb
    .from("auction_run_lists")
    .update({
      status: "completed",
      total_count: vins.length,
      processed_count: vins.length,
      results,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runListId);

  return results;
}
