import {
  canonicalSource,
  displaySource,
  sourceMeta,
} from "@/lib/sources/source-meta";

export type ListingSellerType = "dealer" | "auction" | "private";

/**
 * Source-only seller defaults are intentionally narrow. Aggregators and
 * marketplaces can contain multiple seller types, so they require listing
 * evidence instead of inheriting a seller type from their brand.
 */
export const SELLER_TYPE_SOURCE_DEFAULTS: Record<
  ListingSellerType,
  readonly string[]
> = {
  dealer: ["independent_dealer", "craigslist_dealer", "carvana", "vroom"],
  auction: ["copart", "iaa", "adesa", "manheim", "acv", "gov_auction"],
  private: [],
};

export function isListingSellerType(value: string): value is ListingSellerType {
  return value === "dealer" || value === "auction" || value === "private";
}

type SellerTypeRow = {
  source?: unknown;
  source_url?: unknown;
  sourceUrl?: unknown;
  seller_type?: unknown;
  sellerType?: unknown;
  options?: { sellerType?: unknown } | null;
};

export function reportedSellerType(
  row: SellerTypeRow,
): ListingSellerType | undefined {
  const explicit = String(
    row.seller_type || row.sellerType || row.options?.sellerType || "",
  )
    .trim()
    .toLowerCase();
  return isListingSellerType(explicit) ? explicit : undefined;
}

export function sellerTypeEvidence(
  row: SellerTypeRow,
): ListingSellerType | undefined {
  const explicit = reportedSellerType(row);
  if (explicit) return explicit;

  const rawSource = canonicalSource(String(row.source || ""));
  if (SELLER_TYPE_SOURCE_DEFAULTS.auction.includes(rawSource)) return "auction";
  if (SELLER_TYPE_SOURCE_DEFAULTS.dealer.includes(rawSource)) return "dealer";

  const source = displaySource(
    String(row.source || ""),
    String(row.source_url || row.sourceUrl || ""),
  );
  const channel = sourceMeta(source).channel;
  if (["auction", "salvage", "wholesale", "gov"].includes(channel))
    return "auction";
  // Curated dealer URLs are precise seller evidence. Generic retail and
  // marketplace channels are not: those can mix dealer and private listings.
  if (channel === "dealer") return "dealer";
  return undefined;
}
