export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { fitDepreciationCurve } from "@/lib/scoring/depreciation";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// GET /api/market/depreciation?make=Honda&model=Accord&year=2018
// Returns the price-vs-mileage scatter points + a fitted depreciation line ($/1k miles).
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "deprec", limit: 90, windowMs: 60_000 });
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
    .from("deals")
    .select("mileage, ask_price")
    .eq("active", true)
    .ilike("make", make)
    .ilike("model", `%${model.split(" ")[0]}%`)
    .gt("ask_price", 0)
    .not("mileage", "is", null)
    .limit(500);
  if (year) q = q.gte("year", year - 1).lte("year", year + 1);

  const { data } = await q;
  const points = (data || [])
    .map((d: any) => ({
      mileage: Number(d.mileage),
      price: Number(d.ask_price),
    }))
    .filter((p) => p.mileage > 0 && p.price > 0);

  const fit = fitDepreciationCurve(points);
  return NextResponse.json({
    points,
    n: points.length,
    depreciationPer1000Miles: fit?.depreciationPer1000Miles ?? null,
    // A 2-point segment for drawing the trend line on a chart.
    trend: fit
      ? [
          { mileage: 0, price: Math.round(fit.intercept) },
          { mileage: 200000, price: fit.predictPriceAtMileage(200000) },
        ]
      : null,
  });
}
