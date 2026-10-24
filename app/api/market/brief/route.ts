import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod/v3";
import { requirePaidAiCaller } from "@/lib/auth/paid-ai";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  activeProvider,
  getTextModel,
  hasTextModel,
} from "@/lib/ai/text-model";
import { cached } from "@/lib/cache";
import { GET as explore } from "../explore/route";
import type { MarketSummary } from "@/lib/market/explorer";
import {
  marketBriefReport,
  readMarketChecks,
  MARKET_NEXT_CHECKS,
} from "@/lib/market/brief";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const caller = await requirePaidAiCaller(req);
  if (!caller.ok) return caller.response;
  const limit = rateLimit(req, {
    key: `market-brief:${caller.userId}`,
    limit: 6,
    windowMs: 60000,
  });
  if (!limit.allowed) return tooManyRequests(limit);
  let query: string;
  try {
    const body = await req.json();
    if (typeof body.query !== "string" || body.query.length > 5000)
      throw new Error();
    query = body.query;
  } catch {
    return NextResponse.json(
      { error: "Choose a market search before requesting a brief." },
      { status: 400 },
    );
  }
  // Recompute evidence on the server. Client-supplied counts and prices are never trusted.
  const params = new URLSearchParams(query);
  params.delete("page");
  params.delete("pageSize");
  const url = new URL("/api/market/explore", req.url);
  url.search = params.toString();
  const response = await explore(
    new NextRequest(url, { headers: req.headers }),
  );
  if (!response.ok) return response;
  const data = await response.json();
  const summary = data.summary as MarketSummary | undefined;
  if (!summary?.count)
    return NextResponse.json({
      report:
        "No indexed inventory matches this search yet. Widen the radius or remove a filter to check more inventory.",
      ai: false,
    });
  const fallback = marketBriefReport(summary, !!data.capped);
  if (!hasTextModel())
    return NextResponse.json({ report: fallback, ai: false });
  try {
    const checks = await cached(
      `market:checks:${data.deskAccess}:${activeProvider()}:${params.toString()}:${JSON.stringify({ ...summary, asOf: undefined })}`,
      600000,
      async () => {
        const result = await generateText({
          model: getTextModel(),
          maxOutputTokens: 256,
          output: Output.object({
            schema: z.object({
              checks: z
                .array(
                  z.enum([
                    "confirm_price",
                    "check_photos",
                    "check_freshness",
                    "inspect_condition",
                    "verify_location",
                  ]),
                )
                .length(2),
            }),
          }),
          temperature: 0.2,
          prompt: `Prioritize two next checks for this indexed vehicle inventory search. Return an object with a checks array of two distinct check IDs from this allowed dictionary: ${JSON.stringify(MARKET_NEXT_CHECKS)}. Aggregate evidence: ${JSON.stringify({ ...summary, asOf: undefined, sources: undefined, sourceCount: Object.keys(summary.sources).length, capped: !!data.capped })}. Last observed is not newly added. An unknown amount can be advertised but unverified; it is not necessarily missing. Cash asking medians are not completed sales or valuations. Choose checks only; do not write any prose, numbers, prices, trends, recommendations to buy, or new check IDs.`,
        });
        return readMarketChecks(JSON.stringify(result.output.checks));
      },
    );
    return NextResponse.json({
      report: checks
        ? marketBriefReport(summary, !!data.capped, checks)
        : fallback,
      ai: !!checks,
    });
  } catch {
    return NextResponse.json({ report: fallback, ai: false });
  }
}
