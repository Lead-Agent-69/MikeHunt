/**
 * Per-source access classification (legal / compliance / terms). Record only: nothing here enables,
 * disables, or gates a source, and robotsExempt behaviour is untouched. The full basis for each class
 * is in docs/legal/source-access-basis.md.
 *
 * Client-safe (no node: imports).
 */

import type { AccessClass } from "./access-class";
import { TOS_RESTRICTED_SOURCES } from "./terms-restricted";
import {
  OPERATOR_RESTORED_HOSTS,
  SITE_POLICY_BLOCKS,
} from "./source-compliance";

export { OPERATOR_OVERRIDE_NOTE, type AccessClass } from "./access-class";

export interface SourceAccess {
  access: AccessClass;
  /** Short note on why the source has this class. */
  accessBasis: string;
}

const R = (accessBasis: string): SourceAccess => ({
  access: "restricted",
  accessBasis,
});
const A = (accessBasis: string): SourceAccess => ({
  access: "allowed",
  accessBasis,
});
const O = (accessBasis: string): SourceAccess => ({
  access: "operator_override",
  accessBasis,
});

const tos = (id: string) =>
  `Terms ban automated access (${TOS_RESTRICTED_SOURCES[id]})`;
const DEALER_LICENCE = "Dealer licence / dealer account required; stub only";
const NOT_REVIEWED = "Public pages; terms not formally reviewed (review)";
const DEALER_SITE = "Individual dealer site, robots-gated";
const BOT_CHALLENGE =
  "Bot challenge (SITE_POLICY_BLOCKS); not bypassed, not crawled";

/**
 * Keyed by runner id (lib/scrapers/runner.ts) and catalog id (ALL_SOURCES in sources-registry.ts).
 * STATE_DEALER_CANDIDATES (research-*) default to `allowed` pending permission review.
 */
export const SOURCE_ACCESS: Record<string, SourceAccess> = {
  // Runner ids
  copart: R(tos("copart")),
  craigslist: R(tos("craigslist")),
  iaa: A("Published sitemap + lot pages; terms not formally reviewed (review)"),
  acv: R(DEALER_LICENCE),
  adesa: R(DEALER_LICENCE),
  manheim: R(DEALER_LICENCE),
  facebook_marketplace: O(
    "Meta terms ban automated collection; stealth browser; robotsExempt (Jonah)",
  ),
  ebay_motors: R(tos("ebay_motors")),
  carparts_com: R(tos("carparts_com")),
  cars_com: R(tos("cars_com")),
  independent_dealer: A(DEALER_SITE),
  cargurus: O("Terms ban scraping; robotsExempt (Jonah, #269); FlareSolverr"),
  autotrader: R(tos("autotrader")),
  truecar: A(NOT_REVIEWED),
  carvana: R(tos("carvana")),
  vroom: A(NOT_REVIEWED),
  ebay_sold: O("eBay User Agreement bans scrapers; robotsExempt (Jonah)"),
  curated_dealers: A(
    "Dealer sites per host; OPERATOR_RESTORED_HOSTS are operator_override",
  ),
  autotempest: R(tos("autotempest")),
  publicsurplus: R(tos("publicsurplus")),
  govdeals: R(tos("govdeals")),
  allsurplus: R(tos("allsurplus")),
  municibid: R(tos("municibid")),
  gsa_auctions: A(
    "GSA terms bind bidders only; public API exists (api once the api.gsa.gov adapter is the path)",
  ),
  offerup: R(tos("offerup")),
  auto_discover: A("Link discovery; robots/sitemap first"),

  // Catalog ids (ALL_SOURCES) not already covered above
  erepairables: R("Terms ban copying (SITE_POLICY_BLOCKS tos_bans_copying)"),
  autobidmaster: R(BOT_CHALLENGE),
  "salvage-reseller": R(BOT_CHALLENGE),
  revroom: R(BOT_CHALLENGE),
  "stjames-auto": A(DEALER_SITE),
  "dg-auto": A(DEALER_SITE),
  recar: O("robots.txt disallow; robotsExempt (Jonah, #269)"),
  "ae-of-miami": O(
    "Terms ban bots; OPERATOR_RESTORED_HOSTS + robotsExempt (Jonah)",
  ),
  "damage-com": A(DEALER_SITE),
  "cas-miami": O("Terms ban bots; OPERATOR_RESTORED_HOSTS (Jonah)"),
  salvagezone: A(DEALER_SITE),
  "rebuilt-auto": A(DEALER_SITE),
  "alpine-auto": A(DEALER_SITE),
  "replica-auto": A(DEALER_SITE),
  "autoworld-america": A(DEALER_SITE),
  "prestman-auto": A(DEALER_SITE),
  cardome: A(DEALER_SITE),
  bidgodrive: O("Terms ban copying; OPERATOR_RESTORED_HOSTS (Jonah)"),
  "argo-cycles": A(DEALER_SITE),
  "floras-auto": A(DEALER_SITE),
  "star-auto": A(DEALER_SITE),
  "parkline-motors": A(DEALER_SITE),
  "top-quality-auto": A(DEALER_SITE),
  autosavvy: A(DEALER_SITE),
  "gsa-auctions": A("GSA terms bind bidders only; public API exists"),
  "ebay-motors": R(tos("ebay_motors")),
  "facebook-marketplace": O(
    "Meta terms ban automated collection; robotsExempt (Jonah)",
  ),
  "cars-com": R(tos("cars_com")),
  "bring-a-trailer": A(NOT_REVIEWED),
  "carparts-com": R(tos("carparts_com")),
  "car-parts-com": A(NOT_REVIEWED),
  "lqdt-maestro": R(
    "Liquidity Services User Agreement bans spiders/robots and data mining (same as govdeals/allsurplus)",
  ),
  // Grandfathered catalog entries added with robotsExempt in #269
  "ebay-sold": O("eBay User Agreement bans scrapers; robotsExempt (Jonah)"),
  "salvage-trucks-auction": O("robotsExempt (Jonah, #269)"),
  "royal-drive": O("robotsExempt (Jonah, #269)"),
  "parts-farm": O("robotsExempt (Jonah, #269)"),
};

const STATE_CANDIDATE_ACCESS = A(
  "Researched dealer candidate; needs permission review before live use",
);

function hostOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const hostMatches = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

/** Host-level class for curated hosts: restored hosts are operator_override, policy-blocked are restricted. */
export function hostAccessClass(url?: string | null): SourceAccess | undefined {
  const host = hostOf(url);
  if (!host) return undefined;
  if (OPERATOR_RESTORED_HOSTS.some((d) => hostMatches(host, d)))
    return O(
      "Curated host restored by operator despite a SITE_POLICY_BLOCKS entry (Jonah)",
    );
  for (const [blocked, block] of Object.entries(SITE_POLICY_BLOCKS)) {
    if (hostMatches(host, blocked))
      return R(`SITE_POLICY_BLOCKS ${block.kind}: ${block.reason}`);
  }
  return undefined;
}

/**
 * Access class for a source id (runner or catalog id), optionally refined by the listing URL's host.
 * Returns undefined for an id nobody has classified.
 */
export function accessClassFor(
  sourceId: string,
  url?: string | null,
): SourceAccess | undefined {
  const id = String(sourceId || "")
    .trim()
    .toLowerCase();
  const own = SOURCE_ACCESS[id];
  if (own?.access === "operator_override") return own;
  const byHost = hostAccessClass(url);
  if (byHost) return byHost;
  if (own) return own;
  if (id.startsWith("research-")) return STATE_CANDIDATE_ACCESS;
  return undefined;
}
