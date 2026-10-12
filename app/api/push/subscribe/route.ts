export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { parsePushSubscription } from "@/lib/notifications/subscription";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// POST /api/push/subscribe — register this device's push subscription for the signed-in user.
// DELETE — remove it (turn notifications off on this device).
export async function POST(req: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "sign in" }, { status: 401 });

  const rl = rateLimit(req, {
    key: "push-subscribe",
    identity: `user:${user.id}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  let sub: any;
  try {
    sub = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const parsed = parsePushSubscription(sub);
  if (!parsed)
    return NextResponse.json(
      { error: "invalid subscription" },
      { status: 400 },
    );
  const {
    endpoint,
    keys: { p256dh, auth },
  } = parsed;

  const supabase = createServerComponentClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "user_id,endpoint" },
  );
  if (error) return internalError("push:subscribe", error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "sign in" }, { status: 401 });

  let endpoint: unknown;
  try {
    endpoint = (await req.json())?.endpoint;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > 4096)
    return NextResponse.json({ error: "invalid endpoint" }, { status: 400 });
  const supabase = createServerComponentClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);
  if (error) return internalError("push:unsubscribe", error);
  return NextResponse.json({ ok: true });
}
