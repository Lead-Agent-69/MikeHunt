// Server-side desk access for /api/deals/[id].
// The deal page desk toggle is a client preview, not a security boundary. The API decides what to
// send from the requesting user's SAVED buyer mode (user_preferences.prefs.buyerScope.buyerMode).
// Only flip desks (reseller / dealer) get flip economics and seller contact. Everything else —
// personal, diy, parts, unknown, signed out, or a prefs lookup that fails — gets the redacted
// listing. Fail closed.

import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import {
  discoverDeskForMode,
  type DiscoverDesk,
} from "@/lib/discovery/desk-rails";
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
/** Keep only buyer-safe repair/transport estimates from an analysis blob. */
function safeDealAnalysis(
  dealAnalysis: unknown,
): Record<string, any> | undefined {
  if (!dealAnalysis || typeof dealAnalysis !== "object") return undefined;
  const costs = (dealAnalysis as { costs?: Record<string, unknown> }).costs;
  const safeCosts: Record<string, number> = {};
  if (costs && typeof costs === "object") {
    if (typeof costs.repair === "number") safeCosts.repair = costs.repair;
    if (typeof costs.transport === "number")
      safeCosts.transport = costs.transport;
  }
  return Object.keys(safeCosts).length > 0 ? { costs: safeCosts } : undefined;
}

// Substring terms are unambiguous anywhere in a key. "tel" and "cell" only count as a whole key
// segment (split on _, -, space, dot and camelCase), so seller_tel / sellerTel / cell_number match
// while hotel_parking and excellent_condition survive.
const CONTACT_SUBSTRING = /contact|phone|e[-_ ]?mail|mobile|whatsapp/i;
const CONTACT_SEGMENT = /^(tel|cell)$/i;

export function isContactKey(key: string): boolean {
  if (CONTACT_SUBSTRING.test(key)) return true;
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[_\-\s.]+/)
    .some((seg) => CONTACT_SEGMENT.test(seg));
}

/**
 * Copy of a raw `options` blob without seller contact. Scrapers store seller phone / email under
 * options.contact (and sometimes options.seller.*), and sellerContact() reads it from there, so a
 * card or deal that carries raw options must lose those keys on a non-flip desk.
 */
const SAFE_OPTIONS_MAX_DEPTH = 5;

// options.seller is the scraper's raw seller blob (seller name, address, profile link). A signed-in
// non-flip desk keeps the name (contact keys are stripped by safeOptions); a signed-out guest gets
// none of it (redactSellerForGuest).
const RAW_SELLER_KEYS = new Set([
  "seller",
  "sellerInfo",
  "seller_info",
  "sellerProfile",
]);

function safeOptions(options: unknown, depth = 0): unknown {
  if (!options || typeof options !== "object") return options;
  // Past the depth cap, drop the subtree rather than risk passing contact through unchecked.
  if (depth >= SAFE_OPTIONS_MAX_DEPTH) return undefined;
  if (Array.isArray(options)) {
    return options.map((v) => safeOptions(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(options as Record<string, unknown>)) {
    if (isContactKey(k)) continue;
    out[k] = safeOptions(v, depth + 1);
  }
  return out;
}

export function redactDealForNonFlipDesk<T extends Record<string, any>>(
  deal: T,
): Record<string, any> {
  const out: Record<string, any> = { ...deal };
  for (const key of FLIP_ONLY_FIELDS) delete out[key];
  if ("options" in out) out.options = safeOptions(deal.options);

  const safe = safeDealAnalysis(deal?.dealAnalysis ?? deal?.deal_analysis);
  if (safe) out.dealAnalysis = safe;
  else delete out.dealAnalysis;
  delete out.deal_analysis;
  out.deskAccess = "personal";
  return out;
}

// ── Listing cards (Discover, Feed, Similar) ──────────────────────────────────────────────────────

// Card-level flip economics and seller contact. Market value (sellEstimate) and the listing itself
// stay: a personal buyer still needs "ask vs market" to judge a price.
// Flip economics and seller contact, every key name the feeds use. Market value
// (sellEstimate / estimated_resale / askPrice) stays: a personal buyer still needs
// ask-vs-market. Alias names (snake_case, bulk `profit`, group totals) share this
// one list so /api/scan, best-buy, flash, mispricing, bulk, explore, public/v1,
// map, and find-similar cannot drift from Discover/Feed.
const CARD_FLIP_ONLY_FIELDS = [
  "true_net_profit",
  "trueNetProfit",
  "netProfit",
  "profit",
  "profit_estimate",
  "deal_verdict",
  "dealVerdict",
  "profitEstimate",
  "profit_score",
  "profitScore",
  "score",
  "recommended_max_bid",
  "recommendedMaxBid",
  "estimated_net_profit",
  "roi",
  "roiPct",
  "totalProfit",
  "downsideBuffer",
  "avgRoi",
  "maxProfit",
  "rankScore",
  "ai_wholesale_estimate",
  "ai_retail_estimate",
  "ai_rationale",
  "aiRationale",
  "is_arbitrage_opportunity",
  "contact",
  "sellerPhone",
  "sellerEmail",
  "sellerContactUrl",
  "seller_phone",
  "seller_email",
  "seller_contact_url",
] as const;

/**
 * Buyer-safe copy of a card's forecast. Days-to-sell, velocity and price-drop odds are market facts
 * a personal buyer can use. Urgency is keyed off the flip BUY verdict and projected ROI is flip
 * margin, so both go, along with the reasons that narrate them.
 */
function safePrediction(prediction: unknown): Record<string, any> | null {
  if (!prediction || typeof prediction !== "object") return null;
  const p = prediction as Record<string, any>;
  const reasons = Array.isArray(p.reasons)
    ? p.reasons.filter(
        (r: unknown) =>
          typeof r === "string" && !/\bROI\b|act now|won't last/i.test(r),
      )
    : [];
  return {
    daysToSell: p.daysToSell ?? null,
    velocity: p.velocity ?? "unknown",
    priceDropChance: p.priceDropChance ?? null,
    urgency: "none",
    projectedRoiPct: null,
    reasons,
  };
}

/** Copy of a listing card without flip economics or seller contact. Never mutates the input. */
export function redactListingForNonFlipDesk<T extends Record<string, any>>(
  card: T,
): Record<string, any> {
  const out: Record<string, any> = { ...card };
  for (const key of CARD_FLIP_ONLY_FIELDS) delete out[key];
  if ("options" in out) out.options = safeOptions(card.options);
  if ("prediction" in out) out.prediction = safePrediction(card.prediction);
  // Nested analysis can still carry profit / max-bid; whitelist like deal redaction.
  const safe = safeDealAnalysis(card?.dealAnalysis ?? card?.deal_analysis);
  // Always drop the raw snake_case blob: it carries profit / max bid even when safe costs exist.
  delete out.deal_analysis;
  if (safe) out.dealAnalysis = safe;
  else delete out.dealAnalysis;
  if (Array.isArray(card?.alsoOn)) {
    out.alsoOn = card.alsoOn.map((o: Record<string, any>) =>
      o && typeof o === "object" ? redactListingForNonFlipDesk(o) : o,
    );
  }
  // Bulk groups nest listing rows under `deals`; redact those the same way.
  if (Array.isArray(card?.deals)) {
    out.deals = card.deals.map((o: Record<string, any>) =>
      o && typeof o === "object" ? redactListingForNonFlipDesk(o) : o,
    );
  }
  return out;
}

// Seller identity a signed-out guest never gets: the display name of a (often private) seller plus
// any raw seller blob under options. Signed-in users keep the display name.
const GUEST_SELLER_FIELDS = [
  "seller",
  "sellerName",
  "seller_name",
  "sellerUrl",
  "seller_url",
  "sellerProfileUrl",
];

/** Copy of a deal or card without seller identity, for a signed-out request. Never mutates the input. */
export function redactSellerForGuest<T extends Record<string, any>>(
  item: T,
): Record<string, any> {
  const out: Record<string, any> = { ...item };
  for (const key of GUEST_SELLER_FIELDS) delete out[key];
  if (
    out.options &&
    typeof out.options === "object" &&
    !Array.isArray(out.options)
  ) {
    const opts: Record<string, unknown> = { ...out.options };
    for (const key of Array.from(RAW_SELLER_KEYS)) delete opts[key];
    for (const key of GUEST_SELLER_FIELDS) delete opts[key];
    out.options = opts;
  }
  if (Array.isArray(item?.alsoOn))
    out.alsoOn = item.alsoOn.map((o: Record<string, any>) =>
      o && typeof o === "object" ? redactSellerForGuest(o) : o,
    );
  return out;
}

/** Apply the desk gate to a list. Flip desks get the input; everyone else gets redacted copies. */
export function listingsForDesk<T extends Record<string, any>>(
  items: T[],
  flipDesk: boolean,
): Array<T | Record<string, any>> {
  return flipDesk
    ? items
    : items.map((item) => redactListingForNonFlipDesk(item));
}

/**
 * The CURRENT request's saved desk: "flip" (reseller / dealer), "parts", or "personal". Signed out,
 * no prefs, any other mode, or any lookup error → "personal" (fail closed).
 */
export async function resolveCallerDesk(): Promise<DiscoverDesk> {
  return (await resolveCallerAccess()).desk;
}

/**
 * The CURRENT request's desk plus whether it is signed in. A failed session lookup counts as
 * signed out (guest), so seller identity is redacted (fail closed).
 */
export async function resolveCallerAccess(): Promise<{
  desk: DiscoverDesk;
  signedIn: boolean;
}> {
  let userId: string | undefined;
  try {
    const {
      data: { user },
    } = await getServerUser();
    userId = user?.id;
  } catch {
    return { desk: "personal", signedIn: false };
  }
  if (!userId) return { desk: "personal", signedIn: false };
  try {
    const mode = await readSavedBuyerMode(
      createServerComponentClient(),
      userId,
    );
    return { desk: discoverDeskForMode(mode), signedIn: true };
  } catch {
    return { desk: "personal", signedIn: true };
  }
}

/**
 * Is the CURRENT request from a saved reseller / dealer desk? Signed out, no prefs, any other mode,
 * or any lookup error → false (fail closed).
 */
export async function resolveCallerFlipDesk(): Promise<boolean> {
  return (await resolveCallerDesk()) === "flip";
}
