export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { isPushConfigured, sendPushToUser } from "@/lib/notifications/push";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// POST /api/push/test: send one test notification to the signed-in user's own devices, so they can see
// alerts really arrive (and that tapping one opens the app) before relying on them. Never sends to anyone else.
export async function POST(req: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "sign in" }, { status: 401 });

  const rl = rateLimit(req, {
    key: "push-test",
    identity: `user:${user.id}`,
    limit: 3,
    windowMs: 60_000,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  const supabase = createServerComponentClient();
  if (!(await isPushConfigured(supabase)))
    return NextResponse.json(
      { configured: false, sent: 0, error: "push not configured" },
      { status: 503 },
    );

  const sent = await sendPushToUser(supabase, user.id, {
    title: "MikeHunt test alert",
    body: "Alerts reach this device. Tap to open your alerts.",
    url: "/alerts",
    tag: "push-test",
  });
  return NextResponse.json({ configured: true, sent });
}
