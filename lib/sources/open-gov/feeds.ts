// Open government vehicle feeds: surplus, fleet, impound and abandoned-vehicle lists that cities and
// states publish themselves. Researched 2026-10-10 (CT); evidence and counts are in
// docs/sources-master.md (section "Open government data").
//
// Rules for every feed here (plain data module, no fetch code):
//   - Cars and trucks only (see `isOpenGovCarOrTruck` in ./parse).
//   - Store FACTS only: VIN, year, make, model, mileage, price/amount (labeled), date, location, plus
//     a link back to `officialPage`. Never rehost the PDF/XLSX/HTML file itself.
//   - Poll at most daily (weekly is enough for most lists) and honor robots (Memphis crawl-delay 10).
//   - `gated` feeds (AssetWorks storefronts, GovDeals/Copart venues) are deep links only, never fetched.
//
// Not wired into the Zeus runner yet. Turning a feed on is a deploy step; see
// docs/zeus-deploy-checklist.md.

export type OpenGovFormat =
  | "soda-json" // Socrata SODA API (anonymous at this volume)
  | "html-table"
  | "pdf-text" // text PDF: pdftotext -layout, then a VIN-line regex
  | "pdf-scanned" // image PDF: needs OCR (tesseract), a later step
  | "xlsx"
  | "storefront"; // gated marketplace storefront: deep link only

/** What a row becomes: a buyable listing, a sold-price comp, or a lead (car on a lot / pre-auction). */
export type OpenGovRole = "listing" | "sold_comp" | "lead" | "deep_link";

export type OpenGovIngest =
  | "parser" // a pure parser exists in ./parse
  | "parser-pending-ocr"
  | "link-only";

export interface OpenGovFeed {
  id: string;
  name: string;
  state: string;
  city?: string;
  /** The machine-readable endpoint or the file/page we read. */
  url: string;
  /** Official page we link back to (and the only link buyers see when bidding is gated). */
  officialPage: string;
  format: OpenGovFormat;
  role: OpenGovRole;
  ingest: OpenGovIngest;
  cadence: string;
  license: string;
  fields: string;
  /** What the price field means. null = no price in the source (UI must not invent one). */
  priceMeaning: string | null;
  /** Count observed on the research date, from the source itself. */
  observed: string;
  /** Where bidding happens, when that venue is gated (we never link to it). */
  gatedVenue?: string;
  notes?: string;
  /** Rank in the open-gov research (1-10 = top 10). */
  rank: number;
}

export const OPEN_GOV_FEED_SPECS: OpenGovFeed[] = [
  {
    id: "gov-seattle-fleet-surplus",
    name: "Seattle FAS Current Fleet Surplus/Auction List",
    state: "WA",
    city: "Seattle",
    url: "https://cos-data.seattle.gov/resource/6gnm-7jex.json",
    officialPage: "https://data.seattle.gov/d/6gnm-7jex",
    format: "soda-json",
    role: "lead",
    ingest: "parser",
    cadence: "monthly (rowsUpdatedAt 2026-08-18)",
    license: "Public Domain (Socrata metadata)",
    fields:
      "equip_id, year, make, model, VIN, description, system_group, fuel, auction_house, retirement_date",
    priceMeaning: null,
    observed: "88 rows, 64 cars/trucks (2026-10-10)",
    gatedVenue: "Bidadoo / Murphy's (commercial auctioneers)",
    notes: "Pipeline: retired and sent to auction. No price or end date.",
    rank: 6,
  },
  {
    id: "gov-seattle-fleet-sold",
    name: "Seattle FAS Sold Fleet Equipment (sold comps)",
    state: "WA",
    city: "Seattle",
    url: "https://cos-data.seattle.gov/resource/y6ef-jf2w.json",
    officialPage: "https://data.seattle.gov/d/y6ef-jf2w",
    format: "soda-json",
    role: "sold_comp",
    ingest: "parser",
    cadence: "labeled monthly; last sale_date 2025-12-19",
    license: "Public Domain (Socrata metadata)",
    fields: "year, make, model, VIN, sale_price, sale_date, sold_by",
    priceMeaning: "real sale price (sold_listings comp, basis='sold')",
    observed: "267 sold rows, 0 active",
    rank: 10,
  },
  {
    id: "gov-norfolk-towing",
    name: "Norfolk VA Towing (impound lot + auction results)",
    state: "VA",
    city: "Norfolk",
    url: "https://data.norfolk.gov/resource/4dwc-v3t8.json",
    officialPage: "https://www.norfolk.gov/416/Towing-Recovery",
    format: "soda-json",
    role: "lead",
    ingest: "parser",
    cadence: "daily (rowsUpdatedAt 2026-10-09)",
    license: "Norfolk open data portal terms (license field empty)",
    fields:
      "VIN, plate, year, make, model, color, tow_type, storage_lot, auction_date, sold_for, release_status",
    priceMeaning:
      "sold_for = real auction sale price on auctioned rows (sold comp); none on lot rows",
    observed:
      "45,812 rows; 849 impounded/abandoned still on the lot; 165 sold in Sep/Oct 2026 auctions",
    notes:
      "Two roles: lot rows are leads, auctioned rows with sold_for > 0 are sold comps.",
    rank: 9,
  },
  {
    id: "gov-wv-direct-vehicle-sales",
    name: "West Virginia Surplus Direct Vehicle Sales List",
    state: "WV",
    url: "https://administration.wv.gov/surplus/Inventory/state-property/Pages/Vehicle-Sales-List.aspx",
    officialPage:
      "https://administration.wv.gov/surplus/Inventory/state-property/Pages/Vehicle-Sales-List.aspx",
    format: "html-table",
    role: "listing",
    ingest: "parser",
    cadence: "weekly on Wednesdays (Last Updated 10/07/2026)",
    license: "unclear (state public notice): facts only, link back",
    fields: "tag #, year, make/model/color, VIN, mileage, fixed price",
    priceMeaning: "fixed buy-now price set by the state",
    observed: "28 vehicles, 28 VINs",
    notes:
      "No robots.txt (404). WV online auctions run on GovDeals (gated) and are not read.",
    rank: 7,
  },
  {
    id: "gov-delaware-fleet-bulletin",
    name: "Delaware OMB Fleet Services surplus vehicle bulletin",
    state: "DE",
    url: "https://gss.omb.delaware.gov/surplus/documents/vehicle-bulletin.pdf",
    officialPage: "https://gss.omb.delaware.gov/surplus/",
    format: "pdf-text",
    role: "lead",
    ingest: "parser",
    cadence: "rolling (list as of 10/3/2026)",
    license: "unclear (state public notice): facts only, link back",
    fields:
      "year, model (make decoded from VIN), fleet #, mileage, VIN, category",
    priceMeaning: null,
    observed: "82 vehicles (Total Vehicles line)",
    gatedVenue: "usgovbid.com (commercial)",
    notes:
      "Two-week agency notice, then public sale. No price or end date in the bulletin.",
    rank: 4,
  },
  {
    id: "gov-baltimore-impound",
    name: "Baltimore City DOT bi-weekly impound auction list",
    state: "MD",
    city: "Baltimore",
    url: "https://www.baltimorecity.gov/transportation/our-work/towing/auction-listings",
    officialPage:
      "https://www.baltimorecity.gov/transportation/our-work/towing/auction-listings",
    format: "pdf-text",
    role: "lead",
    ingest: "parser",
    cadence: "every 2 weeks (next auction 2026-10-14)",
    license: "unclear (city public notice): facts only, link back",
    fields: "lot, stock #, 2-digit year, make, body, VIN, location code",
    priceMeaning: null,
    observed: "798 per the header, 773 unique VINs parsed",
    gatedVenue: "GovDeals (per the PDF) / Copart (per the city page)",
    notes:
      "Link ONLY to the city page. Never link to or read the auction venue.",
    rank: 1,
  },
  {
    id: "gov-montgomery-md-police-auction",
    name: "Montgomery County MD Police vehicle recovery auction",
    state: "MD",
    city: "Gaithersburg",
    url: "https://www.montgomerycountymd.gov/montgomery-county-police-department/how-do-i/vehicle-auction",
    officialPage:
      "https://www.montgomerycountymd.gov/montgomery-county-police-department/how-do-i/vehicle-auction",
    format: "pdf-text",
    role: "lead",
    ingest: "parser",
    cadence: "monthly, 4th Saturday (next 2026-10-24, in person)",
    license: "unclear (county public notice): facts only, link back",
    fields: "case #, 2-digit year, make, body, VIN, mileage (sometimes)",
    priceMeaning: "$50 minimum bid (label as minimum bid, not a price)",
    observed: "312 unique VINs",
    rank: 2,
  },
  {
    id: "gov-honolulu-abandoned-auction",
    name: "Honolulu abandoned/unclaimed vehicle auction",
    state: "HI",
    city: "Honolulu",
    url: "https://www.honolulu.gov/csd/public-auction-of-abandoned-and-unclaimed-vehicles/",
    officialPage:
      "https://www.honolulu.gov/csd/public-auction-of-abandoned-and-unclaimed-vehicles/",
    format: "pdf-text",
    role: "lead",
    ingest: "parser",
    cadence: "monthly (bidding opens 2026-10-14/15 on vss.honolulu.gov)",
    license: "unclear (© Dept. of Customer Services): facts only, link back",
    fields:
      "make, plate, VIN, color, 2-digit year, body, tow/storage/total owed, lot address",
    priceMeaning:
      "total owed (tow + storage) the buyer pays; $50 minimum bid. Label it, never call it a price",
    observed: "268 unique VINs",
    notes:
      "robots.txt allows * (blocks some AI crawlers by name). Bidding is the city's own VSS site.",
    rank: 3,
  },
  {
    id: "gov-boston-impound-auction",
    name: "Boston Police / BTD impound auction",
    state: "MA",
    city: "Boston",
    url: "https://www.boston.gov/departments/transportation/abandoned-and-impounded-vehicles",
    officialPage:
      "https://www.boston.gov/departments/transportation/abandoned-and-impounded-vehicles",
    format: "pdf-text",
    role: "lead",
    ingest: "parser",
    cadence: "every 1-3 months (next 2026-10-24, cash, in person)",
    license: "unclear (city public notice): facts only, link back",
    fields: "lot #, make abbreviation, color, 2-digit year (no VIN, no model)",
    priceMeaning: null,
    observed: "61 lots (E1-E61)",
    notes:
      "No VINs, so rows can't dedupe or decode; show as an auction-day lead only.",
    rank: 8,
  },
  {
    id: "gov-memphis-auto-auctions",
    name: "Memphis TN weekly impound sales list",
    state: "TN",
    city: "Memphis",
    url: "https://memphistn.gov/city-auto-auctions/",
    officialPage: "https://memphistn.gov/city-auto-auctions/",
    format: "pdf-scanned",
    role: "lead",
    ingest: "parser-pending-ocr",
    cadence: "weekly (posted Mondays, auction Wednesdays)",
    license: "unclear (city public notice): facts only, link back",
    fields: "tag, ticket, year, make, VIN, tow charge, lot date",
    priceMeaning: null,
    observed: "10-05 list: 6 pages, total not counted (scanned)",
    gatedVenue: "venture-auctions / HiBid",
    notes:
      "Scanned PDF: needs OCR (tesseract) before parseVinListText can read it. robots crawl-delay 10.",
    rank: 5,
  },
  {
    id: "gov-memphis-auto-auctions-surplus",
    name: "Memphis TN quarterly surplus fleet list (XLSX)",
    state: "TN",
    city: "Memphis",
    url: "https://memphistn.gov/city-auto-auctions/",
    officialPage: "https://memphistn.gov/city-auto-auctions/",
    format: "xlsx",
    role: "lead",
    ingest: "parser",
    cadence: "quarterly (last lists 2026-05-08 and 2026-06-26, both past)",
    license: "unclear (city public notice): facts only, link back",
    fields: "unit #, year, make, model, body, VIN, title state, keys",
    priceMeaning: null,
    observed:
      "133 + 131 rows (past sales; historical until the next quarterly list)",
    notes:
      "XLSX rows are mapped with mapMemphisSurplusRow once read by a sheet reader.",
    rank: 5,
  },
  // ── Gated state storefronts: deep links only ──
  {
    id: "gov-sc-surplus-storefront",
    name: "South Carolina State Surplus Property (AssetWorks storefront)",
    state: "SC",
    url: "https://admin.sc.gov/services/surplus-property/public-auctions",
    officialPage: "https://admin.sc.gov/services/surplus-property",
    format: "storefront",
    role: "deep_link",
    ingest: "link-only",
    cadence: "bi-weekly live auctions, West Columbia",
    license: "AssetWorks storefront; robots.txt returns 403: treated as gated",
    fields: "n/a",
    priceMeaning: null,
    observed: "not fetched",
    notes:
      "Deep link only. AssetWorks also runs PublicSurplus (terms ban automation).",
    rank: 0,
  },
  {
    id: "gov-vt-surplus-storefront",
    name: "Vermont BGS Surplus Property (AssetWorks storefront)",
    state: "VT",
    url: "https://bgs.vermont.gov/gbs/surplus",
    officialPage: "https://bgs.vermont.gov/gbs/surplus",
    format: "storefront",
    role: "deep_link",
    ingest: "link-only",
    cadence: "rolling",
    license: "AssetWorks storefront; robots.txt returns 403: treated as gated",
    fields: "n/a",
    priceMeaning: null,
    observed: "not fetched",
    notes: "Deep link only.",
    rank: 0,
  },
  // ── Lower-ranked open feeds: catalogued leads, no parser yet ──
  {
    id: "gov-nyc-dcas-auction",
    name: "NYC DCAS Vehicle Auction List",
    state: "NY",
    city: "New York",
    url: "https://data.cityofnewyork.us/resource/ynic-uz5i.json",
    officialPage: "https://data.cityofnewyork.us/d/ynic-uz5i",
    format: "soda-json",
    role: "lead",
    ingest: "link-only",
    cadence: "weekly, automated (rows appear on/after the close date)",
    license: "NYC Open Data terms (license field empty)",
    fields: "auction_close_date, year, make, model, VIN (no price)",
    priceMeaning: null,
    observed: "12,622 since 2020; 0 future-dated",
    notes:
      "Historical today; test lead time with daily polling before building a parser.",
    rank: 11,
  },
  {
    id: "gov-chicago-towed",
    name: "Chicago Towed Vehicles (90-day locator)",
    state: "IL",
    city: "Chicago",
    url: "https://data.cityofchicago.org/resource/ygr5-vcbg.json",
    officialPage: "https://data.cityofchicago.org/d/ygr5-vcbg",
    format: "soda-json",
    role: "lead",
    ingest: "link-only",
    cadence: "daily",
    license: "Chicago portal terms",
    fields:
      "tow_date, make, style, model, color, plate, tow yard, inventory # (no VIN)",
    priceMeaning: null,
    observed: "6,912 rolling",
    notes: "Locator only; impound-auction lead.",
    rank: 12,
  },
  {
    id: "gov-chicago-relocated",
    name: "Chicago Relocated Vehicles",
    state: "IL",
    city: "Chicago",
    url: "https://data.cityofchicago.org/resource/5k2z-suxx.json",
    officialPage: "https://data.cityofchicago.org/d/5k2z-suxx",
    format: "soda-json",
    role: "lead",
    ingest: "link-only",
    cadence: "daily",
    license: "Chicago portal terms",
    fields: "date, make, color, plate, from/to address, reason",
    priceMeaning: null,
    observed: "4,162",
    notes: "Locator only.",
    rank: 13,
  },
  {
    id: "gov-cambridge-tow-log",
    name: "Cambridge MA Tow Log",
    state: "MA",
    city: "Cambridge",
    url: "https://data.cambridgema.gov/resource/aa6j-h24p.json",
    officialPage: "https://data.cambridgema.gov/d/aa6j-h24p",
    format: "soda-json",
    role: "lead",
    ingest: "link-only",
    cadence: "rowsUpdatedAt 2026-09-15",
    license: "ODC-PDDL",
    fields: "tow datetime, year, make, model, color, towed_by, reason (no VIN)",
    priceMeaning: null,
    observed: "112,178 historical",
    notes: "History only, no sale data.",
    rank: 14,
  },
  {
    id: "gov-moco-trespass-towing",
    name: "Montgomery County MD Trespass Towing Report",
    state: "MD",
    url: "https://data.montgomerycountymd.gov/resource/i6vn-3s6e.json",
    officialPage: "https://data.montgomerycountymd.gov/d/i6vn-3s6e",
    format: "soda-json",
    role: "lead",
    ingest: "link-only",
    cadence: "rowsUpdatedAt 2026-09-10",
    license: "Public Domain",
    fields: "tow_date, year, make, model, reason, tow company, geo",
    priceMeaning: null,
    observed: "153,668 historical",
    notes:
      "Private-tow locator; the county auction list is gov-montgomery-md-police-auction.",
    rank: 15,
  },
  {
    id: "gov-cincinnati-fleet",
    name: "Cincinnati Fleet Inventory",
    state: "OH",
    city: "Cincinnati",
    url: "https://data.cincinnati-oh.gov/resource/m8ba-xmjz.json",
    officialPage: "https://data.cincinnati-oh.gov/d/m8ba-xmjz",
    format: "soda-json",
    role: "sold_comp",
    ingest: "link-only",
    cadence: "daily",
    license: "Public Domain",
    fields:
      "make, model, year, status codes, retire/sale date, sale_price, salvage_value",
    priceMeaning: "sale_price on sold rows (status codes undocumented)",
    observed: "240 rows, 0 sales in 2026",
    notes: "Low value until status codes are documented.",
    rank: 17,
  },
  {
    id: "gov-kcmo-car-auction",
    name: "Kansas City MO Monthly Car Auction (dataset)",
    state: "MO",
    city: "Kansas City",
    url: "https://data.kcmo.org/resource/7wyi-8tqr.json",
    officialPage: "https://data.kcmo.org/d/7wyi-8tqr",
    format: "soda-json",
    role: "lead",
    ingest: "link-only",
    cadence: "rowsUpdatedAt 2026-09-23",
    license: "Public Domain",
    fields: "lot, year, make, model, VIN, tow ref",
    priceMeaning: null,
    observed: "0 rows (dataset is empty)",
    gatedVenue: "OAI Auctions (oaikc.com, commercial)",
    notes: "Dead today; kept so it's re-checked if the city repopulates it.",
    rank: 18,
  },
];

/**
 * Feeds whose catalog row lives in this repo's source registry via SOURCES_MASTER_ADDITIONS (the
 * gated SC/VT storefront deep links and the lower-ranked leads). The 12 headline feeds are
 * catalogued by `OPEN_GOV_FEEDS` in lib/scrapers/sources-registry.ts (PR #273) under the same ids.
 */
export const OPEN_GOV_FEEDS_CATALOGUED_HERE = OPEN_GOV_FEED_SPECS.filter(
  (feed) => feed.rank === 0 || feed.rank >= 13,
);

export const TOP_OPEN_GOV_FEEDS = OPEN_GOV_FEED_SPECS.filter(
  (feed) => feed.rank >= 1 && feed.rank <= 10,
);
