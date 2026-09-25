export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";

// GET /api/deals/[id]/similar — semantically-similar deals via pgvector (similar_deals_by_id).
// Falls back to attribute-based similarity (same make, near year/price) when embeddings aren't
// populated yet, so the section is always useful.
function mapRow(d: any) {
  return {
    id: d.id,
    year: d.year,
    make: d.make,
    model: d.model,
    askPrice: Number(d.ask_price || 0),
    mileage: d.mileage,
    condition: d.condition,
    dealVerdict: d.deal_verdict,
    trueNetProfit:
      d.true_net_profit != null ? Number(d.true_net_profit) : undefined,
    sellEstimate: d.sell_estimate != null ? Number(d.sell_estimate) : undefined,
    profitScore: d.profit_score != null ? Number(d.profit_score) : undefined,
    locationState: d.location_state,
    locationCity: d.location_city,
    images: d.images || [],
    source: d.source,
    similarity:
      d.similarity != null ? Math.round(Number(d.similarity) * 100) : undefined,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerComponentClient();

  // 1. Semantic path.
  try {
    const { data, error } = await supabase.rpc("similar_deals_by_id", {
      p_deal_id: id,
      p_count: 12,
    });
    if (!error && data && data.length > 0) {
      return NextResponse.json({
        similar: data.map(mapRow),
        basis: "semantic",
      });
    }
  } catch {
    // fall through to attribute-based
  }

  // 2. Attribute-based fallback — same make, ±2 years, similar price.
  const { data: base } = await supabase
    .from("deals")
    .select("make, model, year, ask_price")
    .eq("id", id)
    .maybeSingle();

  if (!base?.make) return NextResponse.json({ similar: [], basis: "none" });

  let q = supabase
    .from("deals")
    .select(
      "id, year, make, model, ask_price, mileage, condition, deal_verdict, true_net_profit, sell_estimate, profit_score, location_state, location_city, images, source",
    )
    .eq("active", true)
    .eq("make", base.make)
    .neq("id", id)
    .gt("ask_price", 0)
    .order("profit_score", { ascending: false, nullsFirst: false })
    .limit(12);

  if (base.model) q = q.ilike("model", `%${String(base.model).split(" ")[0]}%`);
  if (base.year) q = q.gte("year", base.year - 2).lte("year", base.year + 2);

  const { data: rows } = await q;
  return NextResponse.json({
    similar: (rows || []).map(mapRow),
    basis: "attribute",
  });
}
