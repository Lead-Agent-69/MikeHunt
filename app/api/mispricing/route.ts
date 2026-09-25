export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { categorize } from "@/lib/discovery/categorize";
import {
  clusterStats,
  mispricingOf,
  isUnderpriced,
} from "@/lib/intelligence/mispricing";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// GET /api/mispricing — the mispricing radar. Clusters active deals by make/model/year-band, computes
// each cluster's price distribution, and surfaces the statistical outliers priced well under their
// peers. Pure stats, $0.  ?state=TX optional.
function clusterKey(d: any): string {
  const model = (d.model || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "")
    .replace(/[^a-z0-9]/g, "");
  const band = d.year ? Math.floor(d.year / 3) * 3 : "na";
  return `${(d.make || "").toLowerCase()}|${model}|${band}`;
}

function mapDeal(d: any, reason: string) {
  const tags = categorize({ ...d, sellBasis: d.deal_analysis?.sellBasis });
  return {
    id: d.id,
    source: d.source,
    sourceUrl: d.source_url,
    sellerPhone: d.seller_phone,
    sellerEmail: d.seller_email,
    title: d.title || `${d.year || ""} ${d.make || ""} ${d.model || ""}`.trim(),
    year: d.year,
    make: d.make,
    model: d.model,
    vin: d.vin,
    mileage: d.mileage,
    condition: d.condition,
    askPrice: Number(d.ask_price || 0),
    sellEstimate: d.sell_estimate != null ? Number(d.sell_estimate) : undefined,
    profitScore: d.profit_score != null ? Number(d.profit_score) : undefined,
    trueNetProfit:
      d.true_net_profit != null ? Number(d.true_net_profit) : undefined,
    recommendedMaxBid:
      d.recommended_max_bid != null ? Number(d.recommended_max_bid) : undefined,
    dealVerdict: d.deal_verdict,
    locationCity: d.location_city,
    locationState: d.location_state,
    images: d.images || [],
    ...tags,
    alsoOn: [],
    listingCount: 1,
    mispriceReason: reason,
  };
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "mispricing", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const state = new URL(req.url).searchParams.get("state")?.toUpperCase();
  const supabase = createServerComponentClient();

  let q = supabase
    .from("deals")
    .select(
      "id, source, source_url, title, year, make, model, vin, mileage, condition, ask_price, sell_estimate, mmr_value, deal_analysis, profit_score, true_net_profit, recommended_max_bid, deal_verdict, location_city, location_state, images",
    )
    .eq("active", true)
    .gt("ask_price", 0)
    .not("make", "is", null)
    .order("last_seen_at", { ascending: false })
    .limit(4000);
  if (state) q = q.eq("location_state", state);

  const { data: rows, error } = await q;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Build per-cluster price arrays.
  const clusters = new Map<string, number[]>();
  for (const r of rows || []) {
    const k = clusterKey(r);
    if (!clusters.has(k)) clusters.set(k, []);
    clusters.get(k)!.push(Number(r.ask_price));
  }

  const flagged: any[] = [];
  for (const r of rows || []) {
    const prices = clusters.get(clusterKey(r));
    if (!prices || prices.length < 5) continue;
    const stats = clusterStats(prices);
    if (!stats) continue;
    const m = mispricingOf(Number(r.ask_price), prices);
    if (isUnderpriced(m)) {
      flagged.push({
        ...mapDeal(
          r,
          `${Math.round(m!.pctBelowCluster)}% under ${stats.n} similar (median $${Math.round(stats.median).toLocaleString()})`,
        ),
        _pct: m!.pctBelowCluster,
      });
    }
  }

  flagged.sort((a, b) => b._pct - a._pct);
  const deals = flagged.slice(0, 24).map(({ _pct, ...d }) => d);
  return NextResponse.json({ deals, count: deals.length });
}
