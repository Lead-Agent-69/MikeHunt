export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createServerComponentClient } from "@/lib/supabase";
import {
  getTextModel,
  getPremiumTextModel,
  hasTextModel,
  activeProvider,
} from "@/lib/ai/text-model";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// GET /api/deals/[id]/brief — a short, plain-English dealer brief for a deal: why the verdict, the
// real risks, and what to verify before bidding. Generated from the deal's own structured numbers
// (no hallucinated specs), cached in deal_analysis.aiBrief so it's generated once per deal.
//   ?refresh=1 regenerates.
const fmt = (v: any) =>
  v == null
    ? "n/a"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(Number(v));

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = rateLimit(req, { key: "brief", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const refresh = sp.get("refresh") === "1";
  // Generation is explicit (a click) so a plain page view never spends tokens.
  const wantGenerate = refresh || sp.get("generate") === "1";
  const supabase = createServerComponentClient();

  const { data: d, error } = await supabase
    .from("deals")
    .select(
      "id, year, make, model, trim, mileage, condition, damage_type, ask_price, sell_estimate, mmr_value, true_net_profit, recommended_max_bid, deal_verdict, profit_score, location_state, source, deal_analysis",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !d)
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  // Serve cache unless refresh requested.
  const cached = d.deal_analysis?.aiBrief;
  if (cached && !refresh) {
    return NextResponse.json({ brief: cached, cached: true });
  }

  // Plain view with no cache yet: tell the client a brief is available to generate (no tokens spent).
  if (!wantGenerate) {
    return NextResponse.json({ brief: null, canGenerate: hasTextModel() });
  }

  if (!hasTextModel()) {
    return NextResponse.json({
      brief: null,
      reason: "No AI provider key configured.",
    });
  }

  const costs = d.deal_analysis?.costs || {};
  // Assuming $30/day floor plan/holding cost as a default baseline
  const floorRate = 30;
  // Fallback days to sell to 45 if not present
  const estimatedDaysToSell = 45;
  const breakEvenDay = Math.floor((d.true_net_profit || 0) / floorRate);

  const facts = [
    `Vehicle: ${[d.year, d.make, d.model, d.trim].filter(Boolean).join(" ")}`,
    `Title/condition: ${d.condition || "unknown"}${d.damage_type ? `, ${d.damage_type} damage` : ""}`,
    d.mileage ? `Mileage: ${d.mileage.toLocaleString()}` : null,
    `Ask price: ${fmt(d.ask_price)}`,
    `Estimated resale: ${fmt(d.sell_estimate ?? d.mmr_value)}`,
    `Engine verdict: ${(d.deal_verdict || "n/a").toUpperCase()} (profit score ${d.profit_score ?? "n/a"}/130)`,
    `Estimated net profit: ${fmt(d.true_net_profit)}`,
    `Recommended max bid: ${fmt(d.recommended_max_bid)}`,
    `Estimated costs — transport ${fmt(costs.transport)}, recon/repair ${fmt(costs.repair)}, selling ${fmt(costs.selling)}`,
    `Cash Flow Velocity metrics — Holding cost is ~$${floorRate}/day. Break-even happens at Day ${breakEvenDay}.`,
    `Location: ${d.location_state || "n/a"} · Source: ${d.source || "n/a"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are a ruthless Chief Financial Officer for a used-car dealership. Using ONLY the figures below (do not invent specs, history, or numbers), write a tight brief deciding whether to buy this vehicle to flip.

${facts}

Respond in 3 short parts, plain text, no markdown headers:
1) One sentence on why the engine reached its verdict, specifically focusing on cash flow velocity and whether holding costs will eat the margin.
2) "Risks:" then 2-3 short bullet-style risks specific to this title/damage/price/location.
3) "Verify:" then 2-3 concrete things to check before bidding.
Keep it under 110 words. Be direct, financial, and practical.`;

  // TRIAGE ROUTING: Only use the expensive premium model for "GO" deals.
  // Use the cheap/fast model for HOLD or PASS to save API costs.
  const isPremiumDeal = (d.deal_verdict || "").toUpperCase() === "GO";
  const modelToUse = isPremiumDeal ? getPremiumTextModel() : getTextModel();

  try {
    const { text } = await generateText({
      model: modelToUse,
      prompt,
      temperature: 0.4,
    });
    const brief = text.trim();

    // Persist into deal_analysis.aiBrief (merge, don't clobber the analysis object).
    try {
      await supabase
        .from("deals")
        .update({
          deal_analysis: {
            ...(d.deal_analysis || {}),
            aiBrief: brief,
            aiBriefAt: new Date().toISOString(),
          },
        })
        .eq("id", id);
    } catch {
      // cache write is best-effort
    }

    return NextResponse.json({
      brief,
      cached: false,
      provider: activeProvider(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Generation failed" },
      { status: 500 },
    );
  }
}
