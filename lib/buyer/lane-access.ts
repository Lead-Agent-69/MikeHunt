// Buying lanes that only make sense for flip desks (reseller / dealer). Wholesale auctions need a
// dealer license and are bid-to-flip supply, so personal, DIY, and parts buyers never get offered them.
// A missing mode is personal (same rule as isFlipBuyerMode).
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";

export const FLIP_ONLY_LANE_VALUES: ReadonlySet<string> = new Set(["auction"]);

export function laneAllowedForMode(laneValue: unknown, mode: unknown): boolean {
  const lane = String(laneValue || "all")
    .toLowerCase()
    .trim();
  return isFlipBuyerMode(mode) || !FLIP_ONLY_LANE_VALUES.has(lane);
}
