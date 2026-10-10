/** Filters a buyer set in MikeHunt, mapped onto other sites' own search URLs. */
export interface MultiSiteFilters {
  make?: string;
  model?: string;
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  milesMax?: number;
  zip?: string;
  radiusMi?: number;
  /** Title brand. Only some sites can filter on it; the rest ignore it. */
  title?: "clean" | "salvage" | "rebuilt" | "any";
  /** Trim words ("EX-L", "Lariat"). Sent as a keyword where a site has no trim code we can map. */
  trim?: string;
  body?: MultiSiteBody;
  drivetrain?: MultiSiteDrivetrain;
  fuel?: MultiSiteFuel;
  transmission?: MultiSiteTransmission;
}

export type MultiSiteBody =
  | "sedan"
  | "suv"
  | "truck"
  | "coupe"
  | "hatchback"
  | "minivan"
  | "van"
  | "wagon"
  | "convertible";
export type MultiSiteDrivetrain = "awd" | "4wd" | "fwd" | "rwd";
export type MultiSiteFuel = "gas" | "diesel" | "hybrid" | "electric" | "plugin_hybrid";
export type MultiSiteTransmission = "automatic" | "manual";

export type MultiSiteId =
  | "autotempest"
  | "cars_com"
  | "cargurus"
  | "autotrader"
  | "ebay_motors"
  | "craigslist"
  | "facebook_marketplace"
  | "carmax"
  | "autolist"
  | "truecar"
  | "kbb"
  | "edmunds"
  | "copart"
  | "iaai";

export interface MultiSiteLink {
  site: MultiSiteId;
  label: string;
  url: string;
  /** Filters the site's URL could not carry (shown as a hint so the buyer can set them there). */
  dropped: (keyof MultiSiteFilters)[];
  /** Format confirmed in a real browser (Kera's parity audit, 2026-10-09). */
  verified: boolean;
  /**
   * Filters this link carries with a parameter format taken from the site's own URLs but not yet
   * confirmed in a real browser. If one is wrong the site ignores it; nothing else breaks.
   */
  unconfirmed?: (keyof MultiSiteFilters)[];
}

export interface MultiSiteSite {
  id: MultiSiteId;
  label: string;
  verified: boolean;
  build(filters: MultiSiteFilters): MultiSiteLink | null;
}
