/**
 * Retired scrapers and retired bypass tooling.
 *
 * MikeHunt is terms-safe only: we do not get around bot protection, captchas, logins, rate limits or
 * site terms. Sources listed here are never run, even if an operator names them in SCRAPE_SOURCES.
 * Buyers reach those sites through outbound "Search on X" links instead (lib/multisite).
 *
 * The bypass toolkit (FlareSolverr, proxy/IP rotation, stealth fingerprint spoofing, human-behaviour
 * simulation) is retired too: its entry points throw BypassRetiredError or do nothing.
 */
export const RETIRED_SOURCES: Record<string, string> = {
  cargurus:
    "Retired 2026-10-09: scraper relied on FlareSolverr + proxies to get past Cloudflare/DataDome, and CarGurus terms ban scraping and data mining. Use the Car Selector search link instead.",
  facebook_marketplace:
    "Retired 2026-10-09: scraper relied on stealth browsers + proxies, and Meta terms ban collecting data by automated means without permission. Use the Marketplace search link instead.",
  "facebook-marketplace": "Retired 2026-10-09: see facebook_marketplace.",
};

export function isRetiredSource(sourceId: string): boolean {
  return Boolean(
    RETIRED_SOURCES[
      String(sourceId || "")
        .trim()
        .toLowerCase()
    ],
  );
}

export type RetiredBypassKind =
  | "flaresolverr"
  | "proxy"
  | "stealth"
  | "human-behavior"
  | "cloudflare-bypass";

export class BypassRetiredError extends Error {
  constructor(readonly kind: RetiredBypassKind) {
    super(
      `${kind} is retired: MikeHunt does not bypass bot protection, captchas, logins or rate limits. A blocked site is skipped.`,
    );
    this.name = "BypassRetiredError";
  }
}

/** Throw for any attempt to use retired bypass tooling. */
export function retiredBypass(kind: RetiredBypassKind): never {
  throw new BypassRetiredError(kind);
}
