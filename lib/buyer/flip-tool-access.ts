import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";

/**
 * Wholesale flip tools. Personal, DIY and parts buyers (and an unknown mode,
 * which counts as personal) get an in-page "this tool is for reseller and
 * dealer desks" state on these routes. Reseller and dealer keep full access.
 * Signed-out visitors never get here: middleware sends them to /login first.
 */
export const FLIP_TOOL_ROUTES = {
  "/lane": "Auction Lane",
  "/fleet": "Pipeline",
  "/auctions": "Auction run lists",
  "/arbitrage": "Arbitrage",
  "/finance": "Finance",
  "/list": "Listing Manager",
  "/find": "Arbitrage routes",
  "/best-buy": "Next Best Buy",
  "/market": "Market sourcing",
} as const;

export type FlipToolRoute = keyof typeof FLIP_TOOL_ROUTES;

export type FlipToolAccess = "pending" | "allow" | "deny";

/**
 * Decide access from the buyer mode on this device first (what the nav uses),
 * then the saved preference. Stay "pending" until the client has mounted and,
 * when the device has no mode, until saved preferences have loaded, so a
 * dealer on a new device never sees the blocked state flash.
 */
export function flipToolAccess({
  mounted,
  localMode,
  savedMode,
  prefsLoading,
}: {
  mounted: boolean;
  localMode: unknown;
  savedMode: unknown;
  prefsLoading: boolean;
}): FlipToolAccess {
  if (!mounted) return "pending";
  if (localMode) return isFlipBuyerMode(localMode) ? "allow" : "deny";
  if (prefsLoading) return "pending";
  return isFlipBuyerMode(savedMode) ? "allow" : "deny";
}
