import { isFlipBuyerMode, normalizeFlipLeadMode } from "@/lib/buyer/flip-lead";

export type ScanSortValue = "profit" | "score" | "price";

/**
 * Default Scan sort when the URL does not pick one. Personal, DIY, and parts
 * buyers sort by trust score: profit is not their goal, and their deal payloads
 * redact flip economics, so a profit sort would be arbitrary. Flip desks and an
 * unknown mode keep the profit sort.
 */
export function defaultScanSort(buyerMode: unknown): ScanSortValue {
  const mode = normalizeFlipLeadMode(buyerMode);
  if (mode && !isFlipBuyerMode(mode)) return "score";
  return "profit";
}
