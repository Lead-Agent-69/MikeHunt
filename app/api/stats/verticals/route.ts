export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";

// GET /api/stats/verticals — headline live counts for the public landing. Cars only: active deals +
// GO-verdict deals, plus a few recent GO deals for the live scrolling background feed. Public, read-only,
// count-only (no row data). Degrades to nulls if a table is missing so the landing never breaks.
export async function GET() {
  let cars: { active: number; go: number } | null = null;
  try {
    const sb = createServerComponentClient();
    const [active, go] = await Promise.all([
      sb
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .is("duplicate_of_id", null), // canonical rows only (cross-source dedup)
      sb
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .is("duplicate_of_id", null) // canonical rows only (cross-source dedup)
        .eq("deal_verdict", "go"),
    ]);
    cars = { active: active.count || 0, go: go.count || 0 };
  } catch {
    cars = null;
  }

  // A few recent GO deals for the live scrolling background feed on the landing.
  type FeedItem = {
    kind: "car";
    text: string; // title (year make model)
    sub: string; // "$X · ST"
    loc: string; // "City, ST" — the prominent location line
    price: string; // formatted price
    image: string | null; // real photo
    lat?: number | null;
    lng?: number | null;
  };
  let feed: FeedItem[] = [];
  try {
    const sb = createServerComponentClient();
    const { data: carRows } = await sb
      .from("deals")
      .select(
        "year, make, model, ask_price, location_city, location_state, images, lat, lng",
      )
      .eq("active", true)
      .is("duplicate_of_id", null) // canonical rows only (cross-source dedup)
      .eq("deal_verdict", "go")
      .not("images", "is", null)
      .order("last_seen_at", { ascending: false })
      .limit(40);

    const money = (n?: number | null) =>
      n ? `$${Math.round(n).toLocaleString()}` : "";
    const loc = (city?: string | null, state?: string | null) =>
      [city, state].filter(Boolean).join(", ");

    // De-dupe by text+price so the same listing never repeats down the scroll.
    const seen = new Set<string>();
    for (const d of carRows || []) {
      const text = `${d.year || ""} ${d.make || ""} ${d.model || ""}`
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      const sub = [money(d.ask_price), d.location_state]
        .filter(Boolean)
        .join(" · ");
      const key = `${text}|${sub}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      feed.push({
        kind: "car",
        text,
        sub,
        loc: loc(d.location_city, d.location_state),
        price: money(d.ask_price),
        image: Array.isArray(d.images) && d.images[0] ? d.images[0] : null,
        lat: d.lat,
        lng: d.lng,
      });
      if (feed.length >= 12) break;
    }
  } catch {
    feed = [];
  }

  return NextResponse.json({ cars, feed });
}
