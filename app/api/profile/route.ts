export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { geocodePlace } from "@/lib/geo/geocode";

export async function GET() {
  const supabase = createServerComponentClient();
  const {
    data: { user },
    error: authError,
  } = await getServerUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

  return NextResponse.json({ profile });
}

export async function POST(req: NextRequest) {
  const supabase = createServerComponentClient();
  const {
    data: { user },
    error: authError,
  } = await getServerUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Use the fields provided, don't overwrite with nulls if omitted
  const updates = {
    id: user.id,
    ...(body.name !== undefined && { name: body.name }),
    ...(body.phone !== undefined && { phone: body.phone }),
    ...(body.city !== undefined && { city: body.city }),
    ...(body.state !== undefined && { state: body.state }),
    ...(body.home_state !== undefined && { home_state: body.home_state }),
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
    updated_at: new Date().toISOString(),
  };

  // Geocode the dealer's home when their location changes, so saved-search radius matching and
  // "deals near me" work. Best-effort — a lookup failure just leaves home coords unchanged.
  if (
    body.home_zip !== undefined ||
    body.home_state !== undefined ||
    body.city !== undefined
  ) {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile });
}
