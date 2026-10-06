export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { buildStateArsenal, summarizeArsenal } from "@/lib/scrapers/arsenal";
import { RESEARCHED_DEALER_STATES } from "@/lib/scrapers/sources-registry";

// GET /api/scrape/arsenal?state=TX — every source MikeHunt knows for a state and whether it may
// run (live / restricted / operator_enabled / blocked / candidate), with the terms reason.
// GET /api/scrape/arsenal — per-state counts. Catalog only: this route never fetches a site.
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, {
    key: "scrape-arsenal",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return tooManyRequests(rl);
  const state = String(new URL(req.url).searchParams.get("state") || "")
    .trim()
    .toUpperCase();
  const headers = { "Cache-Control": "public, max-age=300" };
  if (state) {
    if (!/^[A-Z]{2}$/.test(state))
      return NextResponse.json(
        { error: "state must be a 2-letter code" },
        { status: 400 },
      );
    const entries = buildStateArsenal(state);
    return NextResponse.json(
      { state, summary: summarizeArsenal(state, entries), entries },
      { headers },
    );
  }
  return NextResponse.json(
    {
      states: RESEARCHED_DEALER_STATES.map((st) =>
        summarizeArsenal(st, buildStateArsenal(st)),
      ),
    },
    { headers },
  );
}
