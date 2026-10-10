export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import {
  isDeliveryId,
  recordDeliveryEvent,
  resolveClickDestination,
} from "@/lib/alerts/delivery-tracking";

// GET /api/t/c/<deliveryId> — click-through redirect for alert links (email, SMS, push).
// NOT an open redirect: the destination never comes from the request. It is resolved from the stored
// delivery row — our own /deal/<deal_id>, or that deal's stored listing URL — and anything unknown
// lands on /alerts.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let destination = "/alerts";

  if (isDeliveryId(id) && isSupabaseConfigured()) {
    try {
      const sb = createServerComponentClient();
      const { data: row } = await sb
        .from("alert_deliveries")
        .select("id, deal_id, click_target")
        .eq("id", id)
        .maybeSingle();
      if (row) {
        let listingUrl: string | null = null;
        if (row.click_target === "listing" && isDeliveryId(row.deal_id)) {
          const { data: deal } = await sb
            .from("deals")
            .select("source_url")
            .eq("id", row.deal_id)
            .maybeSingle();
          listingUrl =
            (deal as { source_url?: string } | null)?.source_url ?? null;
        }
        destination = resolveClickDestination(row, listingUrl);
        await recordDeliveryEvent(sb, id, "clicked");
      }
    } catch {
      destination = "/alerts";
    }
  }

  const target = destination.startsWith("/")
    ? new URL(destination, req.nextUrl.origin)
    : new URL(destination);
  const res = NextResponse.redirect(target, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
