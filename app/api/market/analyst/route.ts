export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  verifiedInventory,
  verifiedPulse,
} from "@/lib/market/verified-inventory";
const headers = { "Cache-Control": "private, no-store" };

/** Legacy summary helpers retain their interface; unverified aggregates cannot supply money claims. */
export function aggregateLiveDealsForMarketPulse(rows: any[]) {
  return verifiedPulse(rows).map((r) => ({
    make: r.make,
    model: r.model,
    year: r.year,
    state: r.state,
    unit_count: r.goDeals,
    avg_profit: r.avgProfit,
    evidenceVerified: true,
  }));
}
export function buildDeterministicMarketPulse({
  aggs = [],
}: { timing?: any[]; aggs?: any[] } = {}) {
  const verified = aggs.filter(
    (r) => r.evidenceVerified === true && Number.isFinite(r.avg_profit),
  );
  if (!verified.length)
    return "No purchase recommendation or profit cluster is established from the supplied evidence. Asking observations and stored market scores are not completed sales. Verify price, title, inspection, costs and dated sold comparisons before deciding.";
  return `Evidence-backed candidates in the current sample: ${verified
    .slice(0, 5)
    .map(
      (r) =>
        `${r.year} ${r.make} ${r.model} (${r.state || "location unknown"}): ${r.unit_count} candidates, $${r.avg_profit.toLocaleString()} average estimated net`,
    )
    .join(
      "; ",
    )}. Estimates are not guarantees. This is a bounded inventory sample, not the whole market. Review each source and final transaction terms. No turnover or historical price trend has been established here.`;
}
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "analyst", limit: 15, windowMs: 60000 });
  if (!rl.allowed) return tooManyRequests(rl);
  try {
    if (
      req.nextUrl.searchParams.get("generate") === "1" ||
      req.nextUrl.searchParams.get("refresh") === "1"
    ) {
      const {
        data: { user },
        error,
      } = await getServerUser();
      if (error || !user?.id)
        return NextResponse.json(
          { error: "Sign in to review market evidence." },
          { status: 401, headers },
        );
    }
    if (!(await resolveCallerFlipDesk()))
      return NextResponse.json(
        {
          report: null,
          canGenerate: false,
          flipOnly: true,
          deskAccess: "personal",
          reason: "Market resale research uses your saved buying preferences.",
        },
        { headers },
      );
    const sample = await verifiedInventory(createServerComponentClient());
    return NextResponse.json(
      {
        report: buildDeterministicMarketPulse({
          aggs: aggregateLiveDealsForMarketPulse(sample.rows),
        }),
        sample: sample.sample,
        canGenerate: false,
        deterministic: true,
        provider: "none",
        cached: false,
        deskAccess: "flip",
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error: "Market research is temporarily unavailable.",
        status: "unavailable",
      },
      { status: 503, headers },
    );
  }
}
