import { isAuctionChannel } from "@/lib/sources/source-meta";

// Stored auction source values; named government sources share gov_auction.
export const AUCTION_DB_SOURCES = [
  "copart",
  "iaa",
  "adesa",
  "manheim",
  "acv",
  "gov_auction",
];

export function wantsAuctionInventory(scope: {
  lane?: string | null;
  sellerType?: string | null;
  sources?: string[];
}): boolean {
  return (
    scope.lane === "auction" ||
    scope.lane === "government" ||
    scope.sellerType === "auction" ||
    (scope.sources || []).some(isAuctionChannel)
  );
}
