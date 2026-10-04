export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

// Honest inventory count for the Discover header. This does not sum profit and
// does not cap a hidden dollar total.
export async function GET(req: NextRequest) {
  const state = new URL(req.url).searchParams.get("state") || "";
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      listingCount: 0,
      state: state || "Nationwide",
      featured: null,
      configured: false,
    });
  }

  const supabase = createServerComponentClient();
  let q = supabase
    .from("deals")
    .select(
      "id, year, make, model, ask_price, location_city, location_state, source",
      { count: "exact" },
    )
    .eq("active", true)
    .gt("ask_price", 0)
    .order("last_seen_at", { ascending: false })
    .limit(1);
  if (state) q = q.eq("location_state", state);

  const { data, count, error } = await q;
  if (error) {
    return NextResponse.json({
      listingCount: 0,
      state: state || "Nationwide",
      featured: null,
    });
  }

  const row = (data || [])[0];
  const featured = row
    ? {
        id: row.id,
        year: row.year ?? null,
        make: row.make ?? null,
        model: row.model ?? null,
        ask: Math.round(Number(row.ask_price) || 0),
        city: row.location_city || null,
        state: row.location_state || null,
        source: row.source || null,
      }
    : null;

  return NextResponse.json({
    listingCount: count ?? (featured ? 1 : 0),
    state: state || "Nationwide",
    featured,
  });
}
