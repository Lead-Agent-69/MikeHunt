// Server-side desk access for /api/deals/[id].
// The deal page desk toggle is a client preview, not a security boundary. The API decides what to
// send from the requesting user's SAVED buyer mode (user_preferences.prefs.buyerScope.buyerMode).
// Only flip desks (reseller / dealer) get flip economics and seller contact. Everything else —
// personal, diy, parts, unknown, signed out, or a prefs lookup that fails — gets the redacted
// listing. Fail closed.

import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

type PrefsClient = {
  from: (table: string) => any;
};

/** Read the saved buyerMode for a user. Returns undefined on any miss or error. */
export async function readSavedBuyerMode(
  supabase: PrefsClient,
  userId: string | null | undefined,
): Promise<unknown> {
  if (!userId) return undefined;
  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("prefs")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return undefined;
    const prefs = (data as { prefs?: unknown }).prefs as
      | { buyerScope?: { buyerMode?: unknown } }
      | null
      | undefined;
    return prefs?.buyerScope?.buyerMode;
  } catch {
    return undefined;
  }
}

/** True only for a saved reseller / dealer mode. Parts, diy, personal, unknown: false. */
export function isFlipDeskMode(savedMode: unknown): boolean {
  return isFlipBuyerMode(savedMode);
}

// Top-level deal fields that are flip economics or seller contact. Never sent to a non-flip desk.
const FLIP_ONLY_FIELDS = [
  "true_net_profit",
  "trueNetProfit",
  "profitEstimate",
  "profitScore",
  "recommendedMaxBid",
  "sellEstimate",
  "mmrValue",
  "dealVerdict",
  "ai_wholesale_estimate",
  "ai_retail_estimate",
  "ai_rationale",
  "is_arbitrage_opportunity",
  "contact",
] as const;

/**
 * Strip flip economics and seller contact from a deal payload. Whitelist, not blacklist, for the
 * analysis blob: only the buyer-facing repair and transport estimates survive, so new profit keys
 * added to deal_analysis later stay hidden by default.
 */
export function redactDealForNonFlipDesk<T extends Record<string, any>>(
  deal: T,
): Record<string, any> {
  const out: Record<string, any> = { ...deal };
  for (const key of FLIP_ONLY_FIELDS) delete out[key];

  const costs = deal?.dealAnalysis?.costs;
  const safeCosts: Record<string, number> = {};
  if (costs && typeof costs === "object") {
    if (typeof costs.repair === "number") safeCosts.repair = costs.repair;
    if (typeof costs.transport === "number")
      safeCosts.transport = costs.transport;
  }
  if (Object.keys(safeCosts).length > 0) {
    out.dealAnalysis = { costs: safeCosts };
  } else {
    delete out.dealAnalysis;
  }
  out.deskAccess = "personal";
  return out;
}

// ── Listing cards (Discover, Feed, Similar) ──────────────────────────────────────────────────────

// Card-level flip economics and seller contact. Market value (sellEstimate) and the listing itself
// stay: a personal buyer still needs "ask vs market" to judge a price.
const CARD_FLIP_ONLY_FIELDS = [
  "true_net_profit",
  "trueNetProfit",
  "netProfit",
  "profitEstimate",
  "profitScore",
  "score",
  "recommendedMaxBid",
  "ai_wholesale_estimate",
  "ai_retail_estimate",
  "ai_rationale",
  "is_arbitrage_opportunity",
  "contact",
  "sellerPhone",
  "sellerEmail",
  "sellerContactUrl",
] as const;

/** Copy of a listing card without flip economics or seller contact. Never mutates the input. */
export function redactListingForNonFlipDesk<T extends Record<string, any>>(
  card: T,
): Record<string, any> {
  const out: Record<string, any> = { ...card };
  for (const key of CARD_FLIP_ONLY_FIELDS) delete out[key];
  if (Array.isArray(card?.alsoOn)) {
    out.alsoOn = card.alsoOn.map((o: Record<string, any>) =>
      o && typeof o === "object" ? redactListingForNonFlipDesk(o) : o,
    );
  }
  return out;
}

/**
 * Is the CURRENT request from a saved reseller / dealer desk? Signed out, no prefs, any other mode,
 * or any lookup error → false (fail closed).
 */
export async function resolveCallerFlipDesk(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await getServerUser();
    if (!user?.id) return false;
    const mode = await readSavedBuyerMode(
      createServerComponentClient(),
      user.id,
    );
    return isFlipDeskMode(mode);
  } catch {
    return false;
  }
}
