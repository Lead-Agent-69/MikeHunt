export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { isPushConfigured } from "@/lib/notifications/push";

// GET /api/push/status: can this server send Web Push right now? Only a boolean leaves the server (never a
// key). The Enable alerts button reads this so it never promises notifications that can't be delivered.
export async function GET() {
  const configured = await isPushConfigured(createServerComponentClient());
  return NextResponse.json(
    { configured },
    { headers: { "Cache-Control": "no-store" } },
  );
}
