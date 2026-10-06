import { NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getServerUser, hasAuthSessionCookie } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

// Per-user badge state: never cache it in a shared CDN.
const NO_STORE = { "Cache-Control": "private, no-store" };

function count(n: number) {
  return NextResponse.json({ count: n }, { headers: NO_STORE });
}

function ok() {
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

// Signed-out visitors (TopNav polls this on every page) get an empty answer straight away: no
// auth round trip, no database query, no error. Same shape as a signed-in user with no alerts.
async function signedOutShortCircuit(): Promise<boolean> {
  if (!isSupabaseConfigured()) return true; // no inbox table without a database
  try {
    return !(await hasAuthSessionCookie());
  } catch {
    return true;
  }
}

// GET /api/alerts/unread — unread count for the SIGNED-IN user only.
// NOTE: createServerComponentClient uses the service-role key (bypasses RLS), so we MUST
// derive the user from the session and scope every query by user_id ourselves.
export async function GET() {
  if (await signedOutShortCircuit()) return count(0);
  try {
    const {
      data: { user },
    } = await getServerUser();
    if (!user?.id) return count(0);

    const supabase = createServerComponentClient();
    const { count: unread, error } = await supabase
      .from("user_feed_inbox")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "unread");

    if (error) return count(0);
    return count(unread ?? 0);
  } catch {
    return count(0);
  }
}

// POST /api/alerts/unread — mark THIS user's unread items as read.
export async function POST() {
  if (await signedOutShortCircuit()) return ok();
  try {
    const {
      data: { user },
    } = await getServerUser();
    if (!user?.id) return ok();

    const supabase = createServerComponentClient();
    await supabase
      .from("user_feed_inbox")
      .update({ status: "read" })
      .eq("user_id", user.id)
      .eq("status", "unread");
    return ok();
  } catch {
    return ok();
  }
}
