// app/api/preferences/route.ts — user view preferences. GET returns the user's prefs object; PUT MERGES a
// partial update in. Auth via cookies; RLS scopes every row to its owner.

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id) return NextResponse.json({ prefs: {}, authed: false });

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
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let patch: Record<string, unknown> = {};
  try {
    patch = (await req.json()) || {};
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof patch !== "object" || Array.isArray(patch))
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });

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
