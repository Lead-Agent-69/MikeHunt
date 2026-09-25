export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { z } from "zod";

const watchlistSchema = z.object({
  deal_id: z.string().uuid(),
  alert_threshold: z.number().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerComponentClient();

    // Get user from session (simplified for now)
    const {
      data: { user },
      error: authError,
    } = await getServerUser();

    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { deal_id, alert_threshold, notes } = watchlistSchema.parse(body);

    // Check if already in watchlist
    const { data: existing } = await supabase
      .from("watchlist")
      .select("id")
      .eq("user_id", user.id)
      .eq("deal_id", deal_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Already in watchlist" },
        { status: 409 },
      );
    }

    // Add to watchlist
    const { data, error } = await supabase
      .from("watchlist")
      .insert({
        user_id: user.id,
        deal_id,
        alert_threshold,
        notes,
      })
      .select(
        `
        *,
        deal:deal_id (
          id, title, year, make, model, ask_price, 
          profit_estimate, images, source_url
        )
      `,
      )
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Watchlist error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await getServerUser();

    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all";

    let query = supabase
      .from("watchlist")
      .select(
        `
        *,
        deal:deal_id (
          id, title, year, make, model, ask_price, 
          profit_estimate, images, source_url, auction_end_at
        )
      `,
      )
      .eq("user_id", user.id);

    // Apply filters
    if (filter === "price_drops") {
      // This would need price history join - simplified for now
      query = query;
    } else if (filter === "ending_soon") {
      query = query.lte(
        "deal.auction_end_at",
        new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      );
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Watchlist fetch error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await getServerUser();

    if (!user || authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const deal_id = searchParams.get("deal_id");

    if (!deal_id) {
      return NextResponse.json({ error: "deal_id required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("watchlist")
      .delete()
      .eq("user_id", user.id)
      .eq("deal_id", deal_id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Watchlist delete error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
