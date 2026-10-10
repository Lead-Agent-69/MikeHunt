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
}

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
  | "truecar";

export interface MultiSiteLink {
  site: MultiSiteId;
  label: string;
  url: string;
  /** Filters the site's URL could not carry (shown as a hint so the buyer can set them there). */
  dropped: (keyof MultiSiteFilters)[];
  /** Format confirmed in a real browser (Kera's parity audit, 2026-10-09). */
  verified: boolean;
}

export interface MultiSiteSite {
  id: MultiSiteId;
  label: string;
  verified: boolean;
  build(filters: MultiSiteFilters): MultiSiteLink | null;
}
