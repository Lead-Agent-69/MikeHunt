export interface DealCardProps {
  /**
   * Reseller/dealer desk. When false, net profit, max bid, and resale-spread
   * copy are hidden (callers derive this with isFlipBuyerMode, so unknown
   * modes count as personal). Defaults to true for legacy flip-only pages.
   */
  flipDesk?: boolean;
  id: string;
  source: string;
  year: number;
  make: string;
  model: string;
  /** NHTSA-decoded extras surfaced on the card */
  trim?: string;
  bodyClass?: string;
  recallsCount?: number;
  assemblyCountry?: string;
  askPrice: number;
  mmrValue: number;
  profitEstimate: number;
  profitScore?: number;
  locationCity?: string;
  locationState?: string;
  mileage?: number;
  condition?: string;
  damageType?: string;
  titleType?: string;
  /** Engine verdict — surfaced as a colored pill */
  dealVerdict?: "go" | "hold" | "pass";
  /** Recommended max bid (secondary line under net profit) */
  recommendedMaxBid?: number;
  /** Estimated resale value */
  sellEstimate?: number;
  /** What backs the resale estimate. */
  sellBasis?: "comps" | "market" | "baseline";
  valuation?: {
    basis?: "comps" | "market" | "baseline";
    source?:
      | "comparables"
      | "third_party"
      | "historical_estimate"
      | "asking_price"
      | "baseline";
    confidence?: "high" | "medium" | "low" | "none";
    sampleCount?: number;
    compCount?: number;
    compConfidence?: "high" | "medium" | "low" | "none";
    soldCount?: number;
    soldAt?: string | null;
    soldLane?: "clean" | "salvage";
    soldAnchored?: boolean;
    titleTag?: string;
    mileageMult?: number;
    titleMult?: number;
  };
  soldAnchored?: boolean;
  /** Comps unverified: render the profit as "Needs comps" / em dash, never a number. */
  needsComps?: boolean;
  /** Estimated repair/reconditioning cost */
  repairEstimate?: number;
  /** Estimated transport cost */
  transportEstimate?: number;
  /** Analyzer warnings that explain a hold/pass verdict or data risk */
  warnings?: string[];
  /** Price drop information */
  priceDropAmount?: number;
  priceDropDays?: number;
  auctionEndAt?: string | Date;
  bidCount?: number;
  firstSeenAt?: string | Date;
  lastSeenAt?: string | Date;
  imageUrl?: string;
  vin?: string;
  sourceUrl?: string;
  seller?: string;
  sellerType?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerContactUrl?: string;
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
  sourceHealth?: {
    readiness?: string;
    userStatus?: string;
    activeRows?: number;
    rowsWithPhotos?: number;
    photoCoveragePct?: number;
    averageQuality?: number;
    qualityLabel?: string | null;
    freshnessHours?: number | null;
    lastSeenAt?: string | null;
    nextAction?: string | null;
    userImpact?: string | null;
    proofSummary?: string | null;
    proofBadges?: string[];
    completeness?: {
      photosPct?: number;
      vinPct?: number;
      titlePct?: number;
      mileagePct?: number;
      damagePct?: number;
      pricePct?: number;
      locationPct?: number;
      sellerPct?: number;
      sellerContactPct?: number;
      auctionDatePct?: number;
      sourceLinkPct?: number;
    };
  };
  onClick?: () => void;
  isSaved?: boolean;
  onSave?: () => void;
}
