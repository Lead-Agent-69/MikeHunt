export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import {
  PROMPT_FACET_RE,
  SIGNAL_KINDS,
  type SignalKind,
} from "@/lib/intelligence/affinity";
import { UUID_RE, dealSnapshot } from "@/lib/reco/signals";

// POST /api/reco/signal — record one view signal for the signed-in user.
// Body: { dealId?, kind, dwellMs?, facet? }
//   kind: open | dwell | save | unsave | dismiss | interest_yes | interest_no
//   dwellMs: required for "dwell" (0..3,600,000)
//   facet: required for interest_yes / interest_no (the facet /api/reco/prompt returned)
// Guests get 401 and nothing is written. Listing attributes are looked up server-side from the
// deal row, never taken from the client. A missing table (migration not applied) answers 202
// { ok: false } so a page beacon never breaks.

const DEAL_KINDS = new Set<SignalKind>([
  "open",
  "dwell",
  "save",
  "unsave",
  "dismiss",
]);

export async function POST(req: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const rl = rateLimit(req, {
    key: "reco-signal",
    limit: 120,
    windowMs: 60_000,
    identity: `user:${user.id}`,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  let body: Record<string, unknown>;
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = String(body.kind || "") as SignalKind;
  if (!(SIGNAL_KINDS as readonly string[]).includes(kind))
    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });

  const dealId = typeof body.dealId === "string" ? body.dealId.trim() : "";
  if (dealId && !UUID_RE.test(dealId))
    return NextResponse.json({ error: "Invalid dealId" }, { status: 400 });
  if (DEAL_KINDS.has(kind) && !dealId)
    return NextResponse.json({ error: "dealId required" }, { status: 400 });

  let dwellMs: number | null = null;
  if (kind === "dwell") {
    const n = Math.round(Number(body.dwellMs));
    if (!Number.isFinite(n) || n < 0 || n > 3_600_000)
      return NextResponse.json({ error: "Invalid dwellMs" }, { status: 400 });
    dwellMs = n;
  }

  let facet: string | null = null;
  if (kind === "interest_yes" || kind === "interest_no") {
    facet = typeof body.facet === "string" ? body.facet.trim() : "";
    if (!PROMPT_FACET_RE.test(facet))
      return NextResponse.json({ error: "Invalid facet" }, { status: 400 });
  }

  if (!isSupabaseConfigured())
    return NextResponse.json({ ok: false }, { status: 202 });

  const sb = createServerComponentClient();
  let snapshot = {};
  if (dealId) {
    const { data: deal } = await sb
      .from("deals")
      .select(
        "id, make, model, year, ask_price, body_class, location_state, source, condition",
      )
      .eq("id", dealId)
      .maybeSingle();
    if (!deal && DEAL_KINDS.has(kind))
      return NextResponse.json({ error: "Unknown deal" }, { status: 404 });
    snapshot = dealSnapshot(deal);
  }

  try {
    const { error } = await sb.from("deal_signals").insert({
      user_id: user.id,
      deal_id: dealId || null,
      kind,
      dwell_ms: dwellMs,
      facet,
      ...snapshot,
    });
    if (error) {
      console.warn("[reco/signal] insert failed:", error.message);
      return NextResponse.json({ ok: false }, { status: 202 });
    }
  } catch (e) {
    console.warn("[reco/signal] insert threw:", (e as Error).message);
    return NextResponse.json({ ok: false }, { status: 202 });
  }
  return NextResponse.json(
    { ok: true },
    { status: 202, headers: { "Cache-Control": "private, no-store" } },
  );
}
