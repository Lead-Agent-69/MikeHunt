import { isAuctionChannel, sourceFromUrl } from "@/lib/sources/source-meta";

type InventorySourceEvidence = {
  source?: string | null;
  sourceUrl?: string | null;
  adapterId?: string | null;
  sellerType?: string | null;
  sourceType?: string | null;
};

const AUCTION_TYPES = new Set([
  "auction",
  "government",
  "gov",
  "salvage",
  "wholesale",
]);
const NON_AUCTION_TYPES = new Set([
  "dealer",
  "independent_dealer",
  "private",
  "private_party",
  "retail",
  "marketplace",
]);

function normalized(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Auction timing is required only for inventory sold through an auction channel. */
export function auctionDateApplies(input: InventorySourceEvidence) {
  for (const explicit of [input.sellerType, input.sourceType]) {
    const type = normalized(explicit);
    if (!type) continue;
    if (AUCTION_TYPES.has(type)) return true;
    if (NON_AUCTION_TYPES.has(type)) return false;
  }

  const source =
    sourceFromUrl(input.sourceUrl) || input.adapterId || input.source || null;
  return isAuctionChannel(source);
}
