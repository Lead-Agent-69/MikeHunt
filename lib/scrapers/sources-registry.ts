/**
 * MikeHunt — Comprehensive Source Registry
 *
 * All scraping sources organized by category with metadata.
 * Each source has: id, name, url, type, category, auth requirements,
 * rate limits, and scraper configuration.
 */

import { SOURCES_MASTER_ADDITIONS } from "./sources-registry-additions";

export type SourceType =
  | "auction"
  | "dealer"
  | "marketplace"
  | "aggregator"
  | "government"
  | "parts";
export type SourceCategory =
  | "salvage"
  | "dealer-auction"
  | "online-marketplace"
  | "government-surplus"
  | "retail"
  | "parts"
  | "aggregator";
export type AuthRequired =
  | "none"
  | "registration"
  | "dealer-license"
  | "paid-membership";

export interface SourceConfig {
  id: string;
  name: string;
  url: string;
  type: SourceType;
  category: SourceCategory;
  authRequired: AuthRequired;
  description: string;
  location?: string;
  /** States where this market has been researched or operates. Omit for national coverage. */
  states?: string[];
  inventorySize?: string;
  updateFrequency?: string;
  requiresProxy?: boolean;
  requiresFlareSolverr?: boolean;
  rateLimit?: {
    requests: number;
    perMs: number;
  };
  priority: "P0" | "P1" | "P2" | "P3";
  status: "active" | "planned" | "testing" | "disabled";
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SALVAGE AUCTIONS (Major Platforms)
// ═══════════════════════════════════════════════════════════════════════════

export const SALVAGE_AUCTIONS: SourceConfig[] = [
  {
    id: "copart",
    name: "Copart",
    url: "https://www.copart.com",
    type: "auction",
    category: "salvage",
    authRequired: "registration",
    description:
      "Largest salvage auction platform. Insurance total loss, salvage, repairable vehicles.",
    inventorySize: "500K+",
    updateFrequency: "Real-time",
    requiresProxy: true,
    requiresFlareSolverr: true,
    rateLimit: { requests: 2, perMs: 60000 },
    priority: "P0",
    status: "active",
    notes: "Requires registration. Cloudflare protected — needs FlareSolverr.",
  },
  {
    id: "iaa",
    name: "IAA (Insurance Auto Auctions)",
    url: "https://www.iaai.com",
    type: "auction",
    category: "salvage",
    authRequired: "registration",
    description:
      "Insurance salvage vehicles. 43K+ salvage vehicles with damage type filters.",
    inventorySize: "43K+ salvage",
    updateFrequency: "Real-time",
    requiresProxy: true,
    requiresFlareSolverr: true,
    rateLimit: { requests: 2, perMs: 60000 },
    priority: "P0",
    status: "active",
    notes: "Primary Copart alternative. Good damage type metadata.",
  },
  {
    id: "adesa",
    name: "ADESA",
    url: "https://www.adesa.com",
    type: "auction",
    category: "dealer-auction",
    authRequired: "dealer-license",
    description: "Dealer auction platform. Requires dealer license.",
    inventorySize: "50K+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "planned",
    notes: "Requires dealer license. High-value dealer inventory.",
  },
  {
    id: "manheim",
    name: "Manheim",
    url: "https://www.manheim.com",
    type: "auction",
    category: "dealer-auction",
    authRequired: "dealer-license",
    description: "Largest dealer auction. Frontline, CPO take-ins, fleet cars.",
    inventorySize: "100K+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "planned",
    notes: "Requires dealer license. Retail-ready vehicles.",
  },
  {
    id: "acv",
    name: "ACV Auctions",
    url: "https://www.acvauctions.com",
    type: "auction",
    category: "dealer-auction",
    authRequired: "dealer-license",
    description: "Online dealer auction. Requires dealer license.",
    inventorySize: "30K+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "planned",
    notes: "Requires dealer license. Growing platform.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// INDEPENDENT SALVAGE DEALERS
// ═══════════════════════════════════════════════════════════════════════════

export const INDEPENDENT_DEALERS: SourceConfig[] = [
  {
    id: "erepairables",
    name: "eRepairables",
    url: "https://erepairables.com",
    type: "aggregator",
    category: "aggregator",
    authRequired: "registration",
    description:
      "Aggregates all major salvage auctions. Proxy bidding, no dealer license needed.",
    inventorySize: "100K+",
    updateFrequency: "Real-time",
    priority: "P0",
    status: "active",
    notes:
      "HIGHEST VALUE — aggregates all auctions into one searchable inventory.",
  },
  {
    id: "autobidmaster",
    name: "AutoBidMaster",
    url: "https://www.autobidmaster.com",
    type: "aggregator",
    category: "aggregator",
    authRequired: "registration",
    description: "500K+ vehicles from Copart & IAA. No dealer license needed.",
    inventorySize: "500K+",
    updateFrequency: "Real-time",
    priority: "P0",
    status: "active",
    notes: "Largest aggregator. No license required.",
  },
  {
    id: "salvage-reseller",
    name: "Salvage Reseller",
    url: "https://www.salvagereseller.com",
    type: "aggregator",
    category: "aggregator",
    authRequired: "none",
    description:
      "50K+ vehicles across all 50 states. Clean/salvage/rebuilt/non-repairable titles.",
    inventorySize: "50K+",
    updateFrequency: "Real-time",
    priority: "P0",
    status: "active",
    notes: "No license needed. All 50 states. Multiple title types.",
  },
  {
    id: "stjames-auto",
    name: "St. James Auto & Truck Parts",
    url: "https://stjamesautoparts.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description:
      "Rebuildable vehicles. 6-10 new vehicles daily. 6-month warranty. Nationwide shipping.",
    location: "Saint James, MO",
    inventorySize: "500+",
    updateFrequency: "Daily",
    priority: "P1",
    status: "active",
    notes: "Adds 6-10 vehicles daily. Rebuildable focus.",
  },
  {
    id: "dg-auto",
    name: "D&G Auto LLC",
    url: "https://www.dgautollc.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description: "Late model high-end repairable salvage trucks and cars.",
    location: "Poplar Bluff, MO",
    inventorySize: "200+",
    updateFrequency: "Daily",
    priority: "P1",
    status: "active",
    notes: "High-end salvage focus. Trucks and cars.",
  },
  {
    id: "recar",
    name: "ReCar",
    url: "https://www.recar.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description:
      "Rebuilt title specialist. 125+ cars/month. Nationwide shipping.",
    location: "Benton, MO",
    inventorySize: "500+",
    updateFrequency: "Daily",
    priority: "P1",
    status: "active",
    notes: "Rebuilt title focus. High volume.",
  },
  {
    id: "ae-of-miami",
    name: "AE of Miami",
    url: "https://aeofmiami.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description:
      "1M+ vehicles sold. Salvage/clean/junk titles. Export specialists.",
    location: "Miami, FL + Denver, CO",
    states: ["FL", "CO"],
    inventorySize: "1000+",
    updateFrequency: "Daily",
    priority: "P1",
    status: "active",
    notes: "Export specialists. Multiple locations.",
  },
  {
    id: "damage-com",
    name: "Damage.com",
    url: "https://www.damage.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description: "Repairable vehicles, parts recycler, international shipping.",
    location: "Sikeston, MO",
    inventorySize: "300+",
    updateFrequency: "Daily",
    priority: "P1",
    status: "active",
    notes: "Parts recycler. International shipping.",
  },
  {
    id: "cas-miami",
    name: "CAS Miami",
    url: "https://casmiami.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description:
      "30 years in business. 100K+ vehicles. Salvage & new remarketer.",
    location: "Miami, FL",
    inventorySize: "2000+",
    updateFrequency: "Daily",
    priority: "P1",
    status: "active",
    notes:
      "30 years experience. Huge inventory. Terms ban bots, so it is not crawled (source-compliance); buyers reach it through the link-out. Kept, not removed.",
  },
  {
    id: "salvagezone",
    name: "SalvageZone",
    url: "https://www.salvagezone.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description:
      "Repairable & salvage cars. Worldwide shipping. Open to public.",
    location: "Bellport, NY",
    inventorySize: "500+",
    updateFrequency: "Daily",
    priority: "P1",
    status: "active",
    notes: "Worldwide shipping. Public access.",
  },
  {
    id: "rebuilt-auto",
    name: "Rebuilt Auto",
    url: "https://rebuiltautox.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description:
      "Direct dealer inventory. No auction bidding. Salvage/rebuildable/rebuilt.",
    location: "Vineland, NJ",
    inventorySize: "200+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes: "No bidding required. Direct purchase.",
  },
  {
    id: "alpine-auto",
    name: "Alpine Auto Gallery",
    url: "https://www.alpinerebuildablecars.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description: "Salvage & repairable cars. Body type filters. Live chat.",
    location: "NY & NJ",
    inventorySize: "300+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes: "Body type filters. Live chat support.",
  },
  {
    id: "replica-auto",
    name: "Replica Auto",
    url: "http://www.replicaauto.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description:
      "Hundreds of repairable/rebuildable vehicles. Hail/salvage/rebuilt.",
    location: "Old Forge, PA",
    inventorySize: "500+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes: "Large inventory. Multiple vehicle types.",
  },
  {
    id: "autoworld-america",
    name: "Autoworld of America",
    url: "https://www.autoworldofamerica.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description: "Branded, rebuilt, salvage-repairable, clean title vehicles.",
    location: "Miami, FL",
    inventorySize: "400+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes: "All title types available.",
  },
  {
    id: "prestman-auto",
    name: "Prestman Auto",
    url: "https://www.prestmanauto.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description:
      "Branded title vehicles. Utah state inspection. Certified roadworthy.",
    location: "Utah",
    states: ["UT"],
    inventorySize: "200+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes: "State inspected. Certified roadworthy.",
  },
  {
    id: "cardome",
    name: "CarDome Auto Sales",
    url: "https://www.cardomemi.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description: "Rebuilt title cars. Multiple Michigan locations.",
    location: "Michigan",
    inventorySize: "300+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes: "Multiple locations. Rebuilt title focus.",
  },
  {
    id: "revroom",
    name: "ReVroom",
    url: "https://revroom.org",
    type: "marketplace",
    category: "aggregator",
    authRequired: "registration",
    description:
      "Marketplace for rebuilt/branded title vehicles. VIN-based listing autofill.",
    inventorySize: "10K+",
    updateFrequency: "Real-time",
    priority: "P2",
    status: "active",
    notes: "Only marketplace dedicated to rebuilt/branded titles.",
  },
  {
    id: "bidgodrive",
    name: "BidGoDrive",
    url: "https://www.bidgodrive.com",
    type: "marketplace",
    category: "aggregator",
    authRequired: "registration",
    description: "No bidding, no license needed. Worldwide shipping.",
    inventorySize: "20K+",
    updateFrequency: "Real-time",
    priority: "P2",
    status: "active",
    notes: "No bidding required. Fixed prices.",
  },
  {
    id: "argo-cycles",
    name: "Argo Cycles & Auto",
    url: "https://www.argocycles.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description: "Rebuildable bikes and cars.",
    location: "—",
    inventorySize: "100+",
    updateFrequency: "Weekly",
    priority: "P3",
    status: "planned",
    notes: "Motorcycles and cars.",
  },
  {
    id: "floras-auto",
    name: "Floras Auto",
    url: "https://www.florasauto.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description: "Rebuildable repairable salvage vehicles and parts.",
    location: "Leesburg, IN",
    inventorySize: "200+",
    updateFrequency: "Weekly",
    priority: "P3",
    status: "planned",
    notes: "Also buys vehicles.",
  },
  {
    id: "star-auto",
    name: "Star Auto LLC",
    url: "https://www.starautous.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description: "Prior salvage vehicles.",
    location: "Jordan, MN",
    inventorySize: "100+",
    updateFrequency: "Weekly",
    priority: "P3",
    status: "planned",
    notes: "Prior salvage focus.",
  },
  {
    id: "parkline-motors",
    name: "Parkline Motors",
    url: "https://www.parklinemotors.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description: "Branded title vehicles. Handpicked rebuilt.",
    location: "Salt Lake City, UT",
    inventorySize: "100+",
    updateFrequency: "Weekly",
    priority: "P3",
    status: "planned",
    notes: "Handpicked. Quality focus.",
  },
  {
    id: "top-quality-auto",
    name: "Top Quality Auto",
    url: "https://www.topqauto.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description: "Rebuilt title cars. Nationwide delivery.",
    location: "Hollywood, FL",
    inventorySize: "100+",
    updateFrequency: "Weekly",
    priority: "P3",
    status: "planned",
    notes: "Nationwide delivery.",
  },
  {
    id: "autosavvy",
    name: "AutoSavvy",
    url: "https://www.autosavvy.com",
    type: "dealer",
    category: "salvage",
    authRequired: "none",
    description: "Branded title vehicles. Reconstructed titles.",
    location: "—",
    inventorySize: "200+",
    updateFrequency: "Weekly",
    priority: "P3",
    status: "planned",
    notes: "Reconstructed title focus.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// GOVERNMENT & PUBLIC SURPLUS
// ═══════════════════════════════════════════════════════════════════════════

export const GOVERNMENT_SOURCES: SourceConfig[] = [
  {
    id: "gsa-auctions",
    name: "GSA Auctions",
    url: "https://www.gsaauctions.gov",
    type: "government",
    category: "government-surplus",
    authRequired: "registration",
    description: "Federal government surplus vehicles. 30K+ vehicles/year.",
    inventorySize: "30K+/year",
    updateFrequency: "Daily",
    priority: "P1",
    status: "active",
    notes: "Free to register. Federal surplus.",
  },
  {
    id: "govdeals",
    name: "GovDeals",
    url: "https://www.govdeals.com",
    type: "government",
    category: "government-surplus",
    authRequired: "registration",
    description: "Police, fire, and municipal surplus vehicles.",
    inventorySize: "50K+",
    updateFrequency: "Daily",
    priority: "P1",
    status: "active",
    notes: "Free to register. Municipal surplus.",
  },
  {
    id: "publicsurplus",
    name: "Public Surplus",
    url: "https://www.publicsurplus.com",
    type: "government",
    category: "government-surplus",
    authRequired: "none",
    description: "Municipal surplus vehicles and equipment.",
    inventorySize: "10K+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes: "No registration required.",
  },
  {
    id: "allsurplus",
    name: "All Surplus",
    url: "https://www.allsurplus.com",
    type: "government",
    category: "government-surplus",
    authRequired: "none",
    description: "DoD surplus vehicles and equipment.",
    inventorySize: "5K+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes: "No registration required.",
  },
  {
    id: "municibid",
    name: "Municibid",
    url: "https://www.municibid.com",
    type: "government",
    category: "government-surplus",
    authRequired: "none",
    description: "Local government auction vehicles.",
    inventorySize: "15K+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes: "No registration required.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ONLINE MARKETPLACES
// ═══════════════════════════════════════════════════════════════════════════

export const ONLINE_MARKETPLACES: SourceConfig[] = [
  {
    id: "ebay-motors",
    name: "eBay Motors",
    url: "https://www.ebay.com/motors",
    type: "marketplace",
    category: "online-marketplace",
    authRequired: "registration",
    description: "653+ salvage listings. National marketplace.",
    inventorySize: "100K+",
    updateFrequency: "Real-time",
    requiresFlareSolverr: true,
    priority: "P0",
    status: "active",
    notes: "Cloudflare protected. Huge inventory.",
  },
  {
    id: "facebook-marketplace",
    name: "Facebook Marketplace",
    url: "https://www.facebook.com/marketplace",
    type: "marketplace",
    category: "online-marketplace",
    authRequired: "registration",
    description: "Local marketplace. Salvage title common.",
    inventorySize: "50K+",
    updateFrequency: "Real-time",
    priority: "P1",
    status: "active",
    notes: "Local focus. No shipping.",
  },
  {
    id: "craigslist",
    name: "Craigslist",
    url: "https://www.craigslist.org",
    type: "marketplace",
    category: "online-marketplace",
    authRequired: "none",
    description: "50-state metro classifieds. By-owner and by-dealer.",
    inventorySize: "100K+",
    updateFrequency: "Real-time",
    priority: "P0",
    status: "active",
    notes: "Proven live. By-owner and by-dealer sections.",
  },
  {
    id: "offerup",
    name: "OfferUp",
    url: "https://offerup.com",
    type: "marketplace",
    category: "online-marketplace",
    authRequired: "registration",
    description: "Local marketplace. Mobile-first.",
    inventorySize: "30K+",
    updateFrequency: "Real-time",
    priority: "P2",
    status: "active",
    notes: "Mobile-first. Local focus.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// DEALER & RETAIL PLATFORMS
// ═══════════════════════════════════════════════════════════════════════════

export const DEALER_PLATFORMS: SourceConfig[] = [
  {
    id: "cars-com",
    name: "Cars.com",
    url: "https://www.cars.com",
    type: "dealer",
    category: "retail",
    authRequired: "none",
    description: "Nationwide dealer listings.",
    inventorySize: "2M+",
    updateFrequency: "Daily",
    requiresFlareSolverr: true,
    priority: "P0",
    status: "active",
    notes: "JS-rendered. Needs browser path.",
  },
  {
    id: "cargurus",
    name: "CarGurus",
    url: "https://www.cargurus.com",
    type: "dealer",
    category: "retail",
    authRequired: "none",
    description: "Nationwide dealer listings with price analysis.",
    inventorySize: "1M+",
    updateFrequency: "Daily",
    requiresFlareSolverr: true,
    priority: "P1",
    status: "active",
    notes: "JS-rendered. Needs browser path.",
  },
  {
    id: "autotrader",
    name: "AutoTrader",
    url: "https://www.autotrader.com",
    type: "dealer",
    category: "retail",
    authRequired: "none",
    description: "Nationwide dealer listings.",
    inventorySize: "1M+",
    updateFrequency: "Daily",
    requiresFlareSolverr: true,
    priority: "P1",
    status: "active",
    notes: "JS-rendered. Needs browser path.",
  },
  {
    id: "carvana",
    name: "Carvana",
    url: "https://www.carvana.com",
    type: "dealer",
    category: "retail",
    authRequired: "none",
    description: "Online dealer. National delivery.",
    inventorySize: "50K+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes: "Online-only. National delivery.",
  },
  {
    id: "vroom",
    name: "Vroom",
    url: "https://www.vroom.com",
    type: "dealer",
    category: "retail",
    authRequired: "none",
    description: "Online dealer. National delivery.",
    inventorySize: "30K+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes: "Online-only. National delivery.",
  },
  {
    id: "truecar",
    name: "TrueCar",
    url: "https://www.truecar.com",
    type: "dealer",
    category: "retail",
    authRequired: "none",
    description: "Dealer network. Price transparency.",
    inventorySize: "500K+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes:
      "Dealer network. Price data. Listing pages answer 403 (bot wall) to an honest crawler and robots disallow /used-cars-for-sale/listing/*, so we use the 'Also search on' deep link instead of scraping. Scraper code kept.",
  },
  {
    id: "bring-a-trailer",
    name: "Bring a Trailer",
    url: "https://bringatrailer.com",
    type: "auction",
    category: "retail",
    authRequired: "registration",
    description: "Enthusiast auction. National.",
    inventorySize: "20K+",
    updateFrequency: "Daily",
    priority: "P2",
    status: "active",
    notes: "Enthusiast focus. Curated inventory.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PARTS & ACCESSORIES
// ═══════════════════════════════════════════════════════════════════════════

export const PARTS_SOURCES: SourceConfig[] = [
  {
    id: "carparts-com",
    name: "CarParts.com",
    url: "https://www.carparts.com",
    type: "parts",
    category: "parts",
    authRequired: "none",
    description: "Parts retailer. National.",
    inventorySize: "1M+ parts",
    updateFrequency: "Daily",
    priority: "P3",
    status: "planned",
    notes: "Parts focus. Not vehicles.",
  },
  {
    id: "car-parts-com",
    name: "Car-Parts.com",
    url: "https://www.car-parts.com",
    type: "parts",
    category: "parts",
    authRequired: "none",
    description: "Parts retailer. National.",
    inventorySize: "500K+ parts",
    updateFrequency: "Daily",
    priority: "P3",
    status: "planned",
    notes: "Parts focus. Not vehicles.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// AGGREGATORS & TOOLS
// ═══════════════════════════════════════════════════════════════════════════

export const AGGREGATORS: SourceConfig[] = [
  {
    id: "autotempest",
    name: "AutoTempest",
    url: "https://www.autotempest.com",
    type: "aggregator",
    category: "aggregator",
    authRequired: "none",
    description: "Multi-source search aggregator.",
    inventorySize: "3M+",
    updateFrequency: "Real-time",
    priority: "P2",
    status: "active",
    notes: "Aggregates multiple sources.",
  },
  {
    id: "lqdt-maestro",
    name: "LQDT Maestro",
    url: "https://www.lqdtmaestro.com",
    type: "aggregator",
    category: "aggregator",
    authRequired: "registration",
    description: "Truck and equipment aggregator.",
    inventorySize: "100K+",
    updateFrequency: "Daily",
    priority: "P3",
    status: "planned",
    notes: "Commercial vehicles.",
  },
];

// Research-backed local inventory candidates. These are intentionally catalog-only: each dealer
// still needs access, terms, and listing-detail validation before it can enter the live pipeline.
type StateDealerCandidate = {
  state: string;
  name: string;
  city: string;
  url: string;
  type?: "dealer" | "auction";
  description: string;
};

const STATE_DEALER_CANDIDATE_ROWS: StateDealerCandidate[] = [
  {
    state: "AL",
    name: "Birmingham Luxury Motors",
    city: "Birmingham / Hoover",
    url: "https://www.birminghamluxurymotors.com/searchused.aspx",
    description: "Independent used inventory.",
  },
  {
    state: "AK",
    name: "Affordable Used Cars",
    city: "Anchorage",
    url: "https://affordableusedcarsanchorage.com/",
    description: "Local used inventory.",
  },
  {
    state: "AZ",
    name: "LeSueur Car Company",
    city: "Tempe",
    url: "https://www.usedvwaudi.com/",
    description: "Independent used inventory.",
  },
  {
    state: "AR",
    name: "McLarty Auto Group",
    city: "Little Rock",
    url: "https://www.mclartyauto.com/searchused.aspx",
    description: "Regional used inventory.",
  },
  {
    state: "CA",
    name: "Pacific Auto Center",
    city: "Fontana",
    url: "https://www.pacificautocenter.com/searchused.aspx",
    description: "Used inventory.",
  },
  {
    state: "CO",
    name: "Springs Automotive Group",
    city: "Colorado Springs",
    url: "https://www.springsautomotivegroup.com/used-inventory/index.htm",
    description: "Regional used inventory.",
  },
  {
    state: "CT",
    name: "A Better Way Wholesale Autos",
    city: "Naugatuck",
    url: "https://abwautos.com/vehicles/",
    description: "Independent dealer inventory.",
  },
  {
    state: "DE",
    name: "Delaware Public Auto Auction",
    city: "New Castle",
    url: "https://www.dpaa2.com/",
    type: "auction",
    description: "Public auction inventory.",
  },
  {
    state: "FL",
    name: "AE of Miami",
    city: "Miami",
    url: "https://aeofmiami.com/",
    description: "Repairable and salvage specialist.",
  },
  {
    state: "GA",
    name: "Atlanta Autos",
    city: "Marietta",
    url: "https://www.atlantaautos.com/",
    description: "Luxury used inventory.",
  },
  {
    state: "HI",
    name: "AutoSource",
    city: "Honolulu",
    url: "https://autosourcehawaii.com/inventory",
    description: "Independent dealer inventory.",
  },
  {
    state: "ID",
    name: "Dillon Pre-Owned",
    city: "Boise",
    url: "https://www.dillonpreowned.com/used-inventory/index.htm",
    description: "Pre-owned inventory.",
  },
  {
    state: "IL",
    name: "Ultimo Motors",
    city: "Westmont",
    url: "https://www.ultimomotors.com/",
    description: "Luxury used inventory.",
  },
  {
    state: "IN",
    name: "Indy Auto Man",
    city: "Indianapolis",
    url: "https://www.indyautoman.com/",
    description: "Independent used inventory.",
  },
  {
    state: "IA",
    name: "Iowa Auto Exchange",
    city: "Des Moines",
    url: "https://iowaautoexchange.com/inventory/",
    description: "Used inventory.",
  },
  {
    state: "KS",
    name: "Eddy's Everything",
    city: "Wichita",
    url: "https://www.eddyseverything.com/new-and-used/",
    description: "Regional dealer inventory.",
  },
  {
    state: "KY",
    name: "Craig & Landreth Cars",
    city: "Louisville",
    url: "https://www.craigandlandrethcars.com/newandusedcars",
    description: "Used inventory.",
  },
  {
    state: "LA",
    name: "Mattingly Motors",
    city: "Metairie",
    url: "https://www.mattinglymotors.com/searchused.aspx",
    description: "Independent used inventory.",
  },
  {
    state: "ME",
    name: "Berlin City",
    city: "Portland",
    url: "https://www.berlincity.com/used-vehicles/",
    description: "Regional dealer inventory.",
  },
  {
    state: "MD",
    name: "Easterns Automotive Group",
    city: "Maryland locations",
    url: "https://www.easterns.com/locations",
    description: "Multi-location used inventory.",
  },
  {
    state: "MA",
    name: "Milford Auto Sales",
    city: "Hopedale",
    url: "https://www.milfordautosalesinc.com/cars-for-sale",
    description: "Independent used inventory.",
  },
  {
    state: "MI",
    name: "Motor City Auto Auction",
    city: "Fraser",
    url: "https://www.motorcityautoauction.net/cars-for-sale",
    type: "auction",
    description: "Local auction inventory.",
  },
  {
    state: "MN",
    name: "Ramsey Auto Sales",
    city: "Ramsey",
    url: "https://www.ramseyautomn.com/cars-for-sale",
    description: "Independent used inventory.",
  },
  {
    state: "MS",
    name: "MS Coast Auto Brokers",
    city: "Gulfport",
    url: "https://mscoastautobroker.com/inventory",
    description: "Used inventory.",
  },
  {
    state: "MO",
    name: "Travers Automotive Group",
    city: "St. Louis",
    url: "https://www.traversautomotivegroup.com/used",
    description: "Regional used inventory.",
  },
  {
    state: "MT",
    name: "Auto Outlet",
    city: "Billings",
    url: "https://www.billingsmtusedcars.com/cars-for-sale",
    description: "Used inventory.",
  },
  {
    state: "NE",
    name: "Schrier Automotive",
    city: "Omaha",
    url: "https://schrierautomotive.com/inventory",
    description: "Independent used inventory.",
  },
  {
    state: "NV",
    name: "Vegas Auto Gallery",
    city: "Las Vegas",
    url: "https://www.vegasautogallery.com/used-inventory/",
    description: "Luxury used inventory.",
  },
  {
    state: "NH",
    name: "AutoFair",
    city: "Manchester",
    url: "https://www.autofair.com/used-inventory/index.htm",
    description: "Regional dealer inventory.",
  },
  {
    state: "NJ",
    name: "NJ State Auto",
    city: "Jersey City",
    url: "https://www.njstateauto.com/",
    description: "Used inventory.",
  },
  {
    state: "NM",
    name: "M&F Auto Sales",
    city: "Albuquerque",
    url: "https://www.mandfauto.com/used-inventory/index.htm",
    description: "Used inventory.",
  },
  {
    state: "NY",
    name: "Major World",
    city: "Queens",
    url: "https://majorworld.com/",
    description: "Used inventory.",
  },
  {
    state: "NC",
    name: "Hanna Imports",
    city: "Raleigh",
    url: "https://www.hannaimports.com/hanna-imports-raleigh-vehicles.htm",
    description: "Used inventory.",
  },
  {
    state: "ND",
    name: "Auto Finance Super Center",
    city: "Grand Forks",
    url: "https://www.autofsc.com/",
    description: "Used inventory.",
  },
  {
    state: "OH",
    name: "Auto Boutique Ohio",
    city: "Columbus",
    url: "https://www.autoboutiqueohio.com/inventory",
    description: "Used inventory.",
  },
  {
    state: "OK",
    name: "Car One",
    city: "Warr Acres",
    url: "https://www.caroneokc.com/",
    description: "Used inventory.",
  },
  {
    state: "OR",
    name: "Freeman Motor Company",
    city: "Portland",
    url: "https://freemanmotor.com/cars/",
    description: "Luxury used inventory.",
  },
  {
    state: "PA",
    name: "Blue Knob Auto",
    city: "Duncansville",
    url: "https://www.blueknobauto.com/all-inventory/index.htm",
    description: "Used inventory.",
  },
  {
    state: "RI",
    name: "Tasca",
    city: "Cranston",
    url: "https://www.tasca.com/used-vehicles/",
    description: "Regional dealer inventory.",
  },
  {
    state: "SC",
    name: "Dick Smith Automotive",
    city: "South Carolina locations",
    url: "https://www.dicksmith.com/used-vehicles",
    description: "Regional dealer inventory.",
  },
  {
    state: "SD",
    name: "Billion Auto",
    city: "Sioux Falls",
    url: "https://www.billionauto.com/search",
    description: "Regional dealer inventory.",
  },
  {
    state: "TN",
    name: "City Auto",
    city: "Memphis",
    url: "https://www.cityautomemphis.com/used-vehicles/",
    description: "Used inventory.",
  },
  {
    state: "TX",
    name: "Texas Auto Corporation",
    city: "Houston",
    url: "https://www.texasautocorporation.com/inventory/",
    description: "Used inventory.",
  },
  {
    state: "UT",
    name: "Prestman Auto",
    city: "Salt Lake City",
    url: "https://www.prestmanauto.com/used-vehicles",
    description: "Branded-title and used inventory.",
  },
  {
    state: "VT",
    name: "The Automaster",
    city: "Shelburne",
    url: "https://www.theautomaster.com/used-inventory/index.htm",
    description: "Regional dealer inventory.",
  },
  {
    state: "VA",
    name: "Easterns Automotive Group",
    city: "Virginia locations",
    url: "https://www.easterns.com/locations",
    description: "Multi-location used inventory.",
  },
  {
    state: "WA",
    name: "Seattle Finest Motors",
    city: "Lynnwood",
    url: "https://www.seattlefinestmotors.com/inventory",
    description: "Used inventory.",
  },
  {
    state: "WV",
    name: "Thornhill Automotive",
    city: "Chapmanville",
    url: "https://www.thornhillautomotive.com/searchused.aspx",
    description: "Regional dealer inventory.",
  },
  {
    state: "WI",
    name: "Van Horn Automotive",
    city: "Wisconsin locations",
    url: "https://www.vhcars.com/all-vehicles/",
    description: "Regional dealer inventory.",
  },
  {
    state: "WY",
    name: "Fremont Motor Company",
    city: "Wyoming locations",
    url: "https://www.fremontmotors.com/searchused.aspx",
    description: "Regional dealer inventory.",
  },
];

const candidateId = (name: string, state: string) =>
  `research-${state.toLowerCase()}-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;

const normalizedHost = (url: string) =>
  new URL(url).hostname.replace(/^www\./, "").toLowerCase();

const cataloguedHosts = new Set(
  [
    ...SALVAGE_AUCTIONS,
    ...INDEPENDENT_DEALERS,
    ...GOVERNMENT_SOURCES,
    ...ONLINE_MARKETPLACES,
    ...DEALER_PLATFORMS,
    ...PARTS_SOURCES,
    ...AGGREGATORS,
  ].map((source) => normalizedHost(source.url)),
);

/** Every state has a researched dealer starting point, including sources already catalogued above. */
export const RESEARCHED_DEALER_STATES = Array.from(
  new Set(STATE_DEALER_CANDIDATE_ROWS.map((candidate) => candidate.state)),
).sort();

export const STATE_DEALER_CANDIDATES: SourceConfig[] =
  STATE_DEALER_CANDIDATE_ROWS.filter(
    (candidate) => !cataloguedHosts.has(normalizedHost(candidate.url)),
  ).map((candidate) => ({
    id: candidateId(candidate.name, candidate.state),
    name: candidate.name,
    url: candidate.url,
    type: candidate.type || "dealer",
    category: "retail",
    authRequired: "none",
    description: candidate.description,
    location: `${candidate.city}, ${candidate.state}`,
    states: [candidate.state],
    priority: "P3",
    status: "planned",
    notes:
      "Researched inventory candidate. Requires source permission and listing-detail validation before live use.",
  }));

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_SOURCES: SourceConfig[] = [
  // Sources-master additions (docs/sources-master.md); catalog-only.
  ...SOURCES_MASTER_ADDITIONS,
  ...SALVAGE_AUCTIONS,
  ...INDEPENDENT_DEALERS,
  ...GOVERNMENT_SOURCES,
  ...ONLINE_MARKETPLACES,
  ...DEALER_PLATFORMS,
  ...PARTS_SOURCES,
  ...AGGREGATORS,
  ...STATE_DEALER_CANDIDATES,
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getSourcesByCategory(category: SourceCategory): SourceConfig[] {
  return ALL_SOURCES.filter((s) => s.category === category);
}

export function getSourcesByPriority(
  priority: "P0" | "P1" | "P2" | "P3",
): SourceConfig[] {
  return ALL_SOURCES.filter((s) => s.priority === priority);
}

export function getSourcesByStatus(
  status: "active" | "planned" | "testing" | "disabled",
): SourceConfig[] {
  return ALL_SOURCES.filter((s) => s.status === status);
}

export function getSourcesByType(type: SourceType): SourceConfig[] {
  return ALL_SOURCES.filter((s) => s.type === type);
}

export function getActiveSources(): SourceConfig[] {
  return ALL_SOURCES.filter((s) => s.status === "active");
}

export function getP0Sources(): SourceConfig[] {
  return ALL_SOURCES.filter((s) => s.priority === "P0");
}

export function getSourceById(id: string): SourceConfig | undefined {
  return ALL_SOURCES.find((s) => s.id === id);
}

export function getSourcesRequiringFlareSolverr(): SourceConfig[] {
  return ALL_SOURCES.filter((s) => s.requiresFlareSolverr);
}

export function getSourcesRequiringProxy(): SourceConfig[] {
  return ALL_SOURCES.filter((s) => s.requiresProxy);
}

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

export const SOURCE_STATS = {
  total: ALL_SOURCES.length,
  active: ALL_SOURCES.filter((s) => s.status === "active").length,
  planned: ALL_SOURCES.filter((s) => s.status === "planned").length,
  p0: ALL_SOURCES.filter((s) => s.priority === "P0").length,
  p1: ALL_SOURCES.filter((s) => s.priority === "P1").length,
  p2: ALL_SOURCES.filter((s) => s.priority === "P2").length,
  p3: ALL_SOURCES.filter((s) => s.priority === "P3").length,
  byCategory: {
    salvage: ALL_SOURCES.filter((s) => s.category === "salvage").length,
    "dealer-auction": ALL_SOURCES.filter((s) => s.category === "dealer-auction")
      .length,
    "online-marketplace": ALL_SOURCES.filter(
      (s) => s.category === "online-marketplace",
    ).length,
    "government-surplus": ALL_SOURCES.filter(
      (s) => s.category === "government-surplus",
    ).length,
    retail: ALL_SOURCES.filter((s) => s.category === "retail").length,
    parts: ALL_SOURCES.filter((s) => s.category === "parts").length,
    aggregator: ALL_SOURCES.filter((s) => s.category === "aggregator").length,
  },
  byType: {
    auction: ALL_SOURCES.filter((s) => s.type === "auction").length,
    dealer: ALL_SOURCES.filter((s) => s.type === "dealer").length,
    marketplace: ALL_SOURCES.filter((s) => s.type === "marketplace").length,
    aggregator: ALL_SOURCES.filter((s) => s.type === "aggregator").length,
    government: ALL_SOURCES.filter((s) => s.type === "government").length,
    parts: ALL_SOURCES.filter((s) => s.type === "parts").length,
  },
};
