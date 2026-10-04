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
import { requirePaidAiCaller } from "@/lib/auth/paid-ai";

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

export function buildBriefModeMetadata({
  hasProvider,
  provider,
  cached = false,
}: {
  hasProvider: boolean;
  provider: string;
  cached?: boolean;
}) {
  return {
    deterministic: !hasProvider,
    provider,
    mode: hasProvider ? "provider" : "deterministic",
    reason: cached
      ? hasProvider
        ? "Cached provider brief."
        : "Cached brief shown while no AI provider key is configured."
      : undefined,
  };
}

/** Service-role writes must name a real user id. Cron is not an owner. */
export function aiBriefWriteDecision(
  analysis: { aiBrief?: unknown; aiBriefUserId?: unknown } | null | undefined,
  userId: string | null | undefined,
): "create" | "overwrite" | "reject" {
  const actor = typeof userId === "string" ? userId.trim() : "";
  if (!actor || actor === "cron") return "reject";
  const existing = analysis?.aiBrief;
  const hasBrief = typeof existing === "string" && existing.trim().length > 0;
  if (!hasBrief) return "create";
  return analysis?.aiBriefUserId === actor ? "overwrite" : "reject";
}

export function buildDeterministicDealBrief(d: any) {
  const costs = d.deal_analysis?.costs || {};
  const verdict = String(d.deal_verdict || "hold").toUpperCase();
  const profit = Number(d.true_net_profit || 0);
  const ask = Number(d.ask_price || 0);
  const resale = Number(d.sell_estimate ?? d.mmr_value ?? 0);
  const repair = Number(costs.repair || 0);
  const transport = Number(costs.transport || 0);
  const selling = Number(costs.selling || 0);
  const title = d.condition
    ? String(d.condition).replace(/_/g, " ")
    : "unknown title";
  const damage = d.damage_type
    ? `${d.damage_type} damage`
    : "damage not specified";
  const spread = resale > 0 && ask > 0 ? resale - ask : profit;
  const marginLine =
    profit > 0
      ? `The engine says ${verdict} because the deal shows ${fmt(profit)} estimated net profit after known costs, with ${fmt(spread)} gross spread before repair/transport/selling drag.`
      : `The engine says ${verdict} because the current ask leaves ${fmt(profit)} estimated net profit after known costs, so holding and resale risk can eat the deal.`;
  const riskLines = [
    `- ${title} / ${damage}; verify branding, repair scope, and state resale rules before bidding.`,
    repair || transport || selling
      ? `- Cost stack includes repair ${fmt(repair)}, transport ${fmt(transport)}, and selling ${fmt(selling)}; stale or low quotes can flip the math.`
      : "- Repair, transport, or selling costs are thin; treat profit as unproven until those quotes are real.",
    d.mileage
      ? `- Mileage is ${Number(d.mileage).toLocaleString()} mi; compare against same-trim comps, not clean-title averages.`
      : "- Mileage is missing; resale estimate and max bid need verification before action.",
  ];
  const verifyLines = [
    d.recommended_max_bid
      ? `- Keep buy-in at or below ${fmt(d.recommended_max_bid)} unless new comps justify more.`
      : "- Set a hard max bid after verifying fees, title, and transport.",
    "- Open the original source listing and confirm VIN, mileage, title status, seller path, and photo consistency.",
    "- Re-run resale comps against the target market before committing cash.",
  ];

  return `${marginLine}\n\nRisks:\n${riskLines.join("\n")}\n\nVerify:\n${verifyLines.join("\n")}`;
}

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
  let callerUserId: string | null = null;
  if (wantGenerate) {
    const caller = await requirePaidAiCaller(req);
    if (!caller.ok) return caller.response;
    callerUserId = caller.userId;
    const genRl = rateLimit(req, {
      key: `brief:${caller.userId}`,
      limit: 10,
      windowMs: 60_000,
    });
    if (!genRl.allowed) return tooManyRequests(genRl);
  }
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
    return NextResponse.json({
      brief: cached,
      cached: true,
      ...buildBriefModeMetadata({
        hasProvider: hasTextModel(),
        provider: activeProvider(),
        cached: true,
      }),
    });
  }

  // Plain view with no cache yet: tell the client a brief is available to generate (no tokens spent).
  if (!wantGenerate) {
    return NextResponse.json({
      brief: null,
      canGenerate: true,
      ...buildBriefModeMetadata({
        hasProvider: hasTextModel(),
        provider: activeProvider(),
      }),
    });
  }

  // The service-role client can update any deal. Bind the write to the session user
  // and refuse a cross-user overwrite, including an unowned cached brief.
  const writeDecision = aiBriefWriteDecision(d.deal_analysis, callerUserId);
  if (writeDecision === "reject") {
    return NextResponse.json(
      { error: "Only the brief owner can write this brief." },
      { status: 403 },
    );
  }

  if (!hasTextModel()) {
    return NextResponse.json({
      brief: buildDeterministicDealBrief(d),
      cached: false,
      ...buildBriefModeMetadata({ hasProvider: false, provider: "none" }),
      reason:
        "No AI provider key configured. This brief is deterministic and uses only saved deal math.",
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
            aiBriefUserId: callerUserId,
          },
        })
        .eq("id", id);
    } catch {
      // cache write is best-effort
    }

    return NextResponse.json({
      brief,
      cached: false,
      ...buildBriefModeMetadata({
        hasProvider: true,
        provider: activeProvider(),
      }),
    });
  } catch (e: any) {
    console.error("[deal-brief] generation failed", e);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
