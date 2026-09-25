// lib/discovery/categorize.ts
// The "smart" layer that turns raw scraped deals into a categorized, rated discovery feed —
// the CarGurus/Kayak mechanism: a market-relative deal grade + segment/price/title tags so the
// app can present the most useful, browsable view. Pure functions, $0, no external APIs.

import { isAuctionChannel } from "@/lib/sources/source-meta";

export type Segment =
  | "truck"
  | "suv"
  | "sedan"
  | "coupe"
  | "convertible"
  | "van"
  | "ev"
  | "other";
export type PriceTier = "budget" | "mid" | "premium" | "luxury";
export type DealGrade = "great" | "good" | "fair" | "high" | "unknown";
export type TitleClass = "clean" | "rebuilt" | "salvage" | "parts" | "unknown";

const RE_EV =
  /\b(tesla|model ?[3sxy]|leaf|bolt|mach-?e|ioniq|ev6|niro ?ev|kona ?electric|lightning|rivian|r1[ts]|lucid|air|polestar|id\.?[34]|e-?tron|taycan|byd|nio|xpeng|fisker|vinfast|solterra|bz4x|lyriq|blazer ?ev|equinox ?ev|silverado ?ev|hummer ?ev)\b/;
const RE_TRUCK =
  /\b(silverado|sierra|f-?150|f-?250|f-?350|f-?450|ram ?(1500|2500|3500)?|1500|2500|3500|tundra|tacoma|titan|frontier|ranger|colorado|canyon|ridgeline|gladiator|maverick|santa ?cruz|dakota|avalanche)\b/;
const RE_SUV =
  /\b(suv|tahoe|suburban|yukon|expedition|explorer|wrangler|4-?runner|highlander|pilot|telluride|palisade|cherokee|durango|sequoia|bronco|escalade|equinox|rav-?4|cr-?v|rogue|escape|edge|traverse|pathfinder|armada|navigator|qx\d{2}|mdx|rdx|rx ?\d|gx ?\d|lx ?\d|tahoe|blazer|trailblazer|ascent|outback|forester|cx-?\d|murano|kicks|trax|encore|envision|gle|glc|gls|x[1-7]\b|q[3578])\b/;
const RE_COUPE =
  /\b(coupe|mustang|camaro|challenger|corvette|supra|gt-?r|\bm[2-8]\b|911|cayman|brz|gr86|frs|370z|350z)\b/;
const RE_CONV = /\b(convertible|roadster|spyder|cabriolet|miata|boxster|z4)\b/;
const RE_VAN =
  /\b(van|sienna|odyssey|caravan|pacifica|transit|sprinter|express|savana|promaster|metris)\b/;
const RE_LUX =
  /\b(mercedes|mercedes-benz|amg|maybach|bmw|alpina|audi|lexus|porsche|jaguar|land ?rover|range ?rover|bentley|maserati|ferrari|lamborghini|rolls-?royce|aston|aston ?martin|cadillac|infiniti|acura|genesis|tesla|lucid|rivian|alfa|alfa ?romeo|pagani|koenigsegg|bugatti|mclaren|lotus|rimac|zenvo|polestar|lincoln)\b/;

export function segmentOf(
  make?: string | null,
  model?: string | null,
): Segment {
  const t = `${make || ""} ${model || ""}`.toLowerCase();
  if (RE_EV.test(t)) return "ev";
  if (RE_TRUCK.test(t)) return "truck";
  if (RE_VAN.test(t)) return "van";
  if (RE_SUV.test(t)) return "suv";
  if (RE_CONV.test(t)) return "convertible";
  if (RE_COUPE.test(t)) return "coupe";
  return "sedan";
}

export function isLuxury(make?: string | null, model?: string | null): boolean {
  return RE_LUX.test(`${make || ""} ${model || ""}`.toLowerCase());
}

export function priceTier(ask?: number | null): PriceTier {
  const p = ask || 0;
  if (p < 10000) return "budget";
  if (p < 25000) return "mid";
  if (p < 50000) return "premium";
  return "luxury";
}

export function titleClass(condition?: string | null): TitleClass {
  const c = (condition || "").toLowerCase();
  if (c.includes("salvage")) return "salvage";
  if (c.includes("rebuilt")) return "rebuilt";
  if (c.includes("parts")) return "parts";
  if (c.includes("clean") || c.includes("run_drive")) return "clean";
  return "unknown";
}

// Acquisition lanes — the way a flipping dealer actually sorts inventory. One lane per deal
// (prioritized): an auction lot is browsed as an auction even though it's usually salvage; a
// non-auction salvage/parts car is its own lane; rebuilt/damaged-but-fixable is "repairable"; a
// clean car splits into dealer retail vs private/classified. Powers the category view + filters.
export type DealLane =
  | "auction"
  | "salvage"
  | "repairable"
  | "clean-retail"
  | "private";

const LANE_AUCTION = new Set([
  "copart",
  "iaa",
  "adesa",
  "manheim",
  "acv",
  "gov_auction",
]);
const LANE_RETAIL = new Set([
  "carvana",
  "cars_com",
  "cargurus",
  "autotrader",
  "truecar",
  "ebay_motors",
  "vroom",
  "carmax",
]);

export const DEAL_LANES: { lane: DealLane; label: string }[] = [
  { lane: "auction", label: "Auction lots" },
  { lane: "salvage", label: "Salvage" },
  { lane: "repairable", label: "Repairable" },
  { lane: "clean-retail", label: "Clean retail" },
  { lane: "private", label: "Private / classifieds" },
];

// Color coding so a dealer instantly reads the channel/risk at a glance: green = clean & safe,
// red/orange = branded/auction risk, blue = private. Used on cards, table rows, lane chips.
export const LANE_COLORS: Record<DealLane, string> = {
  auction: "#f59e0b", // amber — auction lots
  salvage: "#ef4444", // red — branded/total-loss
  repairable: "#fb923c", // orange — fixable
  "clean-retail": "#22c55e", // green — clean retail
  private: "#3b82f6", // blue — private/classified
};

export const laneColor = (lane: DealLane): string => LANE_COLORS[lane];

export function dealLane(deal: {
  source?: string | null;
  condition?: string | null;
  damage_type?: string | null;
}): DealLane {
  const src = (deal.source || "").toLowerCase().trim();
  const cond = (deal.condition || "").toLowerCase();
  const dmg = (deal.damage_type || "").toLowerCase();
  if (LANE_AUCTION.has(src)) return "auction"; // auction channel first (mostly salvage, but browsed as lots)
  if (/salvage|parts|flood|fire|junk|non[-\s]?run|wrecked/.test(cond))
    return "salvage";
  const damaged =
    /rebuilt|repairable|hail|damage/.test(cond) ||
    (dmg !== "" && dmg !== "none");
  if (damaged) return "repairable";
  if (LANE_RETAIL.has(src)) return "clean-retail";
  return "private";
}

export interface GradeResult {
  grade: DealGrade;
  discountPct: number; // % below estimated market (negative = above market)
  label: string;
}

/**
 * Market-relative deal rating — the CarGurus "Great Deal" mechanism. Compares ask price to the
 * comps-based market value (sell_estimate). The deeper below market, the better the grade.
 */
export function dealGrade(
  ask?: number | null,
  marketValue?: number | null,
): GradeResult {
  if (!ask || ask <= 0 || !marketValue || marketValue <= 0) {
    return { grade: "unknown", discountPct: 0, label: "No market data" };
  }
  const disc = (marketValue - ask) / marketValue;
  const discountPct = Math.round(disc * 100);
  if (disc >= 0.25) return { grade: "great", discountPct, label: "Great Deal" };
  if (disc >= 0.12) return { grade: "good", discountPct, label: "Good Deal" };
  if (disc >= 0.03) return { grade: "fair", discountPct, label: "Fair Price" };
  return { grade: "high", discountPct, label: "Priced High" };
}

// Distressed-seller signals — the Priceline "Express Deal" analog. These listings tend to
// cluster below market and need to be surfaced fast.
const RE_DISTRESS =
  /\b(repo|repossess|repossession|estate sale|estate|liquidation|liquidat|bankruptcy|must ?sell|mechanic.?special|project car|needs? (work|engine|trans|tlc)|divorce|relocat|moving sale|deployed|deployment|quick sale|cash ?only|asap|price reduced|reduced price|make ?offer|obo|no title needed|fixer|as-?is)\b/;

export function isDistressed(
  title?: string | null,
  grade?: DealGrade,
): boolean {
  const distressedWords = RE_DISTRESS.test((title || "").toLowerCase());
  // A genuinely great market-graded deal is also "distressed pricing" worth flagging.
  return distressedWords || grade === "great";
}

// Availability (Visor "On Lot / In Transit / Online only"), from listing text — a dealer needs to
// know if they can inspect the car or are buying it sight-unseen.
export function detectAvailability(
  title?: string | null,
  description?: string | null,
): string {
  const t = `${title || ""} ${description || ""}`.toLowerCase();
  if (/\bin[\s-]?transit\b|en route|arriving soon|on its way/.test(t))
    return "in_transit";
  if (/in production|being built|factory order|build to order/.test(t))
    return "in_production";
  if (/online[\s-]?only|virtual|no physical|delivery only/.test(t))
    return "online_only";
  return "on_lot";
}

/** Auction urgency / heat from time remaining (Booking-style scarcity). */
export type Heat = "hot" | "warm" | "live" | "none";
export function auctionHeat(
  auctionEndAt?: string | null,
  now = Date.now(),
): { heat: Heat; hoursLeft: number | null } {
  if (!auctionEndAt) return { heat: "none", hoursLeft: null };
  const end = new Date(auctionEndAt).getTime();
  if (!Number.isFinite(end)) return { heat: "none", hoursLeft: null };
  const hoursLeft = (end - now) / 3_600_000;
  if (hoursLeft <= 0) return { heat: "none", hoursLeft: 0 };
  if (hoursLeft <= 6) return { heat: "hot", hoursLeft };
  if (hoursLeft <= 24) return { heat: "warm", hoursLeft };
  if (hoursLeft <= 72) return { heat: "live", hoursLeft };
  return { heat: "none", hoursLeft };
}

export interface DealTags {
  segment: Segment;
  luxury: boolean;
  priceTier: PriceTier;
  titleClass: TitleClass;
  grade: DealGrade;
  discountPct: number;
  gradeLabel: string;
  distressed: boolean;
}

/** Compute all discovery tags for a deal row (snake_case DB shape). */
export function categorize(deal: {
  title?: string | null;
  make?: string | null;
  model?: string | null;
  ask_price?: number | null;
  condition?: string | null;
  sell_estimate?: number | null;
  mmr_value?: number | null;
  // 'comps' | 'market' | 'markup' — only real comps/market values give an honest grade;
  // a markup-on-ask value yields a circular "discount", so we don't grade those (CarGurus
  // only badges a car when it has enough real comparables).
  sellBasis?: string | null;
  // For auction lots, ask_price is just the CURRENT/opening bid — grading off it fakes a huge discount.
  source?: string | null;
  recommended_max_bid?: number | null;
}): DealTags {
  const trusted =
    deal.sellBasis === "comps" ||
    deal.sellBasis === "market" ||
    (!deal.sellBasis && deal.mmr_value);
  const market = trusted
    ? (deal.sell_estimate ?? deal.mmr_value) || null
    : null;
  // An auction's opening/current bid will rise, so a low bid isn't a real discount. Grade against the
  // realistic acquisition cost — the higher of the current bid and the engine's recommended max bid — so
  // an opening bid never fakes a "Great Deal", and an overheated lot (bid above max) grades down honestly.
  const isAuction = isAuctionChannel(deal.source);
  const gradeAgainst =
    isAuction && deal.recommended_max_bid && deal.recommended_max_bid > 0
      ? Math.max(deal.ask_price || 0, deal.recommended_max_bid)
      : deal.ask_price;
  const g = dealGrade(gradeAgainst, market);
  const tier = priceTier(deal.ask_price);
  return {
    segment: segmentOf(deal.make, deal.model),
    // Badge-based detection first; but never let an unknown/rare marque (a Pagani, a Rimac, an
    // import not in the regex) fall out of the Luxury rail — a high resale value or a luxury-tier
    // ask is itself a luxury signal. No make left behind.
    luxury:
      isLuxury(deal.make, deal.model) ||
      tier === "luxury" ||
      (market != null && market >= 55000),
    priceTier: tier,
    titleClass: titleClass(deal.condition),
    grade: g.grade,
    discountPct: g.discountPct,
    gradeLabel: g.label,
    distressed: isDistressed(deal.title, g.grade),
  };
}
