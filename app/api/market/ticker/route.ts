export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { applyBuyableInventory } from "@/lib/search/customer-inventory";
import {
  verifiedInventory,
  verifiedPulse,
} from "@/lib/market/verified-inventory";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, {
    key: "market-ticker",
    limit: 60,
    windowMs: 60000,
  });
  if (!rl.allowed) return tooManyRequests(rl);
  try {
    const flip = await resolveCallerFlipDesk();
    const db = createServerComponentClient();
    const count = await applyBuyableInventory(
      db.from("deals").select("id", { count: "exact", head: true }),
    )
      .gte("created_at", new Date(Date.now() - 86400000).toISOString())
      .abortSignal(AbortSignal.timeout(10000));
    if (count.error || count.count == null) throw new Error("unavailable");
    const items = [{ label: `New listings today: ${count.count}`, change: 0 }];
    const sample = flip ? await verifiedInventory(db) : null;
    for (const p of sample ? verifiedPulse(sample.rows).slice(0, 4) : [])
      items.push({
        label: `${p.year} ${p.make} ${p.model}: ${p.goDeals} evidence-backed candidates · $${p.avgProfit.toLocaleString()} estimated net (sample)`,
        change: 0,
      });
    return NextResponse.json(
      {
        items,
        deskAccess: flip ? "flip" : "personal",
        sample: sample?.sample ?? null,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error: "Market updates are temporarily unavailable.",
        status: "unavailable",
      },
      { status: 503, headers },
    );
  }
}
