export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// GET /api/market/sold?make=Honda&model=Accord&year=2018
// Recent SOLD comps (actual transaction prices) — far more accurate than asking prices. Reads the
// sold_listings table (populated by the sold-detect scraper hook / MarketCheck sold endpoint).
// Returns [] until that data exists.
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "sold", limit: 90, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const { searchParams } = new URL(req.url);
  const make = searchParams.get("make");
  const model = searchParams.get("model");
  const year = parseInt(searchParams.get("year") || "0", 10);
  if (!make || !model)
    return NextResponse.json(
      { error: "make and model required" },
      { status: 400 },
    );

  const supabase = createServerComponentClient();
  let q = supabase
    .from("sold_listings")
    .select("sold_price, sold_at, mileage, source, location_state")
    .ilike("make", make)
    .ilike("model", `%${model.split(" ")[0]}%`)
    .gt("sold_price", 0)
    .gte("sold_at", new Date(Date.now() - 90 * 86400000).toISOString())
    .order("sold_at", { ascending: false })
    .limit(50);
  if (year) q = q.gte("year", year - 1).lte("year", year + 1);

  const { data } = await q;
  const rows = data || [];
  const prices = rows
    .map((r: any) => Number(r.sold_price))
    .filter((p) => p > 0);
  if (prices.length === 0)
    return NextResponse.json({ comps: [], count: 0, avg: null });

  return NextResponse.json({
    comps: rows
      .slice(0, 10)
      .map((r: any) => ({
        price: Number(r.sold_price),
        soldAt: r.sold_at,
        mileage: r.mileage,
        state: r.location_state,
      })),
    count: prices.length,
    avg: Math.round(prices.reduce((s, x) => s + x, 0) / prices.length),
    low: Math.min(...prices),
    high: Math.max(...prices),
  });
}
