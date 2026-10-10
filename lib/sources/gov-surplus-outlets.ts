// Government vehicle outlets by state: where each state actually sells its fleet cars and trucks.
// Every URL comes from the state's own official page (cited in `officialPage`). `access` says how
// MikeHunt may use it:
//   "api"       ingest through an official API (GSA: api.gsa.gov, see lib/scrapers/sources/gsa-official.ts)
//   "link"      deep link only: the marketplace's terms ban automated access (GovDeals/AllSurplus,
//               Public Surplus, Purple Wave, HiBid, Proxibid), so we send the buyer there and don't fetch it
//   "notice"    official state page with sale dates / pre-auction postings; linked, not ingested as deals
// Cars and trucks are what we surface; these outlets also sell equipment, which buyers filter on-site.

export type GovOutletAccess = "api" | "link" | "notice";

export interface GovOutlet {
  state: string; // USPS code, or "US" for federal
  name: string;
  platform: string;
  url: string;
  access: GovOutletAccess;
  officialPage?: string;
  note?: string;
}

export const FEDERAL_OUTLETS: GovOutlet[] = [
  {
    state: "US",
    name: "GSA Auctions (federal surplus)",
    platform: "GSA Auctions",
    url: "https://www.gsaauctions.gov/auctions/auctions-list",
    access: "api",
    officialPage: "https://www.gsaauctions.gov",
    note: "Ingested through the official api.gsa.gov catalog. Lots in every state, including KS/OK/TN/AK/ID/ND when listed.",
  },
];

export const STATE_GOV_OUTLETS: GovOutlet[] = [
  // Kansas
  {
    state: "KS",
    name: "Kansas State Surplus Property",
    platform: "GovDeals",
    url: "https://www.govdeals.com/KansasSurplusProperty",
    access: "link",
    officialPage: "https://admin.ks.gov/offices/printing-mailing-surplus/surplus-property/state-surplus",
  },
  {
    state: "KS",
    name: "Kansas DOT fleet vehicles",
    platform: "Purple Wave",
    url: "https://www.purplewave.com/",
    access: "link",
    note: "KDOT sells fleet SUVs and pickups on Purple Wave (Manhattan, KS). Purple Wave's terms ban robots, so we only link to it.",
  },
  // Oklahoma
  {
    state: "OK",
    name: "Oklahoma OMES State Surplus",
    platform: "GovDeals",
    url: "https://www.govdeals.com/en/surplusok",
    access: "link",
    officialPage:
      "https://oklahoma.gov/omes/divisions/capital-assets-management/surplus/public-online-auction-information.html",
  },
  // Tennessee
  {
    state: "TN",
    name: "Tennessee General Services State Surplus",
    platform: "GovDeals",
    url: "https://www.govdeals.com/tnsurplus",
    access: "link",
    officialPage: "https://www.tn.gov/generalservices/vam/state-surplus/online-auction.html",
    note: "Weekly sales close every Wednesday.",
  },
  // Alaska
  {
    state: "AK",
    name: "Alaska State Surplus Property",
    platform: "GovDeals",
    url: "https://www.govdeals.com/stateofalaska",
    access: "link",
    officialPage: "https://oppm.doa.alaska.gov/property/auctions/",
  },
  {
    state: "AK",
    name: "Alaska DOT&PF State Equipment Fleet disposals",
    platform: "State of Alaska",
    url: "https://dot.alaska.gov/sef/auctionsnew.shtml",
    access: "notice",
    note: "Fleet disposal notices. Sales run on GovDeals.",
  },
  // Idaho
  {
    state: "ID",
    name: "Idaho state agencies on Public Surplus",
    platform: "Public Surplus",
    url: "https://www.publicsurplus.com/sms/state,id/browse/home",
    access: "link",
  },
  {
    state: "ID",
    name: "Idaho SCO Available Surplus Property",
    platform: "State of Idaho (SharePoint list + RSS)",
    url: "https://surprop.sco.idaho.gov/Lists/Available%20Surplus%20Property/AllItems.aspx",
    access: "notice",
    note: "Inter-agency postings with year/make/VIN/mileage and an estimated value, 14-day window. These are not public sale prices, so we don't ingest them as deals. A future 'coming to auction' signal could use the list's RSS feed (no contact fields).",
  },
  // North Dakota
  {
    state: "ND",
    name: "NDDOT State Fleet Vehicle Auctions",
    platform: "Orr Auctioneers (BidOrr)",
    url: "https://www.dot.nd.gov/news-and-events/vehicle-auctions",
    access: "notice",
    note: "Online-only fleet auctions, about 90 vehicles each (Fargo, Bismarck). Lots are on bidorr.com; link only.",
  },
  {
    state: "ND",
    name: "North Dakota OMB State Surplus Property",
    platform: "State of North Dakota",
    url: "https://www.omb.nd.gov/doing-business-state/surplus-property",
    access: "notice",
  },
];

/** Outlets for a state, with federal GSA always included. */
export function govOutletsForState(state: string): GovOutlet[] {
  const st = String(state || "").trim().toUpperCase();
  return [...STATE_GOV_OUTLETS.filter((o) => o.state === st), ...FEDERAL_OUTLETS];
}

/** States that have at least one state/local outlet on file. */
export function statesWithGovOutlets(): string[] {
  return Array.from(new Set(STATE_GOV_OUTLETS.map((o) => o.state))).sort();
}
