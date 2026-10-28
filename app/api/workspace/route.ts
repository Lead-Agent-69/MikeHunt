import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-supabase";
import { createServerComponentClient } from "@/lib/supabase";

import { savePreferencesAtomically } from "@/lib/preferences/atomic-save";

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
  try {
    const saved = await savePreferencesAtomically(sb, user.id, (existing) => ({
      ...existing,
      workspaceMode: mode,
      workspaceAccess: "community",
    }));
    if (
      saved.prefs.workspaceMode !== mode ||
      saved.prefs.workspaceAccess !== "community"
    )
      throw new Error("Unconfirmed workspace");
    return NextResponse.json({ prefs: saved.prefs, authed: true });
  } catch {
    return NextResponse.json(
      {
        error:
          "Your workspace change was not confirmed. Reload before retrying.",
      },
      { status: 503 },
    );
  }
}
