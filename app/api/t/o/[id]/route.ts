export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import {
  PIXEL_GIF,
  isDeliveryId,
  recordDeliveryEvent,
} from "@/lib/alerts/delivery-tracking";

// GET /api/t/o/<deliveryId> — email open pixel. Always answers with a 1x1 GIF (even for unknown ids)
// so it reveals nothing. The id is an opaque random UUID; no email or user id is in the URL.
// Opens are approximate: image blocking hides some, and mail proxies (e.g. Apple Mail Privacy
// Protection) prefetch others.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (isDeliveryId(id) && isSupabaseConfigured()) {
    await recordDeliveryEvent(createServerComponentClient(), id, "opened");
  }
  return new NextResponse(PIXEL_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Referrer-Policy": "no-referrer",
    },
  });
}
