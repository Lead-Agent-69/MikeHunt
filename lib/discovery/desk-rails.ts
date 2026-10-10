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

/**
 * Salvage & Rebuildable (title category salvage/rebuildable, any source or lane): flip and parts
 * desks always; personal/DIY only when includeRepairable is true. Callers pass
 * includesRepairable(buyerScope) (lib/intelligence/repair-risk): DIY defaults in, personal out,
 * an explicit saved choice wins.
 */
export const SALVAGE_REBUILDABLE_RAIL = "salvageRebuildable";

export type DeskRailOptions = { includeRepairable?: boolean };

export function hiddenRailKeysForDesk(
  desk: DiscoverDesk,
  opts: DeskRailOptions = {},
): Set<string> {
  if (desk === "flip") return new Set();
  const hidden = new Set<string>(
    desk === "parts" ? PARTS_HIDDEN : PERSONAL_HIDDEN,
  );
  if (desk === "personal" && opts.includeRepairable !== true) {
    hidden.add(SALVAGE_REBUILDABLE_RAIL);
  }
  return hidden;
}

export function hiddenRailKeysForMode(
  mode: unknown,
  opts: DeskRailOptions = {},
): Set<string> {
  return hiddenRailKeysForDesk(discoverDeskForMode(mode), opts);
}

/** Drop rails the desk may not see. Returns a new array; rails are not mutated. */
export function filterRailsForDesk<T extends { key: string }>(
  rails: T[],
  desk: DiscoverDesk,
  opts: DeskRailOptions = {},
): T[] {
  const hidden = hiddenRailKeysForDesk(desk, opts);
  return rails.filter((rail) => !hidden.has(rail.key));
}
