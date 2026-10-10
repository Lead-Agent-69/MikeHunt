// Single source of truth for sold_listings.sale_channel values (Ren #324 hazard). The DB CHECK
// (sold_listings_sale_channel_check) is restated by more than one migration: 20261010410000 (#316,
// gov lanes) and 20261010500000 (#320, adds 'ebay'). lib/scoring/sale-channels.test.ts fails CI when
//   * the latest migration that defines the CHECK lists anything other than SOLD_SALE_CHANNELS, or
//   * a later definition drops a value an earlier one allowed.
// Adding a channel = append it here AND re-state the full list in a new migration.
// Re-run rule: 410000 hard-codes the gov-only list; re-running it after a later definer narrows the
// CHECK, so re-run the latest definer right after (20261010412000's self-check fails if 'ebay' is
// missing once 500000 is recorded).

/** Government impound / fleet / surplus lanes: separate attributed lane, never retail comps. */
export const GOV_SALE_CHANNELS = [
  "gov_impound_auction",
  "gov_fleet_auction",
  "gov_surplus_auction",
] as const;

/** Every allowed non-NULL sale_channel. #320 appends "ebay" here when it lands. */
export const SOLD_SALE_CHANNELS: readonly string[] = [...GOV_SALE_CHANNELS];

export type GovSaleChannel = (typeof GOV_SALE_CHANNELS)[number];

/** Migrations whose sale_channel list is narrower than the final one, with the rule for re-running. */
export const NARROW_SALE_CHANNEL_MIGRATIONS: Record<string, string> = {
  "20261010410000_sold_listings_open_gov_comps.sql":
    "signed and frozen; gov-only list. Never re-run it alone after a later sale_channel definer: re-run that definer right after it.",
};
