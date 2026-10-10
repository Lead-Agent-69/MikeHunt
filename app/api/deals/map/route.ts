export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import { parseMapVerdicts } from "@/lib/deals/map-verdict";
import { enforceGoProfitFloor } from "@/lib/scoring/go-policy";
import { applyGoVerdictFilter } from "@/lib/search/go-verdict-filter";
import { STATE_COORDS } from "@/lib/geo";
import { fetchAllRows } from "@/lib/db/paginate";
import { hashJitter } from "@/lib/db/stable-id";
import { applyInventoryViewScope } from "@/lib/search/inventory-view-scope";
import { validateInventoryRanges } from "@/lib/search/inventory-filters";
import { coarseCoord, withNoStore } from "@/lib/deals/find-similar-columns";
import { titleCategory, titleSourceOf } from "@/lib/deals/title-category";

// GET /api/deals/map?verdict=actionable&limit= — active deals as map points. Precise geocoded coords
// when we have them, else a STATE CENTROID fallback (with deterministic jitter so a state's deals
// spread out instead of stacking) — so the map reflects ALL located inventory, not just geocoded.

const money = (v: any) => `$${Math.round(Number(v) || 0).toLocaleString()}`;

// Stable per-id offset in [-0.4, 0.4]° so centroid points don't collapse onto one marker.
const jitter = (id: string, salt: number) => hashJitter(id, salt, 0.4);

function isoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const ms = new Date(value as string).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// Marker color encodes the verdict: GO = green ("private"), HOLD = amber ("auction"), else blue.
function typeForVerdict(v: string): "private" | "auction" | "dealer" {
  if (v === "go") return "private";
  if (v === "hold") return "auction";
  return "dealer";
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "deals-map", limit: 30, windowMs: 60000 });
  if (!rl.allowed) return withNoStore(tooManyRequests(rl));

  const sp = new URL(req.url).searchParams;
  const rangeError = validateInventoryRanges(sp);
  if (rangeError)
    return withNoStore(
      NextResponse.json({ error: rangeError }, { status: 400 }),
    );
  const limit = Math.min(
    2000,
    Math.max(1, parseInt(sp.get("limit") || "1000", 10) || 1000),
  );

  if (!isSupabaseConfigured()) {
    return withNoStore(
      NextResponse.json({ points: [], count: 0, configured: false }),
    );
  }

  const supabase = createServerComponentClient();
  let flipDesk = false;
  try {
    flipDesk = await resolveCallerFlipDesk();
  } catch {
    flipDesk = false;
  }
  const verdictFilter = parseMapVerdicts(flipDesk ? sp.get("verdict") : "all");
  // Page past the PostgREST 1000-row cap so the map reflects ALL located inventory up to `limit`
  // (a single .limit() silently dropped everything past 1000).
  let data: any[];
  try {
    data = await fetchAllRows<any>(
      (from, to) => {
        let q = supabase
          .from("deals")
          .select(
            "id, year, make, model, ask_price, true_net_profit, deal_verdict, lat, lng, location_city, location_state, condition, damage_type, last_seen_at, title_source:options->>titleSource",
          )
          .eq("active", true)
          // A point needs EITHER precise coords OR a state we can fall back to a centroid for.
          .or("lat.not.is.null,location_state.not.is.null")
          .order(flipDesk ? "profit_score" : "last_seen_at", {
            ascending: false,
            nullsFirst: false,
          })
          .order("id", { ascending: true })
          .range(from, to);
        q = applyInventoryViewScope(q, sp);
        if (verdictFilter.mode === "eq") {
          q = applyGoVerdictFilter(q, verdictFilter.values[0]);
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
    return withNoStore(
      NextResponse.json({
        points: [],
        count: 0,
        degraded: true,
        deskAccess: "personal",
      }),
    );
  }

  const points = (data || [])
    .map((d: any) => {
      let lat: number | null = null;
      let lng: number | null = null;
      let approx = false;
      if (
        d.lat != null &&
        d.lng != null &&
        Number.isFinite(Number(d.lat)) &&
        Number.isFinite(Number(d.lng)) &&
        Math.abs(Number(d.lat)) <= 90 &&
        Math.abs(Number(d.lng)) <= 180
      ) {
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
      const priceText =
        Number(d.ask_price) > 0 ? money(d.ask_price) : "Price not reported";
      const profitText =
        d.true_net_profit == null
          ? "Profit not reported"
          : `${Number(d.true_net_profit) >= 0 ? "+" : ""}${money(d.true_net_profit)} estimated profit`;
      const label = flipDesk
        ? `${priceText} · ${profitText}${place}`
        : `${priceText}${place}`;
      return {
        id: d.id,
        name: `${d.year} ${d.make} ${d.model}`.trim(),
        // ~1 km: never ship a source-exact geocode on this public endpoint.
        lat: coarseCoord(lat),
        lng: coarseCoord(lng),
        approx,
        url: `/deal/${encodeURIComponent(d.id)}`,
        price: Number(d.ask_price) || undefined, // → Zillow-style price-pill marker
        type: flipDesk
          ? typeForVerdict(
              enforceGoProfitFloor(
                d.deal_verdict,
                d.true_net_profit != null ? Number(d.true_net_profit) : null,
              ),
            )
          : "dealer",
        label,
        // Public columns (20261010020000 grants): safe for every desk.
        condition: d.condition ?? null,
        damageType: d.damage_type ?? null,
        titleCategory: titleCategory(d),
        titleSource: titleSourceOf(d),
        // Public column: popups pass it to lib/deals/freshness.ts. Null when unknown, never 1970.
        lastSeenAt: isoOrNull(d.last_seen_at),
      };
    })
    .filter(Boolean);

  return withNoStore(
    NextResponse.json({
      points,
      count: points.length,
      limited: data.length >= limit,
      limit,
      deskAccess: flipDesk ? "flip" : "personal",
    }),
  );
}
