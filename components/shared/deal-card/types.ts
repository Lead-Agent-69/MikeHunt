export interface DealCardProps {
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
  /** Engine verdict — surfaced as a colored pill */
  dealVerdict?: "go" | "hold" | "pass";
  /** Recommended max bid (secondary line under net profit) */
  recommendedMaxBid?: number;
  /** Estimated resale value */
  sellEstimate?: number;
  /** Price drop information */
  priceDropAmount?: number;
  priceDropDays?: number;
  firstSeenAt?: string | Date;
  onClick?: () => void;
}
