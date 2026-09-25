// lib/scrapers/sources/allsurplus.ts
// AllSurplus.com — Liquidity Services' commercial/government surplus auction marketplace (sister site to
// GovDeals). Same `maestro.lqdt1.com` backend, businessId "AD" (vs GovDeals' "GD"), vehicles under the
// "t6" Transportation parent category. AllSurplus lists INTERNATIONALLY, so we filter to U.S. lots
// (requireUS) and lean on the pipeline's known-make + year gate to drop the marine/aviation/equipment
// that also live under t6. Captured by Antigravity in docs/findings/allsurplus-api.md.

import { scrapeMaestro } from "./lqdt-maestro";

const ALLSURPLUS_OPTS = {
  businessId: "AD",
  categoryCodes: ["t6"], // Transportation parent (cars/trucks/buses/trailers/marine — make-gate filters)
  source: "gov_auction",
  idPrefix: "as",
  defaultSeller: "AllSurplus",
  label: "AllSurplus",
  requireUS: true, // AllSurplus is international; keep U.S. lots only
};

export async function scrapeAllSurplus(): Promise<number> {
  return scrapeMaestro(ALLSURPLUS_OPTS);
}
