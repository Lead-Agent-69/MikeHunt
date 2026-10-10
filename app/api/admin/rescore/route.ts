export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeDeal } from "@/lib/scoring/deal-analyzer";
import { loadMarketIndex } from "@/lib/scoring/market-value";
import { canManageOperations } from "@/lib/auth/admin-operations";
import { columnsExist } from "@/lib/data-quality/optional-columns";
import { shouldSkipRescore } from "@/lib/data-quality/rescore-guard";

// POST /api/admin/rescore — recompute valuation/verdict/max-bid/score for existing active deals with
// the fixed analyzer (baseline sanity gate + clamped score). New scrapes already use it; this fixes
// the backlog so wrong numbers (e.g. $42k max bid on a $5.5k Mustang) don't linger. Gated by
// INGEST_SECRET. Body: { page?, pageSize? } — loop pages until hasMore is false.
// Sanity-flagged rows (quality_flags, 20261010210000) are never rescored: profit / verdict / max bid
// stay cleared. Skipped on the stored flags AND the pure ingest check (works before the column is
// applied), and the UPDATE itself is conditioned on quality_flags IS NULL once the column exists.
const CORS = { "Access-Control-Allow-Origin": "*" };

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

export async function POST(req: Request) {
  if (!(await canManageOperations(req))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS },
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* ok */
  }
  const page = Math.max(0, Number(body.page) || 0);
  const pageSize = Math.min(1500, Math.max(1, Number(body.pageSize) || 800));

  const sb = admin();
  await loadMarketIndex(sb); // populate the in-memory comps index the analyzer reads

  const hasFlags = await columnsExist(sb as any, "deals", ["quality_flags"]);
  const cols =
    "id, year, make, model, trim, mileage, ask_price, source, condition, damage_type, location_state, mmr_value, vin, auction_end_at" +
    (hasFlags ? ", quality_flags" : "");
  const { data: deals, error } = await sb
    .from("deals")
    .select(cols)
    .eq("active", true)
    .order("id", { ascending: true })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (error) {
    console.error("[admin/rescore]", error.message);
    return NextResponse.json(
      { error: "Request failed" },
      { status: 500, headers: CORS },
    );
  }
  if (!deals?.length)
    return NextResponse.json(
      { page, updated: 0, hasMore: false },
      { headers: CORS },
    );

  let updated = 0;
  let skippedFlagged = 0;
  for (const d of deals as any[]) {
    if (shouldSkipRescore(d)) {
      skippedFlagged++;
      continue;
    }
    try {
      const a = analyzeDeal(d as any);
      let q = sb
        .from("deals")
        .update({
          sell_estimate: a.sellEstimate,
          mmr_value: a.mmrValue || null,
          recommended_max_bid: a.recommendedMaxBid,
          true_net_profit: a.profit,
          repair_estimate: a.repairCost,
          transport_estimate: a.transportCost,
          profit_score: Math.min(100, Math.max(0, a.score)),
          deal_verdict: a.verdict,
          is_arbitrage_opportunity: a.verdict === "go",
          score_updated_at: new Date().toISOString(),
        })
        .eq("id", d.id);
      // Race guard: a re-ingest may flag the row between the read and this write.
      if (hasFlags) q = q.is("quality_flags", null);
      const { error: upErr } = await q;
      if (!upErr) updated++;
    } catch {
      /* skip */
    }
  }

  return NextResponse.json(
    {
      page,
      scanned: deals.length,
      updated,
      skippedFlagged,
      hasMore: deals.length === pageSize,
    },
    { headers: CORS },
  );
}
