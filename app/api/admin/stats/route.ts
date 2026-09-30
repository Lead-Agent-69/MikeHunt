export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/auth/admin";

// GET /api/admin/stats — Platform health metrics for the admin dashboard.
// Requires admin role or INGEST_SECRET auth header.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isSecretAuth =
    authHeader === `Bearer ${process.env.INGEST_SECRET}` &&
    !!process.env.INGEST_SECRET;

  const supabase = createServerComponentClient();

  if (!isSecretAuth) {
    // Check if the user is an admin via Supabase RLS
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    // Two admin paths: the DB role (user_profiles.role) and the single-admin email
    // (lib/auth/admin.ts). Either is sufficient — the email path keeps ops access working even
    // when the role column hasn't been populated for the owner account.
    if (profile?.role !== "admin" && !isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const [
      totalDealsRes,
      activeDealsRes,
      bySourceRes,
      usersRes,
      outcomeRes,
      topDealsRes,
      scoredRes,
    ] = await Promise.allSettled([
      supabase.from("deals").select("id", { count: "exact", head: true }),
      supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      supabase
        .from("deals")
        .select("source")
        .eq("active", true)
        .then(({ data }) => {
          // Group by source manually
          const map: Record<string, { count: number; last_scraped: string }> =
            {};
          for (const row of data ?? []) {
            if (!map[row.source])
              map[row.source] = { count: 0, last_scraped: "" };
            map[row.source].count++;
          }
          return Object.entries(map)
            .map(([source, v]) => ({ source, ...v }))
            .sort((a, b) => b.count - a.count);
        }),
      supabase
        .from("user_profiles")
        .select("id, plan, created_at", { count: "exact" }),
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
      supabase
        .from("deals")
        .select("profit_score, deal_verdict")
        .eq("active", true)
        .not("profit_score", "is", null)
        .limit(1000),
    ]);

    const totalDeals =
      totalDealsRes.status === "fulfilled"
        ? (totalDealsRes.value.count ?? 0)
        : 0;
    const activeDeals =
      activeDealsRes.status === "fulfilled"
        ? (activeDealsRes.value.count ?? 0)
        : 0;
    const dealsBySource =
      bySourceRes.status === "fulfilled" ? bySourceRes.value : [];
    const usersData =
      usersRes.status === "fulfilled" ? (usersRes.value.data ?? []) : [];
    const totalUsers = usersData.length;
    const proUsers = usersData.filter((u: any) =>
      ["pro", "elite"].includes(u.plan),
    ).length;
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 3600 * 1000,
    ).toISOString();
    const recentSignups = usersData.filter(
      (u: any) => u.created_at > sevenDaysAgo,
    ).length;
    const outcomeCount =
      outcomeRes.status === "fulfilled" ? (outcomeRes.value.count ?? 0) : 0;
    const topDeals =
      topDealsRes.status === "fulfilled" ? (topDealsRes.value.data ?? []) : [];
    const scoredData =
      scoredRes.status === "fulfilled" ? (scoredRes.value.data ?? []) : [];
    const avgProfitScore =
      scoredData.length > 0
        ? Math.round(
            scoredData.reduce(
              (sum: number, d: any) => sum + Number(d.profit_score ?? 0),
              0,
            ) / scoredData.length,
          )
        : 0;
    const goDealsCount = scoredData.filter(
      (d: any) => d.deal_verdict === "go",
    ).length;

    return NextResponse.json({
      totalDeals,
      activeDeals,
      dealsBySource,
      totalUsers,
      proUsers,
      recentSignups,
      outcomeCount,
      topDeals,
      avgProfitScore,
      goDealsCount,
    });
  } catch (e: any) {
    console.error("[admin/stats] error:", e);
    return NextResponse.json(
      { error: "Internal error", details: e.message },
      { status: 500 },
    );
  }
}
