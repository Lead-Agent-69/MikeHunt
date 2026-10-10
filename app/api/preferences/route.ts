// app/api/preferences/route.ts — user view preferences. GET returns the user's prefs object; PUT MERGES a
// partial update in. Auth via cookies; RLS scopes every row to its owner.
// Location saves also stamp locationDemand* and enqueue a terms-safe Zeus scrape_jobs row so the
// new home/search states jump the hybrid buyer queue instead of waiting for the next idle sweep.

import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { sanitizeWatchListPatch } from "@/lib/preferences/watched-dealers";
import { sanitizeLocationPatch } from "@/lib/preferences/locations";
import {
  kickLocationDemand,
  locationDemandPrefsStamp,
  locationPatchTouchesDemand,
} from "@/lib/preferences/kick-location-demand";
import { syncPrefsHomeLocationToProfile } from "@/lib/preferences/sync-home-state";

export const dynamic = "force-dynamic";

const GUEST_PREFS_COOKIE = "mh_guest_prefs";

function readGuestPrefs(req: NextRequest) {
  const raw = req.cookies.get(GUEST_PREFS_COOKIE)?.value;
  if (!raw) return {};
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function guestPrefsResponse(prefs: Record<string, unknown>) {
  const res = NextResponse.json({ prefs, authed: false, local: true });
  res.cookies.set(
    GUEST_PREFS_COOKIE,
    Buffer.from(JSON.stringify(prefs), "utf8").toString("base64url"),
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
      prefs: readGuestPrefs(req),
      authed: false,
      local: true,
    });
  }

  const {
    data: { user },
    error: authError,
  } = await getServerUser();
  if (authError)
    return NextResponse.json({ error: "Account unavailable" }, { status: 503 });
  if (!user?.id)
    return NextResponse.json({
      prefs: readGuestPrefs(req),
      authed: false,
      local: true,
    });

  const sb = createServerComponentClient();
  const { data, error } = await sb
    .from("user_preferences")
    .select("prefs")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[preferences]", error.message);
    return NextResponse.json(
      { error: "Preferences unavailable" },
      { status: 500 },
    );
  }
  return NextResponse.json({ prefs: data?.prefs || {}, authed: true });
}

const MAX_PREFS_BODY_BYTES = 32 * 1024;

export async function PUT(req: NextRequest) {
  let patch: Record<string, unknown> = {};
  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (raw.length > MAX_PREFS_BODY_BYTES)
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  try {
    patch = raw ? JSON.parse(raw) || {} : {};
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof patch !== "object" || Array.isArray(patch))
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const sanitized = sanitizeWatchListPatch(patch);
  if ("error" in sanitized)
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  patch = sanitized.patch;
  const located = sanitizeLocationPatch(patch);
  if ("error" in located)
    return NextResponse.json({ error: located.error }, { status: 400 });
  patch = located.patch;

  const guestMerged = { ...readGuestPrefs(req), ...patch };
  const guestLocation = locationPatchTouchesDemand(patch);

  function guestWithDemand(prefs: Record<string, unknown>) {
    const res = NextResponse.json({
      prefs,
      authed: false,
      local: true,
      ...(guestLocation
        ? { locationDemand: { requiresAuth: true, states: [] as string[] } }
        : {}),
    });
    res.cookies.set(
      GUEST_PREFS_COOKIE,
      Buffer.from(JSON.stringify(prefs), "utf8").toString("base64url"),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 180,
      },
    );
    return res;
  }

  if (!isSupabaseConfigured()) {
    return guestWithDemand(guestMerged);
  }

  const {
    data: { user },
    error: authError,
  } = await getServerUser();
  if (authError)
    return NextResponse.json({ error: "Account unavailable" }, { status: 503 });
  if (!user?.id) return guestWithDemand(guestMerged);

  const sb = createServerComponentClient();
  // Preserve unrelated keys; a failed read must never become an empty baseline.
  const { data: existing, error: readError } = await sb
    .from("user_preferences")
    .select("prefs")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError)
    return NextResponse.json(
      { error: "Preferences unavailable" },
      { status: 503 },
    );
  let merged: Record<string, unknown> = {
    ...((existing?.prefs as object) || {}),
    ...patch,
  };

  let locationDemand: {
    states: string[];
    queued: boolean;
    deduplicated: boolean;
    jobId: string | null;
  } | null = null;

  if (locationPatchTouchesDemand(patch)) {
    const kick = await kickLocationDemand({
      supabase: sb,
      userId: user.id,
      prefs: merged,
    });
    if (kick) {
      merged = { ...merged, ...locationDemandPrefsStamp(kick) };
      locationDemand = {
        states: kick.states,
        queued: kick.queued,
        deduplicated: kick.deduplicated,
        jobId: kick.jobId,
      };
    }
  }

  const { data: saved, error } = await sb
    .from("user_preferences")
    .upsert(
      {
        user_id: user.id,
        prefs: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("user_id,prefs")
    .single();
  if (error || saved?.user_id !== user.id || !saved?.prefs) {
    console.error("[preferences]", error?.message || "Unconfirmed save");
    return NextResponse.json(
      { error: "Preferences unavailable" },
      { status: 500 },
    );
  }

  // Keep legacy user_profiles.home_state aligned with prefs.homeLocation (Arbitrage / Settings).
  if ("homeLocation" in patch) {
    await syncPrefsHomeLocationToProfile({
      supabase: sb,
      userId: user.id,
      homeLocation: patch.homeLocation,
    });
  }

  return NextResponse.json({
    prefs: saved.prefs,
    authed: true,
    ...(locationDemand ? { locationDemand } : {}),
  });
}
