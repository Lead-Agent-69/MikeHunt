export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

// POST /api/push/subscribe — register this device's push subscription for the signed-in user.
// DELETE — remove it (turn notifications off on this device).
export async function POST(req: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "sign in" }, { status: 401 });

  let sub: any;
  try {
    sub = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth)
    return NextResponse.json(
      { error: "invalid subscription" },
      { status: 400 },
    );

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
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "sign in" }, { status: 401 });

  let endpoint: string | undefined;
  try {
    endpoint = (await req.json())?.endpoint;
  } catch {
    /* delete all for the user if no endpoint */
  }
  const supabase = createServerComponentClient();
  let q = supabase.from("push_subscriptions").delete().eq("user_id", user.id);
  if (endpoint) q = q.eq("endpoint", endpoint);
  await q;
  return NextResponse.json({ ok: true });
}
