import {
  optedInRestrictedSources,
  isAutomationAllowedSource,
} from "./sweep-schedule";

/**
 * Source selection for scripts/scrape-ci.ts (and workers/scrape-worker.ts, which spawns it).
 *
 * CI_CANDIDATE_SOURCES is the ordered list of runner-enabled, $0 sources scrape-ci knows how to
 * run. Explicit ids bypass the registry `enabled` flag (lib/scrapers/runner.ts), so this list must
 * not name disabled sources. Not listed (enabled:false): cargurus, independent_dealer, iaa,
 * manheim, acv, adesa, facebook_marketplace, vroom, auto_discover. truecar is enabled but
 * headed-only, so it only runs when an operator names it.
 *
 * Defaults and explicit lists both require reviewed source authorization. CLI args and
 * SCRAPE_SOURCES select candidates; neither grants permission.
 */
export const CI_CANDIDATE_SOURCES = [
  "craigslist",
  "offerup",
  "carvana",
  "autotempest",
  "ebay_sold",
  "ebay_motors",
  "cars_com",
  "autotrader",
  "carparts_com",
  "publicsurplus",
  "govdeals",
  "allsurplus",
  "municibid",
  "gsa_auctions",
  "curated_dealers",
  "copart",
] as const;

/** Reviewed candidates only; the curated dispatcher checks each underlying host separately. */
export const CI_DEFAULT_SOURCES: string[] = CI_CANDIDATE_SOURCES.filter((id) =>
  isAutomationAllowedSource(id),
);

export type CiSourceSelection = {
  sources: string[];
  origin: "args" | "env" | "default";
  /** Restricted ids in this run: named explicitly, or restored by default (OPERATOR_RESTORED_SOURCES). */
  optedInRestricted: string[];
};

function splitIds(raw: string | undefined): string[] {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Resolve the sources for one scrape-ci run. Priority: CLI args, then SCRAPE_SOURCES, then the
 * reviewed default. Explicit lists are deduped and filtered through the same approval gate.
 */
export function resolveCiSources(
  args: readonly string[] = [],
  envSources: string | undefined = process.env.SCRAPE_SOURCES,
): CiSourceSelection {
  const fromArgs = args.flatMap((arg) => splitIds(arg));
  if (fromArgs.length) {
    const sources = Array.from(new Set(fromArgs)).filter((id) =>
      isAutomationAllowedSource(id),
    );
    return {
      sources,
      origin: "args",
      optedInRestricted: optedInRestrictedSources(sources),
    };
  }
  const fromEnv = splitIds(envSources);
  if (fromEnv.length) {
    const sources = Array.from(new Set(fromEnv)).filter((id) =>
      isAutomationAllowedSource(id),
    );
    return {
      sources,
      origin: "env",
      optedInRestricted: optedInRestrictedSources(sources),
    };
  }
  // Default selection uses reviewed authorization, with no operator permission override.
  const sources = CI_CANDIDATE_SOURCES.filter((id) =>
    isAutomationAllowedSource(id),
  );
  return {
    sources,
    origin: "default",
    optedInRestricted: optedInRestrictedSources(sources),
  };
}
