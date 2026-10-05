import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";

export type ScanSortValue = "profit" | "score" | "price";

/**
 * Default Scan sort when the URL does not pick one. Personal, DIY, and parts
 * buyers sort by trust score: profit is not their goal, and their deal payloads
 * redact flip economics, so a profit sort would be arbitrary. An unknown mode
 * is personal. Only reseller and dealer desks default to profit.
 */
export function defaultScanSort(buyerMode: unknown): ScanSortValue {
  return isFlipBuyerMode(buyerMode) ? "profit" : "score";
}
