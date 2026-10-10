/**
 * Access class of a listing's source, for anything that copies source content beyond a link.
 *
 *   api        a published public API for the data (GSA Auctions via api.gsa.gov / ppms.gov)
 *   allowed    reviewed and permitted: a curated independent dealer site whose terms and robots.txt
 *              passed review (not policy-blocked, not an operator override)
 *   restricted terms ban automated access (TOS_RESTRICTED_SOURCES), a policy-blocked host, an
 *              operator-restored host, or a grandfathered (robotsExempt) source. Operator override is
 *              not permission.
 *   unreviewed everything else
 *
 * Ren #269: only `api` and `allowed` rows may have their photos copied into our Storage bucket
 * (cacheVehiclePhotos). Today CACHE_PHOTOS_MAX=0 keeps that path off entirely; this gate holds if it
 * is ever turned on. Links and source-hosted image URLs are unaffected.
 */
import { TOS_RESTRICTED_SOURCES } from "./terms-restricted";
import {
  OPERATOR_RESTORED_HOSTS,
  SITE_POLICY_BLOCKS,
} from "./source-compliance";
import { grandfatheredHosts } from "./polite/robots-exempt";

export type AccessClass = "api" | "allowed" | "restricted" | "unreviewed";

const API_HOSTS = ["gsaauctions.gov", "api.gsa.gov", "ppms.gov"];
/** deals.source values written by reviewed per-site dealer crawls (curated_dealers). */
const REVIEWED_DEALER_SOURCES = new Set(["independent_dealer"]);

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

function restrictedSource(source: string): boolean {
  const s = source.toLowerCase();
  return Object.keys(TOS_RESTRICTED_SOURCES).some(
    (k) => s === k || s.startsWith(`${k}_`),
  );
}

export function accessClassFor(row: {
  source?: string | null;
  source_url?: string | null;
}): AccessClass {
  const source = String(row.source || "");
  const host = hostOf(row.source_url);
  if (restrictedSource(source)) return "restricted";
  if (
    under(host, Object.keys(SITE_POLICY_BLOCKS)) ||
    under(host, OPERATOR_RESTORED_HOSTS) ||
    under(host, grandfatheredHosts())
  )
    return "restricted";
  if (under(host, API_HOSTS)) return "api";
  if (REVIEWED_DEALER_SOURCES.has(source) && host) return "allowed";
  return "unreviewed";
}

/** May this row's photos be copied into our Storage bucket? Only api/allowed sources. */
export function photoCacheAllowed(row: {
  source?: string | null;
  source_url?: string | null;
}): boolean {
  const c = accessClassFor(row);
  return c === "api" || c === "allowed";
}
