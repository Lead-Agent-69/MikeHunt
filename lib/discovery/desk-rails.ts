// Which Discover rails each desk may receive. Enforced server-side in /api/discover and mirrored
// by the Discover page, so wholesale flip rails never ship to a personal, DIY, parts, or
// signed-out caller in the first place.

import { normalizeFlipLeadMode } from "@/lib/buyer/flip-lead";

export type DiscoverDesk = "flip" | "parts" | "personal";

/** Saved buyer mode → desk. Reseller/dealer are flip. Parts keeps salvage. Everything else personal. */
export function discoverDeskForMode(mode: unknown): DiscoverDesk {
  const normalized = normalizeFlipLeadMode(mode);
  if (normalized === "reseller" || normalized === "dealer") return "flip";
  if (normalized === "parts") return "parts";
  return "personal";
}

const PERSONAL_HIDDEN = ["roi", "salvage", "auctionLots", "fresh"] as const;
// Parts buyers still want salvage / teardown supply.
const PARTS_HIDDEN = ["roi", "auctionLots", "fresh"] as const;

export function hiddenRailKeysForDesk(desk: DiscoverDesk): Set<string> {
  if (desk === "flip") return new Set();
  return new Set<string>(desk === "parts" ? PARTS_HIDDEN : PERSONAL_HIDDEN);
}

export function hiddenRailKeysForMode(mode: unknown): Set<string> {
  return hiddenRailKeysForDesk(discoverDeskForMode(mode));
}

/** Drop rails the desk may not see. Returns a new array; rails are not mutated. */
export function filterRailsForDesk<T extends { key: string }>(
  rails: T[],
  desk: DiscoverDesk,
): T[] {
  const hidden = hiddenRailKeysForDesk(desk);
  return rails.filter((rail) => !hidden.has(rail.key));
}
