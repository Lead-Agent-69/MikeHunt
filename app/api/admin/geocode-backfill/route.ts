export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolvePlaces, placeKey } from "@/lib/geo/geocode";

// POST /api/admin/geocode-backfill — backfill lat/lng for deals that have a usable location but no
// coordinates. New scrapes geocode inline; this catches existing inventory so the map and radius
// search light up. PLACE-DRIVEN: it dedupes all un-geocoded deals down to distinct places, resolves
// those (cache + negative-cache aware), then bulk-updates every deal in each resolved place. This
// avoids a row-window getting clogged by un-geocodable junk-city data (dealer ad copy, etc.).
//
// Gated by INGEST_SECRET (same shared secret as /api/ingest). Secure-by-default: closed in prod
// until the secret is set. Body: { maxLookups?: number }.
const CORS = { "Access-Control-Allow-Origin": "*" };

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  );
}

export async function POST(req: Request) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Backfill disabled: set INGEST_SECRET to enable." },
        { status: 503, headers: CORS },
      );
    }
  } else if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS },
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const maxLookups = Math.min(200, Math.max(1, Number(body.maxLookups) || 60));

  const supabase = admin();

  // All un-geocoded active deals (small set — a few thousand at most).
  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, location_zip, location_city, location_state")
    .is("lat", null)
    .eq("active", true)
    .limit(5000);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS },
    );
  }
  if (!deals?.length) {
    return NextResponse.json(
      { deals: 0, places: 0, resolved: 0, updated: 0, remaining: 0 },
      { headers: CORS },
    );
  }

  // Group deal ids by canonical place key (one place → many deals).
  const idsByKey = new Map<string, string[]>();
  const placeByKey = new Map<
    string,
    { zip?: string | null; city?: string | null; state?: string | null }
  >();
  for (const d of deals) {
    const place = {
      zip: d.location_zip,
      city: d.location_city,
      state: d.location_state,
    };
    const k = placeKey(place);
    if (!k) continue;
    if (!idsByKey.has(k)) {
      idsByKey.set(k, []);
      placeByKey.set(k, place);
    }
    idsByKey.get(k)!.push(d.id);
  }

  const places = Array.from(placeByKey.values());
  const coords = await resolvePlaces(supabase, places, {
    maxLookups,
    delayMs: 1100, // respect Nominatim ≤1 req/sec
  });

  // Bulk-update every deal in each newly-resolved place.
  let updated = 0;
  for (const [key, ids] of Array.from(idsByKey.entries())) {
    const c = coords.get(key);
    if (!c) continue;
    const { error: upErr, count } = await supabase
      .from("deals")
      .update({ lat: c.lat, lng: c.lng }, { count: "exact" })
      .in("id", ids);
    if (!upErr) updated += count ?? ids.length;
  }

  const { count: remaining } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .is("lat", null)
    .eq("active", true);

  return NextResponse.json(
    {
      deals: deals.length,
      places: placeByKey.size,
      resolved: coords.size,
      updated,
      remaining: remaining ?? null,
    },
    { headers: CORS },
  );
}
