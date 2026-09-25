// app/api/find-similar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const rl = rateLimit(request, {
      key: "find-similar",
      limit: 90,
      windowMs: 60_000,
    });
    if (!rl.allowed) return tooManyRequests(rl);

    const supabase = createServerComponentClient();
    const { searchParams } = new URL(request.url);

    const make = searchParams.get("make");
    const model = searchParams.get("model");
    const year = parseInt(searchParams.get("year") || "0");
    const price = parseFloat(searchParams.get("price") || "0");
    const mileage = parseInt(searchParams.get("mileage") || "0");

    if (!make || !model) {
      return NextResponse.json(
        { error: "make and model are required" },
        { status: 400 },
      );
    }

    // Heuristics:
    // 1. Year +/- 2 years
    // 2. Price <= 115% of original price (or +/- 20% if low price)
    // 3. Mileage <= original + 30,000 miles
    // 4. Sort by profit score descending
    const yearMin = year > 0 ? year - 2 : 1990;
    const yearMax = year > 0 ? year + 2 : 2030;
    const priceMax = price > 0 ? price * 1.15 : 1000000;
    const mileageMax = mileage > 0 ? mileage + 30000 : 300000;

    let query = supabase
      .from("deals")
      .select("*")
      .eq("active", true)
      .eq("make", make)
      .ilike("model", `%${model.split(" ")[0]}%`) // match first word of model resiliently
      .gte("year", yearMin)
      .lte("year", yearMax);

    if (price > 0) {
      query = query.lte("ask_price", priceMax);
    }
    if (mileage > 0) {
      query = query.lte("mileage", mileageMax);
    }

    const { data, error } = await query
      .order("profit_score", { ascending: false, nullsFirst: false })
      .limit(10);

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("[FIND-SIMILAR-API] GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to find similar vehicles" },
      { status: 500 },
    );
  }
}
