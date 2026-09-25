export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { hashApiKey } from "@/lib/api-keys";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

const CORS = { "Access-Control-Allow-Origin": "*" };

// GET /api/public/v1/deals — the public, dealer-focused API. Unlike any listings API, it returns
// PROFIT intelligence: GO verdict + estimated net profit + recommended max bid. Authenticated with
// an x-api-key (see /developer). Filters: ?state= &make= &minProfit= &verdict= &limit=
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, {
    key: "public-api",
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  const key = req.headers.get("x-api-key") || "";
  if (!key)
    return NextResponse.json(
      { error: "Missing x-api-key header." },
      { status: 401, headers: CORS },
    );

  const supabase = createServerComponentClient();
  const { data: keyRow } = await supabase
    .from("api_keys")
    .select("id, revoked, request_count")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();

  if (!keyRow || keyRow.revoked) {
    return NextResponse.json(
      { error: "Invalid or revoked API key." },
      { status: 401, headers: CORS },
    );
  }

  // Best-effort usage tracking.
  supabase
    .from("api_keys")
    .update({
      request_count: (keyRow.request_count || 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", keyRow.id)
    .then(
      () => {},
      () => {},
    );

  const sp = new URL(req.url).searchParams;
  const state = sp.get("state")?.toUpperCase();
  const make = sp.get("make");
  const minProfit = parseInt(sp.get("minProfit") || "0", 10);
  const verdict = sp.get("verdict") || "go";
  const limit = Math.min(
    200,
    Math.max(1, parseInt(sp.get("limit") || "50", 10) || 50),
  );

  let q = supabase
    .from("deals")
    .select(
      "id, vin, year, make, model, ask_price, sell_estimate, true_net_profit, recommended_max_bid, deal_verdict, profit_score, location_state, location_city, source, source_url",
    )
    .eq("active", true)
    .gt("ask_price", 0)
    .order("profit_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (verdict && verdict !== "all") q = q.eq("deal_verdict", verdict);
  if (state) q = q.eq("location_state", state);
  if (make) q = q.ilike("make", make);
  if (minProfit > 0) q = q.gte("true_net_profit", minProfit);

  const { data, error } = await q;
  if (error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS },
    );

  return NextResponse.json(
    {
      data: (data || []).map((d: any) => ({
        id: d.id,
        vin: d.vin,
        year: d.year,
        make: d.make,
        model: d.model,
        ask_price: d.ask_price,
        estimated_resale: d.sell_estimate,
        estimated_net_profit: d.true_net_profit,
        recommended_max_bid: d.recommended_max_bid,
        verdict: d.deal_verdict,
        profit_score: d.profit_score,
        location: { state: d.location_state, city: d.location_city },
        source: d.source,
        url: d.source_url,
      })),
      meta: { count: data?.length || 0, limit },
    },
    { headers: CORS },
  );
}
