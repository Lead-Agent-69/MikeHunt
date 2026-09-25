import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

// Per-deal private dealer notes — backed by the existing watchlist.notes column (unique per
// user+deal, RLS-protected), so no schema change. GET reads this dealer's note for the deal; PUT
// upserts it. Saving a note quietly keeps the car on the dealer's radar, which is the point of a note.

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const {
    data: { user },
  } = await getServerUser();
  if (!user) return NextResponse.json({ note: "" });
  const sb = createServerComponentClient();
  const { data } = await sb
    .from("watchlist")
    .select("notes")
    .eq("user_id", user.id)
    .eq("deal_id", id)
    .maybeSingle();
  return NextResponse.json({ note: data?.notes || "" });
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const {
    data: { user },
  } = await getServerUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.slice(0, 4000) : "";
  const sb = createServerComponentClient();
  const { error } = await sb
    .from("watchlist")
    .upsert(
      { user_id: user.id, deal_id: id, notes: note },
      { onConflict: "user_id,deal_id" },
    );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note });
}
