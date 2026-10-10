// app/api/find-similar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  listingsForDesk,
  resolveCallerFlipDesk,
} from "@/lib/deals/deal-desk-access";
import {
  FIND_SIMILAR_SELECT,
  escapeLike,
  FIND_SIMILAR_MAX_TERM,
  pickFindSimilarColumns,
  withNoStore,
} from "@/lib/deals/find-similar-columns";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const rl = rateLimit(request, {
      key: "find-similar",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) return withNoStore(tooManyRequests(rl));

    const supabase = createServerComponentClient();
    const { searchParams } = new URL(request.url);

    const make = searchParams.get("make")?.trim() || "";
    const model = searchParams.get("model")?.trim() || "";
    const year = parseInt(searchParams.get("year") || "0");
    const price = parseFloat(searchParams.get("price") || "0");
    const mileage = parseInt(searchParams.get("mileage") || "0");

    if (!make || !model) {
      return withNoStore(
        NextResponse.json(
          { error: "make and model are required" },
          { status: 400 },
        ),
      );
    }

    if (
      make.length > FIND_SIMILAR_MAX_TERM ||
      model.length > FIND_SIMILAR_MAX_TERM
    ) {
      return withNoStore(
        NextResponse.json({ error: "make or model too long" }, { status: 400 }),
      );
    }
    // First word of the model, matched literally (no user-supplied % / _ wildcards).
    const modelTerm = escapeLike(model.split(/\s+/)[0] || "");
    if (!modelTerm) {
      return withNoStore(
        NextResponse.json(
          { error: "make and model are required" },
          { status: 400 },
        ),
      );
    }

    // Heuristics:
    // 1. Year +/- 2 years
    // 2. Price <= 115% of original price (or +/- 20% if low price)
    // 3. Mileage <= original + 30,000 miles
    // 4. Sort by profit score descending
    const yearMin = year > 0 ? year - 2 : 1990;
    const yearMax = year > 0 ? year + 2 : 2030;
    // ask_price / mileage are integer columns: a fractional bound (90200 * 1.15 =
    // 103730.00000000001) makes Postgres reject the filter with a 500.
    const priceMax = price > 0 ? Math.round(price * 1.15) : 1000000;
    const mileageMax = mileage > 0 ? Math.round(mileage + 30000) : 300000;

    let query = supabase
      .from("deals")
      .select(FIND_SIMILAR_SELECT)
      .eq("active", true)
      .eq("make", make)
      .ilike("model", `%${modelTerm}%`) // match first word of model resiliently
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

    const flipDesk = await resolveCallerFlipDesk();
    const rows = ((data || []) as unknown as Record<string, unknown>[]).map(
      pickFindSimilarColumns,
    );
    return withNoStore(NextResponse.json(listingsForDesk(rows, flipDesk)));
  } catch (error: any) {
    console.error("[FIND-SIMILAR-API] GET error:", error);
    return withNoStore(
      NextResponse.json(
        { error: "Failed to find similar vehicles" },
        { status: 500 },
      ),
    );
  }
}
