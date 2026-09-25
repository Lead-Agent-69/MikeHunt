import { NextRequest, NextResponse } from "next/server";
import { DealsService } from "@/lib/data/deals-service";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { getUserPlan, meterDealView } from "@/lib/auth/plan";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  try {
    const { id } = await params;
    const dealsService = new DealsService();
    const deal = await dealsService.getDealById(id);

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Plan gating: free dealers get a daily cap on distinct deal analyses; paid = unlimited.
    // Best-effort — a metering hiccup must never block a legitimate deal load.
    let meter: {
      remaining: number | null;
      limit: number | null;
      plan: string;
    } | null = null;
    try {
      // Gating ships OFF by default so the single pre-launch user isn't metered mid-demo. Flip on
      // for launch by setting GATING_ENABLED=true in the environment.
      const gatingOn = process.env.GATING_ENABLED === "true";
      const {
        data: { user },
      } = await getServerUser();
      if (gatingOn && user?.id) {
        const supabase = createServerComponentClient();
        const plan = await getUserPlan(supabase, user.id);
        const m = await meterDealView(supabase, user.id, id, plan);
        meter = {
          remaining: Number.isFinite(m.remaining) ? m.remaining : null,
          limit: Number.isFinite(m.limit) ? m.limit : null,
          plan: m.plan,
        };
        if (!m.allowed) {
          return NextResponse.json(
            {
              error:
                "You've reached today's free limit of 10 deal analyses. Upgrade to Pro for unlimited.",
              locked: true,
              meter,
            },
            { status: 402 },
          );
        }
      }
    } catch {
      /* metering is best-effort */
    }

    return NextResponse.json({ deal, meter });
  } catch (error) {
    console.error("Error in single deal API:", error);
    return NextResponse.json(
      { error: "Failed to fetch deal" },
      { status: 500 },
    );
  }
}
