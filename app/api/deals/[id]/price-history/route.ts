import { NextRequest, NextResponse } from "next/server";
import { correctedPriceHistoryCutoff } from "@/lib/data-quality/dealer-correction";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Price history is temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    const { id } = await params;
    const supabase = createServerComponentClient();

    const current = await supabase
      .from("deals")
      .select("source_url,options")
      .eq("id", id)
      .maybeSingle();
    if (current.error) throw new Error("Current price provenance unavailable");
    const cutoff = correctedPriceHistoryCutoff(current.data);

    let query = supabase
      .from("price_history")
      .select("price, observed_at")
      .eq("deal_id", id);
    // Keep the original imports for audit, but never chart parser mistakes as
    // genuine seller price changes after a verified correction.
    if (cutoff) query = query.gte("observed_at", cutoff);
    const { data, error } = await query.order("observed_at", {
      ascending: true,
    });

    if (error || !data) {
      return NextResponse.json(
        { error: "Price history is temporarily unavailable." },
        { status: 503 },
      );
    }

    const points = data.map(
      (row: { price: number | string; observed_at: string }) => ({
        price: Number(row.price),
        observedAt: row.observed_at,
      }),
    );

    return NextResponse.json(points);
  } catch (error) {
    console.error("Error in price-history API:", error);
    return NextResponse.json(
      { error: "Price history is temporarily unavailable." },
      { status: 503 },
    );
  }
}
