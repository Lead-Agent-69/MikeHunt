export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { verifiedInventory } from "@/lib/market/verified-inventory";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, {
    key: "market-heatmap",
    limit: 60,
    windowMs: 60000,
  });
  if (!rl.allowed) return tooManyRequests(rl);
  if (!isSupabaseConfigured())
    return NextResponse.json(
      { states: {}, maxN: 1, total: 0, configured: false },
      { headers },
    );
  try {
    const [sample, flip] = await Promise.all([
      verifiedInventory(createServerComponentClient()),
      resolveCallerFlipDesk(),
    ]);
    const groups = new Map<string, number[]>();
    for (const row of sample.ready) {
      if (!/^[A-Z]{2}$/.test(row.location_state || "")) continue;
      groups.set(row.location_state, [
        ...(groups.get(row.location_state) || []),
        row.true_net_profit,
      ]);
    }
    const states = Object.fromEntries(
      Array.from(groups.entries()).map(([state, profits]) => [
        state,
        {
          n: profits.length,
          ...(flip
            ? {
                avgProfit: Math.round(
                  profits.reduce((a, b) => a + b, 0) / profits.length,
                ),
                maxProfit: Math.max(...profits),
              }
            : {}),
        },
      ]),
    );
    return NextResponse.json(
      {
        states,
        maxN: Math.max(1, ...Array.from(groups.values()).map((v) => v.length)),
        total: sample.ready.length,
        sample: sample.sample,
        deskAccess: flip ? "flip" : "personal",
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error: "Market evidence is temporarily unavailable.",
        status: "unavailable",
      },
      { status: 503, headers },
    );
  }
}
