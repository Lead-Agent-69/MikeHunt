import { NextRequest, NextResponse } from "next/server";
import { DealsService } from "@/lib/data/deals-service";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { recordDealSignal } from "@/lib/reco/signals";
import { assessDecisionEvidence } from "@/lib/intelligence/decision-guard";
import { applyGoProfitPolicy } from "@/lib/scoring/go-policy";
import {
  isFlipDeskMode,
  readSavedBuyerScope,
  redactDealForNonFlipDesk,
  redactSellerForGuest,
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

    // Retain the legacy response field without billing lookups or customer limits.
    const meter = null;
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
    const evidence = assessDecisionEvidence(deal);
    const safeDeal =
      !evidence.acquisitionReady && deal.dealVerdict === "go"
        ? { ...deal, dealVerdict: "hold", decisionEvidence: evidence }
        : { ...deal, decisionEvidence: evidence };
    // Flip economics and seller contact only go to a saved reseller / dealer desk. The client desk
    // toggle is a preview; this is the boundary. Unknown, parts, diy, personal, or a failed prefs
    // read all get the redacted listing (fail closed).
    let savedMode: unknown = undefined;
    let targetProfit: number | undefined;
    if (user?.id) {
      try {
        const scope = await readSavedBuyerScope(
          createServerComponentClient(),
          user.id,
        );
        savedMode = scope?.buyerMode;
        targetProfit = scope?.targetProfit;
      } catch {
        savedMode = undefined;
      }
    }
    // Recommendation signal: a signed-in deal open. Best-effort, never blocks the response.
    if (user?.id)
      await recordDealSignal(
        createServerComponentClient(),
        user.id,
        "open",
        deal,
      );
    const deskPayload = isFlipDeskMode(savedMode)
      ? {
          ...applyGoProfitPolicy(safeDeal, targetProfit),
          deskAccess: "flip" as const,
        }
      : redactDealForNonFlipDesk(safeDeal);
    // Signed-out: no seller identity either (name, profile link, raw options.seller).
    const payload = user?.id ? deskPayload : redactSellerForGuest(deskPayload);
    return NextResponse.json({ deal: payload, meter });
  } catch (error) {
    console.error("Error in single deal API:", error);
    return NextResponse.json(
      { error: "Vehicle details couldn't be loaded. Please try again." },
      { status: 500 },
    );
  }
}
