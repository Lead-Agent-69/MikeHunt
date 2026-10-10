/**
 * Access class of a source (legal / compliance / terms). One module, one union.
 *
 *   api                a published public API for the data (GSA Auctions via api.gsa.gov / ppms.gov)
 *   allowed            reviewed and permitted: public pages whose terms do not ban automated access
 *                      and whose robots.txt allows our paths (e.g. a curated independent dealer site
 *                      that passed review: not policy-blocked, not an operator override)
 *   restricted         terms ban automated access (TOS_RESTRICTED_SOURCES), a policy-blocked host, or
 *                      a licence/dealer account is required
 *   operator_override  NOT permission. The operator chose to run this source despite a terms ban, a
 *                      robots.txt disallow or a policy block (operator-restored hosts, grandfathered
 *                      robotsExempt sources). It records a business decision that carries legal risk.
 *   unreviewed         terms not reviewed yet (and the fail-closed answer for anything unknown)
 *
 * Ren #269: only `api` and `allowed` rows may have their photos copied into our Storage bucket
 * (cacheVehiclePhotos). Today CACHE_PHOTOS_MAX=0 keeps that path off entirely; this gate holds if it
 * is ever turned on. Links and source-hosted image URLs are unaffected.
 *
 * Record only: nothing here enables, disables or gates a source's crawl, and robotsExempt behaviour
 * is untouched. Full basis per source: docs/legal/source-access-basis.md.
 */
import { TOS_RESTRICTED_SOURCES } from "./terms-restricted";
import {
  OPERATOR_RESTORED_HOSTS,
  SITE_POLICY_BLOCKS,
} from "./source-compliance";
import { grandfatheredHosts } from "./polite/robots-exempt";
import { CURATED_SITES } from "./curated-sites";

export type AccessClass =
  | "api"
  | "allowed"
  | "restricted"
  | "operator_override"
  | "unreviewed";

export const OPERATOR_OVERRIDE_NOTE =
  "operator_override is not permission: the operator chose to run this source despite a terms ban, robots.txt disallow or policy block, and it carries legal risk.";

const API_HOSTS = ["gsaauctions.gov", "api.gsa.gov", "ppms.gov"];
/** deals.source values written by reviewed per-site dealer crawls (curated_dealers). */
const REVIEWED_DEALER_SOURCES = new Set(["independent_dealer"]);
/**
 * Hosts whose terms ban automated access, whatever deals.source a row was stored under (Ren #312 P1:
 * a carparts.com row saved as independent_dealer must not read as `allowed`).
 */
export const RESTRICTED_HOSTS: readonly string[] = ["carparts.com"];

function hostOf(url: string | null | undefined): string {
  try {
    return new URL(String(url || "")).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

const under = (host: string, list: readonly string[]) =>
  !!host && list.some((h) => host === h || host.endsWith(`.${h}`));

let curatedHostList: string[] | null = null;
/** Hosts of the reviewed curated dealer network (lib/scrapers/curated-sites.ts). */
export function curatedHosts(): readonly string[] {
  if (!curatedHostList)
    curatedHostList = Array.from(
      new Set(CURATED_SITES.map((s) => hostOf(s.url)).filter(Boolean)),
    );
  return curatedHostList;
}

/** True only for a host in curated-sites.ts (or a subdomain of one). */
export function isCuratedHost(url: string | null | undefined): boolean {
  return under(hostOf(url), curatedHosts());
}

function restrictedSource(source: string): boolean {
  const s = source.toLowerCase();
  return Object.keys(TOS_RESTRICTED_SOURCES).some(
    (k) => s === k || s.startsWith(`${k}_`),
  );
}

/* ---------------- per-source classification (runner + catalog ids) ---------------- */

export interface SourceAccess {
  access: AccessClass;
  /** Short note on why the source has this class. */
  accessBasis: string;
  /** Aggregate runner whose hosts span classes (curated_dealers); /status shows "mixed". */
  mixed?: true;
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
const U = (accessBasis: string): SourceAccess => ({
  access: "unreviewed",
  accessBasis,
});

const tos = (id: string) =>
  `Terms ban automated access (${TOS_RESTRICTED_SOURCES[id]})`;
const DEALER_LICENCE = "Dealer licence / dealer account required; stub only";
const NOT_REVIEWED = "Public pages; terms not reviewed yet";
const DEALER_SITE = "Individual dealer site, robots-gated";
const BOT_CHALLENGE =
  "Bot challenge (SITE_POLICY_BLOCKS); not bypassed, not crawled";
const BAT_TERMS =
  "bringatrailer.com terms rev. 07/22/2026 §7: no robots, scraping, aggregation, redistribution or in-line links. Not enabled";
const CAR_PARTS_COM =
  "car-parts.com (not carparts.com): terms could not be fetched; restricted until reviewed";

/**
 * Keyed by runner id (lib/scrapers/runner.ts) and catalog id (ALL_SOURCES in sources-registry.ts).
 * STATE_DEALER_CANDIDATES (research-*) default to `allowed` pending permission review.
 */
export const SOURCE_ACCESS: Record<string, SourceAccess> = {
  // Runner ids
  copart: R(tos("copart")),
  craigslist: R(tos("craigslist")),
  iaa: U(
    "Published sitemap + lot pages; terms not reviewed yet (review first)",
  ),
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
  truecar: U(NOT_REVIEWED),
  carvana: R(tos("carvana")),
  vroom: U(NOT_REVIEWED),
  ebay_sold: O("eBay User Agreement bans scrapers; robotsExempt (Jonah)"),
  curated_dealers: {
    ...A(
      "Dealer sites per host; the 8 OPERATOR_RESTORED_HOSTS are operator_override",
    ),
    mixed: true,
  },
  autotempest: O(
    "Terms ban bots without written authorization; captured by operator decision (Jonah 2026-10-10). Search API refuses unsigned requests: recorded as challenged, never bypassed",
  ),
  visor: O(
    "Terms bar unauthorized linking and competitive use; public listing sitemap + JSON-LD read via politeFetch by operator decision (Jonah 2026-10-10)",
  ),
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
  "bring-a-trailer": R(BAT_TERMS),
  "carparts-com": R(tos("carparts_com")),
  "car-parts-com": R(CAR_PARTS_COM),
  "lqdt-maestro": R(
    "Liquidity Services User Agreement bans spiders/robots and data mining (same as govdeals/allsurplus)",
  ),
  // Grandfathered catalog entries (robotsExempt, #269)
  "ebay-sold": O("eBay User Agreement bans scrapers; robotsExempt (Jonah)"),
  "salvage-trucks-auction": O("robotsExempt (Jonah, #269)"),
  "royal-drive": O("robotsExempt (Jonah, #269)"),
  "parts-farm": O("robotsExempt (Jonah, #269)"),
};

const STATE_CANDIDATE_ACCESS = A(
  "Researched dealer candidate; needs permission review before live use",
);

/** Host-level class: restored hosts are operator_override, other policy-blocked hosts restricted. */
export function hostAccessClass(url?: string | null): SourceAccess | undefined {
  const host = hostOf(url);
  if (!host) return undefined;
  if (under(host, OPERATOR_RESTORED_HOSTS))
    return O(
      "Curated host restored by operator despite a SITE_POLICY_BLOCKS entry (Jonah)",
    );
  for (const [blocked, block] of Object.entries(SITE_POLICY_BLOCKS)) {
    if (under(host, [blocked]))
      return R(`SITE_POLICY_BLOCKS ${block.kind}: ${block.reason}`);
  }
  return undefined;
}

/**
 * Raw classification for a runner or catalog id (optionally refined by URL host). Undefined for an
 * id nobody has classified: the coverage test relies on that. Runtime callers fail closed with
 * `?? "unreviewed"`.
 */
export function sourceAccessFor(
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

/* ---------------- per-row classification (deals.source + source_url) ---------------- */

/** Access class of a stored listing row. Unknown → unreviewed (fail closed). */
export function accessClassFor(row: {
  source?: string | null;
  source_url?: string | null;
  /** deals.options: an aggregator-discovered row carries options.discoveredVia. */
  options?: { discoveredVia?: unknown } | null;
}): AccessClass {
  const source = String(row.source || "").toLowerCase();
  // A row found through an operator-override aggregator (Visor, AutoTempest) stays operator_override
  // even when it is stored under the dealer's own URL and the independent_dealer source.
  const via = String(row.options?.discoveredVia || "").toLowerCase();
  if (via && SOURCE_ACCESS[via]?.access === "operator_override")
    return "operator_override";
  const host = hostOf(row.source_url);
  const own = SOURCE_ACCESS[source];
  if (own?.access === "operator_override") return "operator_override";
  if (under(host, OPERATOR_RESTORED_HOSTS) || under(host, grandfatheredHosts()))
    return "operator_override";
  if (restrictedSource(source)) return "restricted";
  if (under(host, RESTRICTED_HOSTS)) return "restricted";
  if (under(host, Object.keys(SITE_POLICY_BLOCKS))) return "restricted";
  if (under(host, API_HOSTS)) return "api";
  // Ren #312 P1: `allowed` (and photo caching) only for a host that is actually in the reviewed
  // curated network. Any other host stored as independent_dealer (auto-discovery, ingest, a random
  // dealer site) has no review behind it: unreviewed.
  if (REVIEWED_DEALER_SOURCES.has(source))
    return under(host, curatedHosts()) ? "allowed" : "unreviewed";
  if (own && !own.mixed && own.access !== "allowed") return own.access;
  return "unreviewed";
}

/** May this row's photos be copied into our Storage bucket? Only api/allowed rows (so only curated hosts for dealers). */
export function photoCacheAllowed(row: {
  source?: string | null;
  source_url?: string | null;
  options?: { discoveredVia?: unknown } | null;
}): boolean {
  const c = accessClassFor(row);
  return c === "api" || c === "allowed";
}
