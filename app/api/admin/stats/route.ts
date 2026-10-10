export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { canManageOperations } from "@/lib/auth/admin-operations";
import { fetchAllRows } from "@/lib/db/paginate";

const MAX_METRIC_ROWS = 50_000;

// Aggregate operational data is never read before request authorization.
export async function GET(req: NextRequest) {
  if (!(await canManageOperations(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerComponentClient();
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 3600 * 1000,
    ).toISOString();
    const [total, active, users, pro, recent, outcomes, top, rows] =
      await Promise.all([
        supabase.from("deals").select("id", { count: "exact", head: true }),
        supabase
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("active", true),
        supabase
          .from("user_profiles")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("user_profiles")
          .select("id", { count: "exact", head: true })
          .in("plan", ["pro", "elite"]),
        supabase
          .from("user_profiles")
          .select("id", { count: "exact", head: true })
          .gt("created_at", sevenDaysAgo),
        supabase
          .from("dealer_deals")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("deals")
          .select("id, year, make, model, true_net_profit, deal_verdict")
          .eq("active", true)
          .eq("deal_verdict", "go")
          .order("true_net_profit", { ascending: false })
          .limit(10),
        fetchAllRows<{
          source: string;
          profit_score: number | null;
          deal_verdict: string | null;
        }>(
          (from, to) =>
            supabase
              .from("deals")
              .select("source, profit_score, deal_verdict")
              .eq("active", true)
              .order("id")
              .range(from, to),
          { max: MAX_METRIC_ROWS + 1 },
        ),
      ]);

    // PostgREST query failures resolve with error; they are not rejected promises.
    for (const result of [total, active, users, pro, recent, outcomes, top]) {
      if (result.error) throw result.error;
    }
    for (const result of [total, active, users, pro, recent, outcomes]) {
      if (result.count == null) throw new Error("Missing aggregate count");
    }
    if (rows.length > MAX_METRIC_ROWS)
      throw new Error("Metric scan limit reached");

    const sources = new Map<string, number>();
    let scoreTotal = 0;
    let scoredCount = 0;
    let goDealsCount = 0;
    for (const row of rows) {
      const source = row.source || "unknown";
      sources.set(source, (sources.get(source) ?? 0) + 1);
      if (
        row.profit_score != null &&
        Number.isFinite(Number(row.profit_score))
      ) {
        scoreTotal += Number(row.profit_score);
        scoredCount++;
      }
      if (row.deal_verdict === "go") goDealsCount++;
    }

    return NextResponse.json({
      totalDeals: total.count,
      activeDeals: active.count,
      dealsBySource: Array.from(sources, ([source, count]) => ({
        source,
        count,
        last_scraped: "",
      })).sort((a, b) => b.count - a.count),
      totalUsers: users.count,
      proUsers: pro.count,
      recentSignups: recent.count,
      outcomeCount: outcomes.count,
      topDeals: top.data ?? [],
      avgProfitScore: scoredCount ? Math.round(scoreTotal / scoredCount) : 0,
      goDealsCount,
    });
  } catch (error) {
    console.error("[admin/stats] metrics unavailable:", error);
    return NextResponse.json(
      {
        error:
          "Dashboard metrics are temporarily unavailable. Please try again.",
      },
      { status: 503 },
    );
  }
}
