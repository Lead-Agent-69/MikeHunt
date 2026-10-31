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
  askingScatter,
  validVehicleTerm,
} from "@/lib/market/verified-inventory";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "overview", limit: 60, windowMs: 60000 });
  if (!rl.allowed) return tooManyRequests(rl);
  const make = req.nextUrl.searchParams.get("make") || "",
    model = req.nextUrl.searchParams.get("model") || "";
  if (!validVehicleTerm(make) || !validVehicleTerm(model))
    return NextResponse.json(
      { error: "Choose the full make and model." },
      { status: 400, headers },
    );
  if (!isSupabaseConfigured())
    return NextResponse.json(
      {
        configured: false,
        make,
        model,
        stats: { goDeals: 0, totalActive: 0 },
        trims: [],
        scatter: [],
        regional: [],
      },
      { headers },
    );
  try {
    const sample = await verifiedInventory(createServerComponentClient(), {
      make,
      model,
    });
    const profits = sample.ready.map((r: any) => r.true_net_profit);
    const groups = new Map<string, any[]>();
    for (const row of sample.rows) {
      const trim = row.trim || "Unreported trim";
      groups.set(trim, [...(groups.get(trim) || []), row]);
    }
    const byState = new Map<string, number[]>();
    for (const row of sample.ready) {
      if (row.location_state)
        byState.set(row.location_state, [
          ...(byState.get(row.location_state) || []),
          row.true_net_profit,
        ]);
    }
    const payload = {
      make,
      model,
      stats: {
        goDeals: sample.ready.length,
        avgProfit: profits.length
          ? Math.round(
              profits.reduce((a: number, b: number) => a + b, 0) /
                profits.length,
            )
          : null,
        totalActive: sample.rows.length,
      },
      trims: Array.from(groups.entries()).map(([trim, rows]) => {
        const ready = sample.ready.filter((r: any) => rows.includes(r));
        const prices = askingScatter(rows).map((r) => r.price);
        return {
          trim,
          goDeals: ready.length,
          avgProfit: ready.length
            ? Math.round(
                ready.reduce((s: number, r: any) => s + r.true_net_profit, 0) /
                  ready.length,
              )
            : null,
          avgAsk: prices.length
            ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
            : null,
        };
      }),
      scatter: askingScatter(sample.rows),
      regional: Array.from(byState.entries()).map(([state, profits]) => ({
        state,
        avgProfit: Math.round(
          profits.reduce((a, b) => a + b, 0) / profits.length,
        ),
        count: profits.length,
      })),
    };
    const flip = await resolveCallerFlipDesk();
    return NextResponse.json(
      {
        ...(flip
          ? { ...payload, deskAccess: "flip" }
          : redactMarketOverviewForNonFlip(payload)),
        sample: sample.sample,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error: "Market overview is temporarily unavailable.",
        status: "unavailable",
      },
      { status: 503, headers },
    );
  }
}

/** Average profit is flip economics: personal / diy / parts / signed-out callers get counts and asks only. */
export function redactMarketOverviewForNonFlip(payload: {
  make: string;
  model: string;
  stats: { goDeals: number; avgProfit?: number | null; totalActive: number };
  trims: Array<{
    trim: string;
    goDeals: number;
    avgProfit?: number | null;
    avgAsk: number | null;
  }>;
  scatter: Array<{ mileage: number; price: number }>;
  regional: Array<{ state: string; avgProfit?: number | null; count: number }>;
}) {
  return {
    make: payload.make,
    model: payload.model,
    stats: {
      goDeals: payload.stats.goDeals,
      totalActive: payload.stats.totalActive,
    },
    trims: payload.trims.map(({ avgProfit: _p, ...rest }) => rest),
    scatter: payload.scatter,
    regional: payload.regional
      .map(({ avgProfit: _p, ...rest }) => rest)
      .sort((a, b) => b.count - a.count),
    deskAccess: "personal" as const,
  };
}
