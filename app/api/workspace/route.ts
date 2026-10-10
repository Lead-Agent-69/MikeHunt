import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-supabase";
import { createServerComponentClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Free customer access only. Never writes billing, identity, roles or admin claims.
export async function PUT(req: NextRequest) {
  const {
    data: { user },
    error: authError,
  } = await getServerUser();
  if (authError || !user?.id)
    return NextResponse.json(
      { error: "Sign in to choose your workspace." },
      { status: 401 },
    );
  let mode: unknown;
  try {
    mode = (await req.json()).workspaceMode;
  } catch {
    /* invalid body */
  }
  if (mode !== "focused" && mode !== "expanded")
    return NextResponse.json(
      { error: "Choose focused or expanded." },
      { status: 400 },
    );
  const sb = createServerComponentClient();
  const { data: existing, error: readError } = await sb
    .from("user_preferences")
    .select("prefs")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError)
    return NextResponse.json(
      { error: "Your workspace could not be loaded. Try again." },
      { status: 503 },
    );
  const prefs = {
    ...(existing?.prefs || {}),
    workspaceMode: mode,
    workspaceAccess: "community",
  };
  const { data, error } = await sb
    .from("user_preferences")
    .upsert(
      {
        user_id: user.id,
        prefs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("user_id,prefs")
    .single();
  if (
    error ||
    data?.user_id !== user.id ||
    data?.prefs?.workspaceMode !== mode ||
    data?.prefs?.workspaceAccess !== "community"
  )
    return NextResponse.json(
      {
        error:
          "Your workspace change was not confirmed. Reload before retrying.",
      },
      { status: 503 },
    );
  return NextResponse.json({ prefs: data.prefs, authed: true });
}
