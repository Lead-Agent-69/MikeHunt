export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  verifiedInventory,
  verifiedPulse,
} from "@/lib/market/verified-inventory";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, {
    key: "market-pulse",
    limit: 60,
    windowMs: 60000,
  });
  if (!rl.allowed) return tooManyRequests(rl);
  if (!isSupabaseConfigured())
    return NextResponse.json({ rows: [], configured: false }, { headers });
  if (!(await resolveCallerFlipDesk()))
    return NextResponse.json({ rows: [], deskAccess: "personal" }, { headers });
  try {
    const data = await verifiedInventory(createServerComponentClient());
    return NextResponse.json(
      {
        rows: verifiedPulse(data.rows),
        sample: data.sample,
        deskAccess: "flip",
        reason: data.ready.length
          ? null
          : "No sampled listings meet the existing purchase-evidence gates.",
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error: "Market pulse is temporarily unavailable.",
        status: "unavailable",
      },
      { status: 503, headers },
    );
  }
}
