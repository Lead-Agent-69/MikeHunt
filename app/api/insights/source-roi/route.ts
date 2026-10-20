import { OUTCOME_LEDGER_COLUMNS } from "@/lib/outcomes/ledger";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { internalError } from "@/lib/api/http-error";
import { aggregateOutcomes } from "@/lib/insights/source-roi";

// /api/insights/source-roi — MikeHunt-exclusive moat. From the dealer's OWN logged outcomes,
// answer the two questions no listing site can: which acquisition SOURCE (copart, fb, auction…)
// actually nets them money, and which exit CHANNEL (lot, carmax, private…) sells fastest and best.
// Pure aggregation over deal_outcomes — no AI, no external calls. Empty until they log deals.

export async function GET() {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({
      bySource: [],
      byChannel: [],
      totalDeals: 0,
      ownerId: null,
    });

  const supabase = createServerComponentClient();
  const { data: outcomes, error } = await supabase
    .from("deal_outcomes")
    .select(`${OUTCOME_LEDGER_COLUMNS},sold_where`)
    .eq("user_id", user.id)
    .eq("costs_complete", true)
    .order("updated_at", { ascending: false })
    .limit(2000);

  if (error) return internalError("outcome-source-results", error);
  const rows = outcomes ?? [];
  if (rows.length === 0)
    return NextResponse.json({
      bySource: [],
      byChannel: [],
      totalDeals: 0,
      ownerId: user.id,
    });

  // Resolve acquisition source for any outcome tied to a scraped deal.
  const dealIds = Array.from(
    new Set(rows.map((r: any) => r.deal_id).filter(Boolean)),
  );
  const sourceById = new Map<string, string>();
  if (dealIds.length) {
    const { data: deals } = await supabase
      .from("deals")
      .select("id, source")
      .in("id", dealIds);
    for (const d of deals ?? []) sourceById.set(d.id, d.source || "unknown");
  }

  const { bySource, byChannel } = aggregateOutcomes(rows, sourceById);
  return NextResponse.json({
    bySource,
    byChannel,
    totalDeals: bySource.reduce((sum, source) => sum + source.deals, 0),
    ownerId: user.id,
  });
}
