export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import {
  readForDesk,
  type CheckListingInput,
  type CheckListingRead,
} from "@/lib/intelligence/check-listing";
import { parseLocation } from "@/lib/intelligence/check-listing-input";
import {
  CHECK_BATCH_MAX,
  CHECK_BATCH_RATE,
  NO_STORE,
  buyerHomeFor,
  loadTrackedDeals,
  savedBuyerHome,
  trackedDealData,
  trackedInput,
} from "@/lib/intelligence/check-listing-server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Deals loaded in parallel on a cold cache (each is ~4 small queries). */
const CONCURRENCY = 5;

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// POST /api/check-listing/batch: the "Check any listing" card for tracked deals, for list cards.
//   { dealIds: string[] (1–20 deal UUIDs), homeState?, homeZip? }
// → { desk, reads: { [dealId]: CheckListingRead }, missing: string[] }
// Market data per deal is computed on demand and cached in memory for 10 min keyed by
// dealId + updated_at (unredacted); the desk read (flip vs personal, gated) runs per request.
// Responses are private, no-store. Free tier: no external services.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { ...CHECK_BATCH_RATE });
  if (!rl.allowed) {
    const limited = tooManyRequests(rl);
    limited.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
    return limited;
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid body" }, 400);
  }
  const rawIds: unknown = body?.dealIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0)
    return json({ error: "Send dealIds: an array of deal ids." }, 400);
  if (rawIds.length > CHECK_BATCH_MAX)
    return json(
      {
        error: `At most ${CHECK_BATCH_MAX} deals per request.`,
        code: "TOO_MANY",
      },
      400,
    );
  if (!rawIds.every((id) => typeof id === "string" && UUID_RE.test(id.trim())))
    return json({ error: "Every deal id must be a valid id." }, 400);
  const ids = Array.from(
    new Set(rawIds.map((id: string) => id.trim().toLowerCase())),
  );
  const home = parseLocation(body?.homeZip, body?.homeState, "home");
  if ("error" in home) return json({ error: home.error }, 400);

  const supabase = createServerComponentClient();
  const [rows, flipDesk, saved] = await Promise.all([
    loadTrackedDeals(supabase, ids),
    resolveCallerFlipDesk(),
    savedBuyerHome(supabase),
  ]);
  const buyerHome = buyerHomeFor(saved, home);

  const reads: Record<string, CheckListingRead> = {};
  const missing: string[] = [];
  const queue = ids.slice();
  async function worker() {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const row = rows.get(id);
      const input = row ? trackedInput(row) : null;
      if (!row || !input || !input.make || !input.model || !(input.price > 0)) {
        missing.push(id);
        continue;
      }
      const data = await trackedDealData(
        supabase,
        row,
        input as CheckListingInput,
      );
      if (!data) {
        missing.push(id);
        continue;
      }
      reads[id] = readForDesk(
        { ...input, dealId: row.id },
        data.comps,
        {
          timing: data.timing,
          priceHistory: data.priceHistory,
          self: data.self,
          buyerHome,
        },
        flipDesk,
      );
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker),
  );
  return json({
    desk: flipDesk ? "flip" : "personal",
    reads,
    missing: ids.filter((i) => missing.includes(i)),
  });
}
