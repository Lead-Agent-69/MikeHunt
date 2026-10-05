import { NextRequest, NextResponse } from "next/server";
import { DealsService } from "@/lib/data/deals-service";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { getUserPlan, meterDealView } from "@/lib/auth/plan";
import { assessDecisionEvidence } from "@/lib/intelligence/decision-guard";
import {
  isFlipDeskMode,
  readSavedBuyerMode,
  redactDealForNonFlipDesk,
} from "@/lib/deals/deal-desk-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Vehicle details are temporarily unavailable. Please try again shortly.",
      },
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
    // Resolve the session once. A failed lookup is treated as signed out (redacted payload).
    let user: { id?: string } | null = null;
    try {
      const {
        data: { user: sessionUser },
      } = await getServerUser();
      user = sessionUser ?? null;
    } catch {
      user = null;
    }
    try {
      // Gating ships OFF by default so the single pre-launch user isn't metered mid-demo. Flip on
      // for launch by setting GATING_ENABLED=true in the environment.
      const gatingOn = process.env.GATING_ENABLED === "true";
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

    const evidence = assessDecisionEvidence(deal);
    const safeDeal =
      !evidence.acquisitionReady && deal.dealVerdict === "go"
        ? { ...deal, dealVerdict: "hold", decisionEvidence: evidence }
        : { ...deal, decisionEvidence: evidence };
    // Flip economics and seller contact only go to a saved reseller / dealer desk. The client desk
    // toggle is a preview; this is the boundary. Unknown, parts, diy, personal, or a failed prefs
    // read all get the redacted listing (fail closed).
    let savedMode: unknown = undefined;
    if (user?.id) {
      try {
        savedMode = await readSavedBuyerMode(
          createServerComponentClient(),
          user.id,
        );
      } catch {
        savedMode = undefined;
      }
    }
    const payload = isFlipDeskMode(savedMode)
      ? { ...safeDeal, deskAccess: "flip" as const }
      : redactDealForNonFlipDesk(safeDeal);
    return NextResponse.json({ deal: payload, meter });
  } catch (error) {
    console.error("Error in single deal API:", error);
    return NextResponse.json(
      { error: "Vehicle details couldn't be loaded. Please try again." },
      { status: 500 },
    );
  }
}
