// app/api/preferences/route.ts — user view preferences. GET returns the user's prefs object; PUT MERGES a
// partial update in. Auth via cookies; RLS scopes every row to its owner.

import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

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
  } = await getServerUser();
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
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefs: data?.prefs || {}, authed: true });
}

export async function PUT(req: NextRequest) {
  let patch: Record<string, unknown> = {};
  try {
    patch = (await req.json()) || {};
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof patch !== "object" || Array.isArray(patch))
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (!isSupabaseConfigured()) {
    return guestPrefsResponse({ ...readGuestPrefs(req), ...patch });
  }

  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return guestPrefsResponse({ ...readGuestPrefs(req), ...patch });

  const sb = createServerComponentClient();
  // Merge server-side so one app's save never drops another's keys.
  const { data: existing } = await sb
    .from("user_preferences")
    .select("prefs")
    .eq("user_id", user.id)
    .maybeSingle();
  const merged = { ...((existing?.prefs as object) || {}), ...patch };

  const { error } = await sb.from("user_preferences").upsert(
    {
      user_id: user.id,
      prefs: merged,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ prefs: merged });
}
