// lib/scrapers/sources/govdeals.ts
// GovDeals.com — the largest U.S. government-surplus auction marketplace (Liquidity Services). Police
// cruisers, municipal fleet sedans, public-works trucks sell here for a fraction of retail = prime
// cheap-acquisition leads for a flipping dealer, sibling to PublicSurplus. Runs on the shared Liquidity
// "maestro" JSON API (lib/scrapers/sources/lqdt-maestro.ts) — this file is just the GovDeals config.

import type { Deal } from "@/types";
import {
  scrapeMaestro,
  maestroAssetToDeal,
  type MaestroAsset,
} from "./lqdt-maestro";

// product_category_external_id codes for road vehicles (verified live): 94A Automobiles/Cars,
// 94Q Trucks/Trailers, t6 the parent vehicles bucket. OR'd so one query sweeps all cars + trucks.
// GovDeals is U.S.-only, so no country filter is needed.
const GOVDEALS_OPTS = {
  businessId: "GD",
  categoryCodes: ["94A", "94Q", "t6"],
  source: "gov_auction",
  idPrefix: "gd",
  defaultSeller: "GovDeals (gov surplus)",
  label: "GovDeals",
  requireUS: false,
};

/** Map one GovDeals asset to a Deal (thin wrapper over the shared maestro mapper; used by tests). */
export function govDealsAssetToDeal(a: MaestroAsset): Partial<Deal> | null {
  return maestroAssetToDeal(a, GOVDEALS_OPTS);
}

export async function scrapeGovDeals(): Promise<number> {
  return scrapeMaestro(GOVDEALS_OPTS);
}
