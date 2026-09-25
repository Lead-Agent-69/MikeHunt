export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";

// GET /api/sold?make=Ford&model=F-150&year=2018 — REAL recent completed-sale prices (eBay sold etc.)
// for this make/model, year-banded. Surfacing actual transactions = trust ("here's what these really
// sell for"), and finally uses the sold_listings data the valuation already anchors to.
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const make = (sp.get("make") || "").trim();
  const model = (sp.get("model") || "").trim();
  const year = parseInt(sp.get("year") || "0", 10) || 0;
  if (!make || !model) return NextResponse.json({ sales: [], median: null });

  const supabase = createServerComponentClient();
  let q = supabase
    .from("sold_listings")
    .select("year, make, model, trim, mileage, sold_price, sold_at, source")
    .ilike("make", make)
    .ilike("model", `%${model.split(" ")[0]}%`)
    .gt("sold_price", 0)
    .order("sold_at", { ascending: false })
    .limit(40);
  if (year > 0) q = q.gte("year", year - 2).lte("year", year + 2);

  const { data, error } = await q;
  if (error) return NextResponse.json({ sales: [], median: null });

  const prices = (data || [])
    .map((d: any) => Number(d.sold_price))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;

  return NextResponse.json({
    median,
    count: prices.length,
    low: prices[0] ?? null,
    high: prices[prices.length - 1] ?? null,
    sales: (data || []).slice(0, 6).map((d: any) => ({
      year: d.year,
      title: `${d.year || ""} ${d.make || ""} ${d.model || ""} ${d.trim || ""}`
        .replace(/\s+/g, " ")
        .trim(),
      price: Math.round(Number(d.sold_price)),
      mileage: d.mileage || null,
      soldAt: d.sold_at,
      source: d.source,
    })),
  });
}
