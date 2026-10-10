export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import {
  isDeliveryId,
  recordDeliveryEvent,
} from "@/lib/alerts/delivery-tracking";

// POST /api/t/d/<deliveryId> — push delivery receipt. The service worker calls this when a push
// actually reaches the device (the push service's 201 only means "accepted", not "delivered").
// Opaque id only; always 204 so it reveals nothing about which ids exist.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (isDeliveryId(id) && isSupabaseConfigured()) {
    await recordDeliveryEvent(createServerComponentClient(), id, "delivered");
  }
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
