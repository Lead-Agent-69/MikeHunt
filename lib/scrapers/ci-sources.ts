import {
  TOS_RESTRICTED_SOURCES,
  operatorRestoredSources,
  optedInRestrictedSources,
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
 * The default run drops every id in TOS_RESTRICTED_SOURCES, the same rule the Zeus sweep
 * (resolveSweepSources) and the public preview routes (isAutomationAllowedSource) use. A
 * restricted source runs only when the operator names it in CLI args or SCRAPE_SOURCES, and
 * scrape-ci logs that opt-in on every run.
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

/** Terms-safe default set: candidates minus TOS_RESTRICTED_SOURCES, order kept. */
export const CI_DEFAULT_SOURCES: string[] = CI_CANDIDATE_SOURCES.filter(
  (id) => !TOS_RESTRICTED_SOURCES[id],
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
 * terms-safe default. Explicit lists are kept as typed (deduped) because naming a source is the
 * operator's opt-in; the caller logs any restricted ids in `optedInRestricted`.
 */
export function resolveCiSources(
  args: readonly string[] = [],
  envSources: string | undefined = process.env.SCRAPE_SOURCES,
): CiSourceSelection {
  const fromArgs = args.flatMap((arg) => splitIds(arg));
  if (fromArgs.length) {
    const sources = Array.from(new Set(fromArgs));
    return {
      sources,
      origin: "args",
      optedInRestricted: optedInRestrictedSources(sources),
    };
  }
  const fromEnv = splitIds(envSources);
  if (fromEnv.length) {
    const sources = Array.from(new Set(fromEnv));
    return {
      sources,
      origin: "env",
      optedInRestricted: optedInRestrictedSources(sources),
    };
  }
  // Default: terms-safe candidates plus the sources the operator restored (OPERATOR_RESTORED_SOURCES,
  // off again with SCRAPE_TERMS_SAFE_ONLY=1). Restored ids are reported so every run logs them.
  const restored = new Set(operatorRestoredSources());
  const sources = CI_CANDIDATE_SOURCES.filter(
    (id) => !TOS_RESTRICTED_SOURCES[id] || restored.has(id),
  );
  return {
    sources,
    origin: "default",
    optedInRestricted: optedInRestrictedSources(sources),
  };
}
