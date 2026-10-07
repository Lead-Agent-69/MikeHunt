export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import { parseMapVerdicts } from "@/lib/deals/map-verdict";
import { STATE_COORDS } from "@/lib/geo";
import { fetchAllRows } from "@/lib/db/paginate";
import { hashJitter } from "@/lib/db/stable-id";

// GET /api/deals/map?verdict=actionable&limit= — active deals as map points. Precise geocoded coords
// when we have them, else a STATE CENTROID fallback (with deterministic jitter so a state's deals
// spread out instead of stacking) — so the map reflects ALL located inventory, not just geocoded.

const money = (v: any) => `$${Math.round(Number(v) || 0).toLocaleString()}`;

// Stable per-id offset in [-0.4, 0.4]° so centroid points don't collapse onto one marker.
const jitter = (id: string, salt: number) => hashJitter(id, salt, 0.4);

// Marker color encodes the verdict: GO = green ("private"), HOLD = amber ("auction"), else blue.
function typeForVerdict(v: string): "private" | "auction" | "dealer" {
  if (v === "go") return "private";
  if (v === "hold") return "auction";
  return "dealer";
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "deals-map", limit: 30, windowMs: 60000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const sp = new URL(req.url).searchParams;
  const verdictFilter = parseMapVerdicts(sp.get("verdict"));
  const limit = Math.min(
    2000,
    Math.max(1, parseInt(sp.get("limit") || "1000", 10) || 1000),
  );

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ points: [], count: 0, configured: false });
  }

  const supabase = createServerComponentClient();
  // Page past the PostgREST 1000-row cap so the map reflects ALL located inventory up to `limit`
  // (a single .limit() silently dropped everything past 1000).
  let data: any[];
  try {
    data = await fetchAllRows<any>(
      (from, to) => {
        let q = supabase
          .from("deals")
          .select(
            "id, year, make, model, ask_price, true_net_profit, deal_verdict, lat, lng, location_city, location_state",
          )
          .eq("active", true)
          // A point needs EITHER precise coords OR a state we can fall back to a centroid for.
          .or("lat.not.is.null,location_state.not.is.null")
          .gt("ask_price", 0)
          .order("profit_score", { ascending: false, nullsFirst: false })
          .range(from, to);
        if (verdictFilter.mode === "eq") {
          q = q.eq("deal_verdict", verdictFilter.values[0]);
        } else if (verdictFilter.mode === "in") {
          q = q.in("deal_verdict", verdictFilter.values);
        }
        return q;
      },
      { max: limit },
    );
  } catch (error) {
    // Honest empty map (200) beats a 500 — /find's shared fetcher throws on !ok.
    console.error(
      "[deals-map]",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({
      points: [],
      count: 0,
      degraded: true,
      deskAccess: "personal",
    });
  }

  let flipDesk = false;
  try {
    flipDesk = await resolveCallerFlipDesk();
  } catch {
    flipDesk = false;
  }

  const points = (data || [])
    .map((d: any) => {
      let lat: number | null = null;
      let lng: number | null = null;
      let approx = false;
      if (d.lat != null && d.lng != null) {
        lat = Number(d.lat);
        lng = Number(d.lng);
      } else {
        const c = STATE_COORDS[(d.location_state || "").toUpperCase()];
        if (c) {
          lat = c.lat + jitter(d.id, 1);
          lng = c.lon + jitter(d.id, 2);
          approx = true;
        }
      }
      if (lat == null || lng == null) return null;
      const place = d.location_city
        ? ` · ${d.location_city}, ${d.location_state || ""}`
        : d.location_state
          ? ` · ${d.location_state}`
          : "";
      // Profit only in the label for a flip desk; personal buyers see ask + place.
      const label = flipDesk
        ? `${money(d.ask_price)} · ${Number(d.true_net_profit) >= 0 ? "+" : ""}${money(d.true_net_profit)} profit${place}`
        : `${money(d.ask_price)}${place}`;
      return {
        id: d.id,
        name: `${d.year} ${d.make} ${d.model}`.trim(),
        lat,
        lng,
        approx,
        url: `/deal/${encodeURIComponent(d.id)}`,
        price: Number(d.ask_price) || undefined, // → Zillow-style price-pill marker
        type: typeForVerdict(d.deal_verdict),
        label,
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    points,
    count: points.length,
    deskAccess: flipDesk ? "flip" : "personal",
  });
}
