import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const { id } = await params;
    const supabase = createServerComponentClient();

    const { data, error } = await supabase
      .from("price_history")
      .select("price, observed_at")
      .eq("deal_id", id)
      .order("observed_at", { ascending: true });

    if (error || !data) {
      // Degrade gracefully — the sparkline just shows the "tracking" state.
      return NextResponse.json([], { status: 200 });
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
    return NextResponse.json([], { status: 200 });
  }
}
