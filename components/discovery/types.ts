import type { DealGrade } from "./DealGradeBadge";

export interface AlsoOn {
  source: string;
  askPrice: number;
  url: string;
}

/** Shape of a single deal in an /api/discover rail. */
export interface DiscoveryDeal {
  id: string;
  source: string;
  sourceUrl?: string;
  title: string;
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  mileage?: number;
  condition?: string;
  damageType?: string;
  askPrice: number;
  sellEstimate?: number;
  /** Honest confidence for the resale estimate (comp-backed vs baseline guess). */
  valueConfidence?: "high" | "good" | "fair" | "estimate";
  /** How many real comps + sales back the resale number (the "backed by N" trust hint). */
  valueEvidence?: number;
  /** Comparable-listing count, separate from sold anchors. */
  compCount?: number;
  sellBasis?: string;
  soldAnchored?: boolean;
  /** When the resale figure was computed, if the analyzer stored it. */
  valueAsOf?: string | null;
  profitScore?: number;
  trueNetProfit?: number;
  recommendedMaxBid?: number;
  repairEstimate?: number;
  transportEstimate?: number;
  dealVerdict?: "go" | "hold" | "pass";
  locationCity?: string;
  locationState?: string;
  images: string[];
  dataQuality?: {
    score: number;
    label: "Excellent" | "Good" | "Thin" | "Sparse";
    missing: string[];
  };
  trustExplanation?: {
    confidence?: "high" | "medium" | "low" | string;
    score?: number;
    reasons?: string[];
    missing?: string[];
    nextChecks?: string[];
    summary?: string;
  };
  segment?: string;
  luxury?: boolean;
  priceTier?: string;
  titleClass?: "clean" | "rebuilt" | "salvage" | "parts" | "unknown";
  /** Channel/risk lane + its color (auction/salvage/repairable/clean-retail/private). */
  lane?: "auction" | "salvage" | "repairable" | "clean-retail" | "private";
  laneColor?: string;
  grade: DealGrade;
  discountPct: number;
  gradeLabel: string;
  alsoOn: AlsoOn[];
  listingCount: number;
  firstSeenAt?: string;
  /** Freshness proof: when the source/importer last confirmed this listing still existed. */
  lastSeenAt?: string;
  /** Optional context line shown on the card (e.g. "32 mi from you", win-pattern reason). */
  winReason?: string;
  /** Why this result appears for the active buyer scope. */
  matchReasons?: string[];
  /** Analyzer warnings that explain risk, hold/pass decisions, or suspicious pricing. */
  warnings?: string[];
  distanceMiles?: number;
  seller?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerContactUrl?: string;
  /** Seller category used by buyer-scope filtering and trust copy. */
  sellerType?: "dealer" | "auction" | "private" | string;
  /** VIN-graph cross-market history red flags + severity (the proprietary moat, surfaced). */
  vinFlags?: string[];
  vinFlagSeverity?: "high" | "info";
  /** Forward-looking forecast (time-to-sell, urgency, price-drop odds) — surfaced as a card chip. */
  prediction?: {
    daysToSell: number | null;
    velocity: "fast" | "normal" | "slow" | "unknown";
    urgency: "act_now" | "soon" | "watch" | "none";
    priceDropChance: number | null;
  };
}

export interface DiscoveryRail {
  key: string;
  title: string;
  subtitle?: string;
  deals: DiscoveryDeal[];
}

export interface DiscoverResponse {
  rails: DiscoveryRail[];
  totalListings: number;
  uniqueVehicles: number;
  mergedDuplicates: number;
  state: string;
  q?: string;
  lane?: string;
  sellerType?: string;
  personalized?: boolean;
  configured?: boolean;
  previewMode?: boolean;
  previewCount?: number;
  previewProof?: Array<{
    id: string;
    status: "working" | "no_rows" | "blocked";
    rows: number;
    matchedRows: number;
    detail?: string;
  }>;
}
