export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { geocodePlace } from "@/lib/geo/geocode";
import { syncProfileHomeStateToPrefs } from "@/lib/preferences/sync-home-state";
import { discoverHomeState } from "@/lib/discovery/home-state";

const GUEST_PROFILE_COOKIE = "mh_guest_profile";

function readGuestProfile(req: NextRequest) {
  const raw = req.cookies.get(GUEST_PROFILE_COOKIE)?.value;
  if (!raw) return {};
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function guestProfileResponse(profile: Record<string, unknown>) {
  const res = NextResponse.json({ profile, authed: false, local: true });
  res.cookies.set(
    GUEST_PROFILE_COOKIE,
    Buffer.from(JSON.stringify(profile), "utf8").toString("base64url"),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    },
  );
  return res;
}

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      profile: readGuestProfile(req),
      authed: false,
      local: true,
    });
  }

  const supabase = createServerComponentClient();
  const {
    data: { user },
    error: authError,
  } = await getServerUser();

  if (authError || !user) {
    return NextResponse.json({
      profile: readGuestProfile(req),
      authed: false,
      local: true,
    });
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    // If table doesn't exist or row missing, just return defaults rather than 500
    return NextResponse.json({ profile: {} });
  }

  // Settings Dealer Defaults bind profile.home_state; LocationPrefs may only have
  // prefs.homeLocation. Surface the effective home so the dropdown matches "Currently …".
  const columnHome = discoverHomeState(null, profile?.home_state);
  if (!columnHome) {
    const { data: prefRow } = await supabase
      .from("user_preferences")
      .select("prefs")
      .eq("user_id", user.id)
      .maybeSingle();
    const fromPrefs = discoverHomeState(
      (prefRow?.prefs as { homeLocation?: unknown } | null)?.homeLocation,
      null,
    );
    if (fromPrefs) {
      return NextResponse.json({
        profile: { ...profile, home_state: fromPrefs },
      });
    }
  }

  return NextResponse.json({ profile });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return guestProfileResponse({
      ...readGuestProfile(req),
      ...body,
      updated_at: new Date().toISOString(),
    });
  }

  const supabase = createServerComponentClient();
  const {
    data: { user },
    error: authError,
  } = await getServerUser();

  if (authError || !user) {
    return guestProfileResponse({
      ...readGuestProfile(req),
      ...body,
      updated_at: new Date().toISOString(),
    });
  }

  // Use the fields provided, don't overwrite with nulls if omitted
  const updates = {
    id: user.id,
    ...(body.name !== undefined && { name: body.name }),
    ...(body.phone !== undefined && { phone: body.phone }),
    ...(body.city !== undefined && { city: body.city }),
    ...(body.home_state !== undefined && { home_state: body.home_state }),
    ...(body.state !== undefined &&
      body.home_state === undefined && { home_state: body.state }),
    ...(body.auction_fee_default !== undefined && {
      auction_fee_default: body.auction_fee_default,
    }),
    ...(body.recon_cost_default !== undefined && {
      recon_cost_default: body.recon_cost_default,
    }),
    ...(body.daily_floor_rate !== undefined && {
      daily_floor_rate: body.daily_floor_rate,
    }),
    ...(body.target_profit !== undefined && {
      target_profit: body.target_profit,
    }),
    ...(body.notify_price_drops !== undefined && {
      notify_price_drops: body.notify_price_drops,
    }),
    // Personalization inputs (drive the "For You" discover rail).
    ...(body.preferred_makes !== undefined && {
      preferred_makes: body.preferred_makes,
    }),
    ...(body.budget_max !== undefined && { budget_max: body.budget_max }),
    ...(body.budget_min !== undefined && { budget_min: body.budget_min }),
    ...(body.home_zip !== undefined && { home_zip: body.home_zip }),
    // Direct coords from the browser-GPS "Use my location" button (no geocode needed).
    ...(body.home_lat !== undefined &&
      body.home_lng !== undefined && {
        home_lat: body.home_lat,
        home_lng: body.home_lng,
      }),
    ...(body.onboarded !== undefined && { onboarded: body.onboarded }),
  };

  // A state alone is too broad to place precisely. Only resolve a ZIP or city, so profile
  // saves never wait on an external lookup when a user chooses a state during onboarding.
  if (body.home_zip !== undefined || body.city !== undefined) {
    try {
      const coords = await geocodePlace(supabase, {
        zip: body.home_zip,
        city: body.city,
        state: body.state ?? body.home_state,
      });
      if (coords) {
        (updates as any).home_lat = coords.lat;
        (updates as any).home_lng = coords.lng;
      }
    } catch {
      /* non-fatal */
    }
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .upsert(updates)
    .select()
    .single();

  if (error) {
    return internalError("profile", error);
  }

  // scrape_demand reads prefs.homeLocation, not user_profiles.home_state — mirror on change.
  if (body.home_state !== undefined || body.state !== undefined) {
    await syncProfileHomeStateToPrefs({
      supabase,
      userId: user.id,
      homeState: profile?.home_state ?? body.home_state ?? body.state,
      homeZip: body.home_zip ?? profile?.home_zip,
    });
  }

  return NextResponse.json({ profile });
}
