import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
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
    error: authError,
  } = await getServerUser();
  if (authError)
    return NextResponse.json(
      { error: "Your notes could not be loaded. Try again." },
      { status: 503 },
    );
  if (!user)
    return NextResponse.json(
      { error: "Sign in to view your notes." },
      { status: 401 },
    );
  const sb = createServerComponentClient();
  const { data, error } = await sb
    .from("watchlist")
    .select("notes")
    .eq("user_id", user.id)
    .eq("deal_id", id)
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle();
  if (error)
    return internalError(
      "deals:notes:read",
      error,
      "Your notes could not be loaded. Try again.",
      503,
    );
  return NextResponse.json(
    { note: data?.notes || "" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const {
    data: { user },
    error: authError,
  } = await getServerUser();
  if (authError)
    return NextResponse.json(
      { error: "Your note was not confirmed. Try again." },
      { status: 503 },
    );
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.note !== "string")
    return NextResponse.json(
      { error: "Enter a note before saving." },
      { status: 400 },
    );
  const note = body.note.slice(0, 4000);
  const sb = createServerComponentClient();
  const { data, error } = await sb
    .from("watchlist")
    .upsert(
      { user_id: user.id, deal_id: id, notes: note },
      { onConflict: "user_id,deal_id" },
    )
    .select("user_id,deal_id,notes")
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle();
  if (
    error ||
    data?.user_id !== user.id ||
    data?.deal_id !== id ||
    data?.notes !== note
  )
    return internalError(
      "deals:notes:write",
      error || new Error("Unconfirmed note write"),
      "Your note was not confirmed. Your draft is still here; reload before retrying.",
      503,
    );
  return NextResponse.json(
    { note },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
