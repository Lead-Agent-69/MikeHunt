export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeDeal } from "@/lib/scoring/deal-analyzer";
import { loadMarketIndex } from "@/lib/scoring/market-value";
import { canManageOperations } from "@/lib/auth/admin-operations";
import { rescoreUpdate } from "@/lib/scoring/rescore-update";

// POST /api/admin/rescore — recompute valuation/verdict/max-bid/score for existing active deals with
// the fixed analyzer (baseline sanity gate + clamped score). New scrapes already use it; this fixes
// the backlog so wrong numbers (e.g. $42k max bid on a $5.5k Mustang) don't linger. Gated by
// INGEST_SECRET. Body: { page?, pageSize? } — loop pages until hasMore is false.
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
  const page = Number(body?.page ?? 0);
  const requestedSize = Number(body?.pageSize ?? 800);
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !Number.isSafeInteger(requestedSize) ||
    requestedSize < 1 ||
    page > Math.floor(Number.MAX_SAFE_INTEGER / 1000) - 1
  )
    return NextResponse.json(
      { error: "Invalid pagination" },
      { status: 400, headers: CORS },
    );
  const pageSize = Math.min(1000, requestedSize);

  const sb = admin();
  try {
    await loadMarketIndex(sb); // populate the in-memory comps index the analyzer reads
  } catch {
    return NextResponse.json(
      { error: "Market evidence unavailable" },
      { status: 503, headers: CORS },
    );
  }

  const { data: deals, error } = await sb
    .from("deals")
    .select(
      "id, title, year, make, model, trim, mileage, ask_price, buy_now_price, source, condition, damage_type, location_state, lat, lng, mmr_value, options, deal_analysis, updated_at",
    )
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
      { page, scanned: 0, updated: 0, rescored: 0, failed: 0, hasMore: false },
      { headers: CORS },
    );

  let updated = 0;
  let failed = 0;
  for (const d of deals) {
    try {
      const a = analyzeDeal(d as any);
      const { data: written, error: upErr } = await sb
        .from("deals")
        .update(rescoreUpdate(d, a))
        .eq("id", d.id)
        .eq("active", true)
        .eq("updated_at", d.updated_at)
        .select("id");
      if (upErr || written?.length !== 1)
        throw new Error("Score write not confirmed");
      updated++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json(
    {
      page,
      scanned: deals.length,
      updated,
      rescored: updated,
      failed,
      hasMore: deals.length === pageSize,
    },
    { status: failed ? 503 : 200, headers: CORS },
  );
}
