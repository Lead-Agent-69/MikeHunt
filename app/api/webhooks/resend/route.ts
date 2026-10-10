export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { recordProviderEvent } from "@/lib/alerts/delivery-tracking";
import { verifySvixSignature } from "@/lib/alerts/svix-verify";

// POST /api/webhooks/resend — Resend delivery events (Svix-signed).
// Needs RESEND_WEBHOOK_SECRET (the "whsec_..." signing secret of a Resend webhook pointed here,
// subscribed to email.delivered / email.opened / email.clicked / email.bounced). Without the secret
// every request is rejected, so nothing unsigned can write tracking data.
const EVENT_MAP: Record<
  string,
  "delivered" | "opened" | "clicked" | "bounced"
> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
};

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET || "";
  const body = await req.text();
  const ok = verifySvixSignature({
    secret,
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
    body,
  });
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let evt: { type?: string; data?: { email_id?: string } } = {};
  try {
    evt = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const mapped = evt.type ? EVENT_MAP[evt.type] : undefined;
  const emailId = evt.data?.email_id;
  if (mapped && emailId && isSupabaseConfigured()) {
    await recordProviderEvent(createServerComponentClient(), emailId, mapped);
  }
  return NextResponse.json({ ok: true });
}
