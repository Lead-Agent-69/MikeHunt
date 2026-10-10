// Sources-master additions (2026-10-10): every source from the last 48h of research that no other
// registry or open PR carried yet. See docs/sources-master.md for the full list and why each row is
// here. All rows are catalog-only ("planned", or "disabled" for a dead dataset): nothing here is
// fetched until an operator wires it. Nothing was removed anywhere.
//
// Kept in its own module so it merges cleanly next to PR #273 (open-gov headline feeds and
// multi-site link sources), which edits sources-registry.ts directly.

import { OPEN_GOV_FEEDS_CATALOGUED_HERE } from "../sources/open-gov/feeds";
import type { SourceConfig } from "./sources-registry";

/** Gated SC/VT storefront deep links and lower-ranked open-data leads (headline 12 are in #273). */
export const OPEN_GOV_EXTRA_SOURCES: SourceConfig[] =
  OPEN_GOV_FEEDS_CATALOGUED_HERE.map((feed) => ({
    id: feed.id,
    name: feed.name,
    url: feed.officialPage,
    type: "government" as const,
    category: "government-surplus" as const,
    authRequired: "none" as const,
    description: `${feed.fields}. ${feed.priceMeaning ? `Amount: ${feed.priceMeaning}.` : "No price in the source."}`,
    location: feed.city ? `${feed.city}, ${feed.state}` : feed.state,
    states: [feed.state],
    inventorySize: feed.observed,
    updateFrequency: feed.cadence,
    priority: "P3" as const,
    status: /^0 rows/.test(feed.observed)
      ? ("disabled" as const)
      : ("planned" as const),
    notes: [
      feed.role === "deep_link"
        ? "Deep link only (gated storefront; never fetched)."
        : "Open-data lead; no parser yet.",
      feed.license,
      feed.gatedVenue ? `Gated venue (never linked): ${feed.gatedVenue}` : "",
      feed.notes || "",
    ]
      .filter(Boolean)
      .join(" · "),
  }));

/** Official listing APIs (free or free-tier keys). Licensed alternatives to scraping. */
export const OFFICIAL_API_SOURCES: SourceConfig[] = [
  {
    id: "gsa-auctions-api",
    name: "GSA Auctions official API (api.gsa.gov)",
    url: "https://api.gsa.gov/assets/gsaauctions/v2/auctions?format=JSON",
    type: "government",
    category: "government-surplus",
    authRequired: "registration",
    description:
      "Official federal surplus catalog (JSON). Lot, location, end date, high bid, item URL. CC0.",
    inventorySize:
      "1,169 lots / 168 vehicle-like across 37 states (2026-10-09); 100 vehicle lots with key (2026-10-10)",
    updateFrequency: "Live",
    rateLimit: { requests: 1, perMs: 1_800_000 },
    priority: "P0",
    status: "planned",
    notes:
      "Adapter written (auto-closed PR #258, being rebuilt on main). Needs GSA_API_KEY (free api.data.gov key; DEMO_KEY fallback).",
  },
  {
    id: "ebay-browse-api",
    name: "eBay Browse API (Cars & Trucks 6001)",
    url: "https://developer.ebay.com/api-docs/buy/browse/overview.html",
    type: "marketplace",
    category: "online-marketplace",
    authRequired: "registration",
    description:
      "Licensed eBay listing search (/buy/browse/v1/item_summary/search, category 6001). The terms-safe replacement for scraping eBay.",
    priority: "P1",
    status: "planned",
    notes:
      "Needs a free eBay developer key (Jonah's call). Sold prices need Marketplace Insights approval.",
  },
  {
    id: "auto-dev-listings",
    name: "Auto.dev Listings API",
    url: "https://auto.dev/listings",
    type: "aggregator",
    category: "aggregator",
    authRequired: "registration",
    description:
      "Retail listing search API (api.auto.dev/listings). Free tier.",
    priority: "P2",
    status: "planned",
    notes: "From docs/source-access-matrix.md §1. Needs a key.",
  },
  {
    id: "marketcheck-inventory",
    name: "MarketCheck Inventory Search API",
    url: "https://www.marketcheck.com/apis",
    type: "aggregator",
    category: "aggregator",
    authRequired: "registration",
    description:
      "Active dealer inventory search (/v2/search/car/active). Free trial tier.",
    priority: "P2",
    status: "planned",
    notes: "From docs/source-access-matrix.md §1. Needs a key.",
  },
];

type ResearchedSite = {
  id: string;
  name: string;
  url: string;
  state?: string;
  kind: "dealer" | "salvage" | "parts";
  ready: boolean;
  note: string;
};

// From the 2026-10-09 salvage terms audit and the 2026-10-10 platform sweep (Eli). "ready" = one
// polite fetch found priced inventory, robots allowed and terms silent on automation; those are
// queued for CURATED_SITES once the #249 replacement (shared dealer-CMS parser) lands.
const RESEARCHED_SITE_ROWS: ResearchedSite[] = [
  {
    id: "brandcarx",
    name: "BrandCarX",
    url: "https://www.brandcarx.com",
    state: "SC",
    kind: "dealer",
    ready: true,
    note: "DealerCenter site, 27 priced lines. SC has no dealer source yet.",
  },
  {
    id: "midwest-jeeps",
    name: "Midwest Jeeps",
    url: "https://www.midwestjeeps.com",
    state: "IN",
    kind: "dealer",
    ready: true,
    note: "5 priced lines.",
  },
  {
    id: "kim-motor",
    name: "Kim Motor",
    url: "https://www.kimmotor.com",
    state: "VA",
    kind: "dealer",
    ready: true,
    note: "6 priced lines.",
  },
  {
    id: "incredibuilt-autos",
    name: "Incredibuilt Autos",
    url: "https://www.incredibuiltautos.com",
    kind: "salvage",
    ready: true,
    note: "16 priced lines; state not shown on site.",
  },
  {
    id: "beards-slightly-used-cars",
    name: "Beard's Slightly Used Cars",
    url: "https://www.beardsslightlyusedcars.com",
    state: "AR",
    kind: "dealer",
    ready: true,
    note: "VehiclesNETWORK, 12 priced lines.",
  },
  {
    id: "kershners-auto-korner",
    name: "Kershner's Auto Korner",
    url: "https://www.kershnersautokorner.com",
    state: "NE",
    kind: "dealer",
    ready: true,
    note: "VehiclesNETWORK, 2 priced lines.",
  },
  {
    id: "l-and-c-auto-sales",
    name: "L&C Auto Sales",
    url: "https://www.landcautosales.com",
    state: "TX",
    kind: "dealer",
    ready: true,
    note: "VehiclesNETWORK, 5 priced lines.",
  },
  {
    id: "spa-auto-sales",
    name: "SPA Auto Sales",
    url: "https://www.spaautosales.com",
    state: "AR",
    kind: "dealer",
    ready: false,
    note: "VehiclesNETWORK; 0 priced lines on probe (JS-rendered prices?).",
  },
  {
    id: "used-cars-portsmouth-va",
    name: "Used Cars Portsmouth",
    url: "https://www.usedcarsportsmouthva.com",
    state: "VA",
    kind: "dealer",
    ready: false,
    note: "VehiclesNETWORK; 0 priced lines on probe.",
  },
  {
    id: "cowboy-car-sales",
    name: "Cowboy Car Sales",
    url: "https://www.cowboycarsales.net",
    state: "TX",
    kind: "dealer",
    ready: false,
    note: "VehiclesNETWORK; 0 priced lines on probe.",
  },
  {
    id: "sign-and-drive-cars",
    name: "Sign and Drive Cars",
    url: "https://www.signanddrivecars.com",
    state: "NC",
    kind: "dealer",
    ready: false,
    note: "VehiclesNETWORK; 0 priced lines on probe.",
  },
  {
    id: "dario-auto-sales",
    name: "Dario Auto Sales",
    url: "https://www.darioautosales.com",
    kind: "dealer",
    ready: false,
    note: "0 priced lines on probe; state unknown.",
  },
  {
    id: "loughmiller-motors",
    name: "Loughmiller Motors",
    url: "https://loughmillermotors.com",
    state: "KS",
    kind: "salvage",
    ready: false,
    note: "Only a salvage explainer page; no listing page found.",
  },
  {
    id: "big-phils-auto-plaza",
    name: "Big Phil's Auto Plaza",
    url: "https://www.bigphils.com",
    state: "KS",
    kind: "dealer",
    ready: false,
    note: "HTTP 403 to the box; retry from another network.",
  },
  {
    id: "wilber-auto-salvage",
    name: "Wilber Auto Salvage",
    url: "https://www.wilbersauto.com/rebuilderswilberautosalvage",
    state: "IA",
    kind: "salvage",
    ready: false,
    note: "Wix blog-style rebuilder posts; robots allows; no terms page.",
  },
  {
    id: "carmatch-omaha",
    name: "CarMatch (Omaha)",
    url: "https://carmatchne.com",
    state: "NE",
    kind: "dealer",
    ready: false,
    note: "WordPress; terms have no automation clause; mostly retail, some rebuilt.",
  },
  {
    id: "woodbys-rebuildables",
    name: "Woodby's Rebuildables",
    url: "https://www.woodbysrebuildables.com",
    state: "TN",
    kind: "salvage",
    ready: false,
    note: "Large TN rebuildable dealer; SSL error from the box. Retry from another network.",
  },
  {
    id: "flat-rock-auto-salvage",
    name: "Flat Rock Auto Parts & Salvage",
    url: "https://www.flatrockautosalvage.com",
    state: "TN",
    kind: "salvage",
    ready: false,
    note: "Parts yard with a 'rebuilt cars' mention; no listing page.",
  },
  {
    id: "a1-crashed-cars",
    name: "A-1 Crashed Cars",
    url: "https://a1crashedcars.com/inventory.aspx",
    state: "NE",
    kind: "parts",
    ready: false,
    note: "Self-serve parts yard: cars aren't sold whole. Catalog only, never a vehicle listing.",
  },
  {
    id: "auto-salvage-tulsa",
    name: "Auto Salvage Tulsa",
    url: "https://autosalvagetulsa.com/tulsa-salvage-yard-inventory/",
    state: "OK",
    kind: "parts",
    ready: false,
    note: "Parts yard. Catalog only, never a vehicle listing.",
  },
  {
    id: "visone-auto-mart",
    name: "Visone Auto Mart / RV",
    url: "https://rvparts.rvpart.trade",
    state: "KY",
    kind: "dealer",
    ready: false,
    note: "Unreachable from the box (SSL).",
  },
];

export const RESEARCHED_SITES_2026_10_10: SourceConfig[] =
  RESEARCHED_SITE_ROWS.map((row) => ({
    id: `research-${row.id}`,
    name: row.name,
    url: row.url,
    type: row.kind === "parts" ? ("parts" as const) : ("dealer" as const),
    category:
      row.kind === "salvage"
        ? ("salvage" as const)
        : row.kind === "parts"
          ? ("parts" as const)
          : ("retail" as const),
    authRequired: "none" as const,
    description: row.note,
    location: row.state,
    states: row.state ? [row.state] : undefined,
    priority: row.ready ? ("P2" as const) : ("P3" as const),
    status: "planned" as const,
    notes: row.ready
      ? "Ready: robots allowed, terms silent on automation, priced inventory seen. Queue for CURATED_SITES after the #249 replacement lands."
      : "Researched; not ingestible yet (see description).",
  }));

export const SOURCES_MASTER_ADDITIONS: SourceConfig[] = [
  ...OPEN_GOV_EXTRA_SOURCES,
  ...OFFICIAL_API_SOURCES,
  ...RESEARCHED_SITES_2026_10_10,
];
