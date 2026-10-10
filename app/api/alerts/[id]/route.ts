export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

// DELETE /api/alerts/[id] — dismiss one inbox row for the signed-in user only.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, configured: false });
  }

  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = createServerComponentClient();
  const { error } = await supabase
    .from("user_feed_inbox")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[alerts/id]", error.message);
    return NextResponse.json({ error: "Could not dismiss" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// PATCH /api/alerts/[id] — thumbs up/down on one of the signed-in user's own alert matches.
// Body: { feedback: 1 | -1 | 0 } (0 clears). Feedback never changes matching on its own; it feeds
// the per-search precision suggestion on /searches.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, configured: false });
  }
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const raw = Number(body?.feedback);
  if (!id || ![1, -1, 0].includes(raw)) {
    return NextResponse.json(
      { error: "feedback must be 1, -1 or 0" },
      { status: 400 },
    );
  }

  const supabase = createServerComponentClient();
  const { data, error } = await supabase
    .from("user_feed_inbox")
    .update({
      feedback: raw === 0 ? null : raw,
      feedback_at: raw === 0 ? null : new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, feedback")
    .maybeSingle();

  if (error) {
    console.error("[alerts/id feedback]", error.message);
    return NextResponse.json(
      { error: "Could not save feedback" },
      { status: 500 },
    );
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, feedback: data.feedback ?? null });
}
