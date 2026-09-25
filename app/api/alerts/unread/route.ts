import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

// GET /api/alerts/unread — unread count for the SIGNED-IN user only.
// NOTE: createServerComponentClient uses the service-role key (bypasses RLS), so we MUST
// derive the user from the session and scope every query by user_id ourselves.
export async function GET() {
  try {
    const {
      data: { user },
    } = await getServerUser();
    if (!user) return NextResponse.json({ count: 0 });

    const supabase = createServerComponentClient();
    const { count, error } = await supabase
      .from("user_feed_inbox")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "unread");

    if (error) return NextResponse.json({ count: 0 });
    return NextResponse.json({ count: count ?? 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}

// POST /api/alerts/unread — mark THIS user's unread items as read.
export async function POST() {
  try {
    const {
      data: { user },
    } = await getServerUser();
    if (!user) return NextResponse.json({ ok: true });

    const supabase = createServerComponentClient();
    await supabase
      .from("user_feed_inbox")
      .update({ status: "read" })
      .eq("user_id", user.id)
      .eq("status", "unread");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
