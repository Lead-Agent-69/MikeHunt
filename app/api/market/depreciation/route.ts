export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { fitDepreciationCurve } from "@/lib/scoring/depreciation";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  sourcePriceContext,
  SOURCE_PRICE_FIELDS,
} from "@/lib/deals/source-price-context";
import { applyBuyableInventory } from "@/lib/search/customer-inventory";

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
  let q = applyBuyableInventory(
    supabase.from("deals").select(SOURCE_PRICE_FIELDS),
  )
    .ilike("make", make.replace(/[\\%_]/g, "\\$&"))
    .ilike("model", model.replace(/[\\%_]/g, "\\$&"))
    .not("mileage", "is", null)
    .order("last_seen_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(501);
  if (year) q = q.gte("year", year - 1).lte("year", year + 1);

  const { data, error } = await q;
  if (error)
    return NextResponse.json(
      { error: "Market samples unavailable" },
      { status: 503 },
    );
  const hasMore = (data?.length ?? 0) > 500;
  const observations = (data || []).slice(0, 500).map((d: any) => ({
    mileage: Number(d.mileage),
    context: sourcePriceContext(d),
  }));
  const cashPoints = observations
    .filter((d) => d.context.canCompareToAskingCurve)
    .map((d) => ({ mileage: d.mileage, price: d.context.cashPrice! }))
    .filter((p) => Number.isFinite(p.mileage) && p.mileage > 0);
  const qualified = cashPoints.length >= 6 && !hasMore;
  const points = qualified
    ? cashPoints
    : observations
        .filter(
          (d) =>
            d.context.observationCurrent &&
            ["asking", "buy_now", "unknown"].includes(d.context.kind),
        )
        .map((d) => ({
          mileage: d.mileage,
          price: d.context.advertisedAmount ?? d.context.amount ?? 0,
        }))
        .filter(
          (p) =>
            Number.isFinite(p.mileage) &&
            Number.isFinite(p.price) &&
            p.mileage > 0 &&
            p.price > 0,
        );

  const fit = qualified ? fitDepreciationCurve(points) : null;
  return NextResponse.json({
    points,
    n: points.length,
    priceBasis: qualified ? "reported_cash_asking" : "advertised_amounts",
    cashSampleCount: cashPoints.length,
    hasMore,
    depreciationPer1000Miles: fit?.depreciationPer1000Miles ?? null,
    // Draw only across observed samples, not a fictional 0-200k-mile domain.
    trend: fit
      ? [
          {
            mileage: Math.min(...points.map((p) => p.mileage)),
            price: fit.predictPriceAtMileage(
              Math.min(...points.map((p) => p.mileage)),
            ),
          },
          {
            mileage: Math.max(...points.map((p) => p.mileage)),
            price: fit.predictPriceAtMileage(
              Math.max(...points.map((p) => p.mileage)),
            ),
          },
        ]
      : null,
  });
}
