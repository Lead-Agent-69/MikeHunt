export const dynamic = "force-dynamic";
import { AUCTION_DB_SOURCES } from "@/lib/discovery/auction-scope";
import { nearQueryLock } from "@/lib/discovery/near-lock";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { categorize } from "@/lib/discovery/categorize";
import { sellerContactFields } from "@/lib/data/deal-contact";
import { haversineMiles, boundingBox } from "@/lib/geo/distance";
import { geocodeZip } from "@/lib/geo/geocode";
import {
  listingsForDesk,
  resolveCallerFlipDesk,
} from "@/lib/deals/deal-desk-access";

// GET /api/deals/near?verdict=go&radius=
// State-locked. A ZIP or saved home state is required. Miles never cross that
// state, and a missing radius is not a 150mi net.
function mapDeal(d: any, distanceMiles: number | null) {
  const tags = categorize({ ...d, sellBasis: d.deal_analysis?.sellBasis });
  const miles =
    distanceMiles != null && Number.isFinite(distanceMiles)
      ? Math.round(distanceMiles)
      : null;
  return {
    id: d.id,
    source: d.source,
    sourceUrl: d.source_url,
    ...sellerContactFields(d),
    title: d.title || `${d.year || ""} ${d.make || ""} ${d.model || ""}`.trim(),
    year: d.year,
    make: d.make,
    model: d.model,
    vin: d.vin,
    mileage: d.mileage,
    condition: d.condition,
    askPrice: Number(d.ask_price || 0),
    sellEstimate: d.sell_estimate != null ? Number(d.sell_estimate) : undefined,
    profitScore: d.profit_score != null ? Number(d.profit_score) : undefined,
    trueNetProfit:
      d.true_net_profit != null ? Number(d.true_net_profit) : undefined,
    recommendedMaxBid:
      d.recommended_max_bid != null ? Number(d.recommended_max_bid) : undefined,
    dealVerdict: d.deal_verdict,
    locationCity: d.location_city,
    locationState: d.location_state,
    images: d.images || [],
    ...tags,
    alsoOn: [],
    listingCount: 1,
    ...(miles != null ? { distanceMiles: miles } : {}),
    winReason: miles != null ? `${miles} mi from you` : "In your state",
  };
}

export async function GET(req: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id) return NextResponse.json({ deals: [] });

  const supabase = createServerComponentClient();
  const [{ data: profile }, prefsRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("home_lat, home_lng, home_state, home_zip")
      .eq("id", user.id)
      .maybeSingle(),
    Promise.resolve(
      supabase
        .from("user_preferences")
        .select("prefs")
        .eq("user_id", user.id)
        .maybeSingle(),
    ).catch(() => ({ data: null })),
  ]);
  // Settings/onboarding write "where you live" to prefs.homeLocation; it wins over the
  // legacy user_profiles columns.
  const prefsHomeLocation = (
    (prefsRes as { data?: { prefs?: { homeLocation?: unknown } } | null })?.data
      ?.prefs ?? null
  )?.homeLocation;

  const sp = new URL(req.url).searchParams;
  const verdict = sp.get("verdict") || "go";
  const zip = sp.get("zip");
  const lock = nearQueryLock({
    zip,
    prefsHomeLocation,
    radiusParam: sp.get("radius"),
    homeState: profile?.home_state,
    homeZip: profile?.home_zip,
    homeLat: profile?.home_lat != null ? Number(profile.home_lat) : null,
    homeLng: profile?.home_lng != null ? Number(profile.home_lng) : null,
  });
  if (!lock.state) {
    return NextResponse.json({ deals: [], needsState: true });
  }

  // Distance center: the query ZIP, else the saved prefs home ZIP, else the profile pin —
  // but only when that pin is in the locked state (never measure from an old home elsewhere).
  const profileState = String(profile?.home_state || "")
    .trim()
    .toUpperCase();
  const profilePinUsable =
    lock.from === "profile" ||
    (lock.from === "prefs" && !lock.homeZip && profileState === lock.state);
  let centerLat =
    profilePinUsable && profile?.home_lat != null
      ? Number(profile.home_lat)
      : null;
  let centerLng =
    profilePinUsable && profile?.home_lng != null
      ? Number(profile.home_lng)
      : null;
  const centerZip = zip || (lock.from === "prefs" ? lock.homeZip : undefined);
  if (centerZip) {
    const c = await geocodeZip(supabase, { zip: centerZip });
    if (c) {
      centerLat = c.lat;
      centerLng = c.lng;
    }
  }
  const canMeasure = centerLat != null && centerLng != null;
  if (lock.radius > 0 && !canMeasure)
    return NextResponse.json({ deals: [], needsLocation: true });

  let q = supabase
    .from("deals")
    .select(
      "id, source, source_url, options, title, year, make, model, vin, mileage, condition, ask_price, sell_estimate, deal_analysis, profit_score, true_net_profit, recommended_max_bid, deal_verdict, location_city, location_state, images, lat, lng",
    )
    .eq("active", true)
    .eq("location_state", lock.state)
    .not("source", "in", `(${AUCTION_DB_SOURCES.join(",")})`)
    .gt("ask_price", 0);
  if (verdict && verdict !== "all") q = q.eq("deal_verdict", verdict);
  // An explicit radius narrows inside the locked state. It never adds neighbor states.
  if (lock.radius > 0 && canMeasure) {
    const bb = boundingBox(
      centerLat as number,
      centerLng as number,
      lock.radius,
    );
    q = q
      .not("lat", "is", null)
      .gte("lat", bb.minLat)
      .lte("lat", bb.maxLat)
      .gte("lng", bb.minLng)
      .lte("lng", bb.maxLng);
  }
  q = q.limit(500);

  const { data: rows } = await q;

  const withDist: { d: any; miles: number | null }[] = [];
  for (const r of rows || []) {
    if (String(r.location_state || "").toUpperCase() !== lock.state) continue;
    let miles: number | null = null;
    if (canMeasure && r.lat != null && r.lng != null) {
      miles = haversineMiles(
        centerLat as number,
        centerLng as number,
        Number(r.lat),
        Number(r.lng),
      );
      if (miles == null) miles = null;
      if (lock.radius > 0 && (miles == null || miles > lock.radius)) continue;
    } else if (lock.radius > 0) {
      continue;
    }
    withDist.push({ d: r, miles });
  }
  withDist.sort((a, b) => {
    if (a.miles == null && b.miles == null) return 0;
    if (a.miles == null) return 1;
    if (b.miles == null) return -1;
    return a.miles - b.miles;
  });

  // NearbyDeals is mostly personal buyers: flip economics and seller contact only for a saved
  // reseller / dealer desk.
  const flipDesk = await resolveCallerFlipDesk();
  const deals = listingsForDesk(
    withDist.slice(0, 24).map(({ d, miles }) => mapDeal(d, miles)),
    flipDesk,
  );
  return NextResponse.json(
    { deals, state: lock.state, deskAccess: flipDesk ? "flip" : "personal" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
