import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { vin } = await params;
  // Create the client at REQUEST time, not module load — a module-scope call throws via assertEnv() during
  // `next build` page-data collection (no env), which was a deploy-breaker.
  const supabase = createServerComponentClient();

  // Check cache first (deals table has mmr_value)
  const { data: cached } = await supabase
    .from("deals")
    .select("mmr_value, updated_at")
    .eq("vin", vin)
    .not("mmr_value", "is", null)
    .gte("updated_at", new Date(Date.now() - 86400000).toISOString()) // 24hr cache
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle(); // a VIN can have 0 or many deal rows — .single() errored on both

  if (cached?.mmr_value) {
    return NextResponse.json({
      vin,
      marketValue: cached.mmr_value,
      source: "cache",
    });
  }

  // Fallback when MarketCheck isn't configured: derive an estimate from
  // comparable rows already in our `deals` table. No synthetic depreciation.
  if (!process.env.MARKETCHECK_API_KEY) {
    let year: number | null = null;
    let make: string | null = null;
    let model: string | null = null;
    try {
      const vinRes = await fetch(`${req.nextUrl.origin}/api/vin/${vin}`);
      if (vinRes.ok) {
        const decoded = await vinRes.json();
        if (decoded.year) year = Number(decoded.year);
        if (decoded.make) make = decoded.make;
        if (decoded.model) model = decoded.model;
      }
    } catch {}

    // Without a real make/model we cannot find comparables — report honestly.
    if (!make || !model) {
      return NextResponse.json({
        vin,
        available: false,
        source: "no_comparables",
        note: "MarketCheck API key not configured and VIN could not be decoded for comparables.",
      });
    }

    let comps = supabase
      .from("deals")
      .select("ask_price, year")
      .ilike("make", make)
      .ilike("model", model)
      .not("ask_price", "is", null)
      .eq("active", true);

    // Constrain to a +/- 2 model-year band when the year is known.
    if (year) {
      comps = comps.gte("year", year - 2).lte("year", year + 2);
    }

    const { data: rows } = await comps.limit(200);
    const prices = (rows ?? [])
      .map((r: any) => r.ask_price)
      .filter((p: any) => typeof p === "number" && p > 1000);

    if (prices.length === 0) {
      return NextResponse.json({
        vin,
        available: false,
        source: "no_comparables",
        model_derived: `${year ?? ""} ${make} ${model}`.trim(),
        note: "No comparable deals found to estimate a value.",
      });
    }

    const marketValue = Math.round(
      prices.reduce((a: number, b: number) => a + b, 0) / prices.length,
    );

    return NextResponse.json({
      vin,
      marketValue,
      comparables: prices.length,
      source: "deals_comparables",
      model_derived: `${year ?? ""} ${make} ${model}`.trim(),
      note: "Estimated from average ask price of comparable deals in DealerHunt.",
    });
  }

  try {
    const res = await fetch(
      `https://marketcheck-prod.apigee.net/v2/search/car/active?api_key=${process.env.MARKETCHECK_API_KEY}&vin=${vin}&rows=10`,
      { next: { revalidate: 3600 } },
    );

    if (!res.ok) throw new Error(`MarketCheck ${res.status}`);

    const data = await res.json();
    const prices =
      data.deals?.map((l: any) => l.price).filter((p: number) => p > 1000) ||
      [];

    if (!prices.length) {
      return NextResponse.json({ vin, marketValue: null, source: "no_deals" });
    }

    const marketValue = Math.round(
      prices.reduce((a: number, b: number) => a + b, 0) / prices.length,
    );

    return NextResponse.json({
      vin,
      marketValue,
      comparables: prices.length,
      avgDaysOnMarket: data.deals?.[0]?.dom || null,
      source: "marketcheck",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "MarketCheck API error", vin },
      { status: 500 },
    );
  }
}
