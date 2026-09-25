// lib/sources/source-meta.ts
//
// THE single source of truth for how every channel is shown and spoken about across the app. One place
// defines, per source: the proper display name (not "EBAY_MOTORS"), its brand color, what KIND of
// channel it is, and the channel-correct buy wording (you BID at an auction, make an OFFER on a private
// ask, pay a PRICE at retail). Cards, tables, the deal page, filters, and copy all read from here, so a
// dealer glances and instantly knows the source — and we never call a Carvana price a "bid".

export type Channel =
  | "auction" // live auction — you place a BID (Copart)
  | "salvage" // salvage/total-loss auction — BID
  | "wholesale" // dealer-only wholesale — BID/buy (Manheim, ADESA, ACV)
  | "gov" // government / public surplus auction — BID
  | "retail" // franchise/online retailer fixed PRICE (Carvana, Cars.com)
  | "dealer" // independent used-car dealer ASKING price
  | "marketplace" // classifieds / marketplace listing — ASKING, room to OFFER
  | "private"; // private-party listing — ASKING, you make an OFFER

export interface SourceMeta {
  /** Canonical, human display name. */
  label: string;
  /** Compact label for tight chips. */
  short: string;
  /** Brand-ish accent (works as solid text on a tinted bg in light + dark). */
  color: string;
  channel: Channel;
}

// Brand-appropriate accents. Mid-saturation hues so the same value reads on light AND dark surfaces
// (badges render as solid `color` text on a low-alpha tint of the same color).
const META: Record<string, SourceMeta> = {
  // ── Auctions (BID) ─────────────────────────────────────────────
  copart: {
    label: "Copart",
    short: "Copart",
    color: "#2f6fed",
    channel: "salvage",
  },
  iaa: { label: "IAA", short: "IAA", color: "#8b5cf6", channel: "salvage" },
  gov_auction: {
    label: "Gov Surplus",
    short: "Gov",
    color: "#5b7083",
    channel: "gov",
  },
  manheim: {
    label: "Manheim",
    short: "Manheim",
    color: "#1d4ed8",
    channel: "wholesale",
  },
  adesa: {
    label: "ADESA",
    short: "ADESA",
    color: "#0e7490",
    channel: "wholesale",
  },
  acv: {
    label: "ACV Auctions",
    short: "ACV",
    color: "#0d9488",
    channel: "wholesale",
  },

  // ── Retail (PRICE) ─────────────────────────────────────────────
  carvana: {
    label: "Carvana",
    short: "Carvana",
    color: "#00b3c6",
    channel: "retail",
  },
  cars_com: {
    label: "Cars.com",
    short: "Cars.com",
    color: "#5145cd",
    channel: "retail",
  },
  autotrader: {
    label: "AutoTrader",
    short: "AutoTrader",
    color: "#e8590c",
    channel: "retail",
  },
  cargurus: {
    label: "CarGurus",
    short: "CarGurus",
    color: "#16a34a",
    channel: "retail",
  },
  truecar: {
    label: "TrueCar",
    short: "TrueCar",
    color: "#0891b2",
    channel: "retail",
  },
  vroom: {
    label: "Vroom",
    short: "Vroom",
    color: "#6d28d9",
    channel: "retail",
  },

  // ── Dealers (ASKING) ───────────────────────────────────────────
  independent_dealer: {
    label: "Indie Dealer",
    short: "Dealer",
    color: "#0f766e",
    channel: "dealer",
  },
  craigslist_dealer: {
    label: "Craigslist Dealer",
    short: "CL Dealer",
    color: "#7e22ce",
    channel: "dealer",
  },

  // ── Marketplace / private (ASKING → OFFER) ─────────────────────
  ebay_motors: {
    label: "eBay Motors",
    short: "eBay",
    color: "#e53238",
    channel: "marketplace",
  },
  facebook_marketplace: {
    label: "Facebook Marketplace",
    short: "Facebook",
    color: "#1877f2",
    channel: "marketplace",
  },
  offerup: {
    label: "OfferUp",
    short: "OfferUp",
    color: "#36b37e",
    channel: "marketplace",
  },
  craigslist: {
    label: "Craigslist",
    short: "Craigslist",
    color: "#9333ea",
    channel: "private",
  },
};

const FALLBACK: SourceMeta = {
  label: "Other",
  short: "Other",
  color: "#64748b",
  channel: "marketplace",
};

/** Normalize a raw source value to its canonical key (handles casing/spacing/aliases). */
export function canonicalSource(source?: string | null): string {
  const k = (source || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  if (META[k]) return k;
  // Alias folding for variants the scrapers may emit.
  if (k.startsWith("craigslist")) return "craigslist";
  if (k.startsWith("ebay")) return "ebay_motors";
  if (k.startsWith("facebook")) return "facebook_marketplace";
  if (k.includes("carvana")) return "carvana";
  if (k.includes("cargurus")) return "cargurus";
  if (k.includes("autotrader")) return "autotrader";
  if (k.includes("truecar")) return "truecar";
  if (k.includes("cars_com") || k.includes("cars")) return "cars_com";
  if (k.includes("publicsurplus") || k.includes("gov")) return "gov_auction";
  if (k.includes("dealer") || k.includes("curated"))
    return "independent_dealer";
  return k;
}

export function sourceMeta(source?: string | null): SourceMeta {
  return (
    META[canonicalSource(source)] ?? { ...FALLBACK, label: source || "Other" }
  );
}

/** Low-alpha tint of a hex color for badge backgrounds (works on light + dark). */
export function tint(hex: string, alpha = 0.14): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Channel-correct buy terminology (the "don't call everything a bid" rule) ──
const AUCTION_CHANNELS = new Set<Channel>([
  "auction",
  "salvage",
  "wholesale",
  "gov",
]);
const OFFER_CHANNELS = new Set<Channel>(["marketplace", "private"]);

export function isAuctionChannel(source?: string | null): boolean {
  return AUCTION_CHANNELS.has(sourceMeta(source).channel);
}

export interface BuyTerms {
  /** Recommended-max label, e.g. "Max bid" | "Max offer" | "Buy under". */
  maxLabel: string;
  /** Verb for sentences: "bid" | "offer" | "buy". */
  verb: string;
  /** What the seller's number represents: "Current bid" | "Asking price" | "Price". */
  priceLabel: string;
  /** One-word channel tag for chips. */
  channelTag: string;
}

export function buyTerms(source?: string | null): BuyTerms {
  const ch = sourceMeta(source).channel;
  if (AUCTION_CHANNELS.has(ch)) {
    return {
      maxLabel: "Max bid",
      verb: "bid",
      priceLabel: "Current bid",
      channelTag: "Auction",
    };
  }
  if (OFFER_CHANNELS.has(ch)) {
    return {
      maxLabel: "Max offer",
      verb: "offer",
      priceLabel: "Asking price",
      channelTag: ch === "private" ? "Private" : "Marketplace",
    };
  }
  // retail / dealer — a fixed price you buy at (room to negotiate at a dealer).
  return {
    maxLabel: "Buy under",
    verb: "buy",
    priceLabel: ch === "dealer" ? "Asking price" : "Price",
    channelTag: ch === "dealer" ? "Dealer" : "Retail",
  };
}
