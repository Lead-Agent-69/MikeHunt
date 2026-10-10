// lib/scrapers/arsenal.ts
//
// State-scoped car-site arsenal: for one US state, every source MikeHunt knows about and whether it
// may run. Catalog first, operator opt-in second. Nothing here fetches anything.
//
//   live              runs in the default sweep (terms reviewed, not policy-blocked)
//   restricted        site terms ban automated access (TOS_RESTRICTED_SOURCES); needs SCRAPE_SOURCES
//   operator_enabled  a restricted source the operator opted into, or a researched candidate the
//                     operator listed in ARSENAL_ENABLE (still robots- and policy-gated per crawl)
//   blocked           curated/candidate host with a terms or bot-challenge block (source-compliance)
//   candidate         researched local inventory, not reviewed yet; probe it, review terms, then enable
//
// Scrapers run on the Zeus Docker worker (scripts/scrape-ci.ts via workers/scrape-worker.ts), never
// on Vercel. `scripts/arsenal-probe.ts` checks candidates' robots.txt + sitemaps from Zeus.

import { CI_CANDIDATE_SOURCES } from "./ci-sources";
import { CURATED_SITES, type CuratedSite } from "./curated-sites";
import { policyBlockFor } from "./source-compliance";
import { STATE_DEALER_CANDIDATES } from "./sources-registry";
import {
  TOS_RESTRICTED_SOURCES,
  isAutomationAllowedSource,
} from "./sweep-schedule";

export type ArsenalStatus =
  | "live"
  | "restricted"
  | "operator_enabled"
  | "blocked"
  | "candidate";

export type ArsenalOrigin = "runner" | "curated" | "candidate";

export interface ArsenalEntry {
  id: string;
  name: string;
  url?: string;
  /** null = national / multi-state source that covers this state. */
  state: string | null;
  city?: string;
  origin: ArsenalOrigin;
  status: ArsenalStatus;
  reason?: string;
}

/** Runner sources that read listings for every state (national search APIs / marketplaces). */
const NATIONAL_RUNNER_NAMES: Record<string, string> = {
  craigslist: "Craigslist (state regions)",
  offerup: "OfferUp",
  carvana: "Carvana",
  autotempest: "AutoTempest",
  visor: "Visor.vin",
  ebay_sold: "eBay sold comps",
  ebay_motors: "eBay Motors",
  cars_com: "Cars.com",
  autotrader: "Autotrader",
  carparts_com: "CarParts.com",
  publicsurplus: "PublicSurplus",
  govdeals: "GovDeals",
  allsurplus: "AllSurplus",
  municibid: "Municibid",
  gsa_auctions: "GSA Auctions (federal surplus)",
  curated_dealers: "Curated dealer network",
  copart: "Copart",
};

/**
 * ARSENAL_ENABLE: comma list of researched candidate ids (e.g. research-tx-some-dealer) the
 * operator reviewed and wants crawled. Explicit ids only; there is no "enable a whole state".
 */
export function arsenalEnabledIds(
  raw: string | undefined = process.env.ARSENAL_ENABLE,
): Set<string> {
  return new Set(
    String(raw || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^research-[a-z]{2}-[a-z0-9-]{1,80}$/.test(s)),
  );
}

function cleanState(state: string) {
  const st = String(state || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(st) ? st : "";
}

export interface ArsenalEnv {
  scrapeSources?: string;
  arsenalEnable?: string;
}

/** Every known source for one state, with its run status. Pure (env passed in for tests). */
export function buildStateArsenal(
  state: string,
  env: ArsenalEnv = {
    scrapeSources: process.env.SCRAPE_SOURCES,
    arsenalEnable: process.env.ARSENAL_ENABLE,
  },
): ArsenalEntry[] {
  const st = cleanState(state);
  if (!st) return [];
  const enabled = arsenalEnabledIds(env.arsenalEnable);
  const out: ArsenalEntry[] = [];

  for (const id of CI_CANDIDATE_SOURCES) {
    const restricted = Boolean(TOS_RESTRICTED_SOURCES[id]);
    const optedIn =
      restricted && isAutomationAllowedSource(id, env.scrapeSources ?? "");
    out.push({
      id,
      name: NATIONAL_RUNNER_NAMES[id] || id,
      state: null,
      origin: "runner",
      status: !restricted
        ? "live"
        : optedIn
          ? "operator_enabled"
          : "restricted",
      reason: restricted ? TOS_RESTRICTED_SOURCES[id] : undefined,
    });
  }

  for (const site of CURATED_SITES) {
    if (site.state !== st) continue;
    const block = policyBlockFor(site.url);
    out.push({
      id: `curated:${hostId(site.url)}`,
      name: site.name,
      url: site.url,
      state: st,
      city: site.city,
      origin: "curated",
      status: block ? "blocked" : "live",
      reason: block?.reason,
    });
  }

  for (const cand of STATE_DEALER_CANDIDATES) {
    if (!cand.states?.includes(st)) continue;
    const block = policyBlockFor(cand.url);
    const on = enabled.has(cand.id);
    out.push({
      id: cand.id,
      name: cand.name,
      url: cand.url,
      state: st,
      city: cand.location?.split(",")[0]?.trim(),
      origin: "candidate",
      status: block ? "blocked" : on ? "operator_enabled" : "candidate",
      reason: block
        ? block.reason
        : on
          ? "Enabled by ARSENAL_ENABLE. Still robots.txt- and policy-gated on every crawl."
          : "Researched local inventory. Run scripts/arsenal-probe.ts, review the site's terms, then add its id to ARSENAL_ENABLE.",
    });
  }
  return out;
}

function hostId(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
}

export interface ArsenalSummary {
  state: string;
  live: number;
  restricted: number;
  operatorEnabled: number;
  blocked: number;
  candidate: number;
}

export function summarizeArsenal(
  state: string,
  entries: readonly ArsenalEntry[],
): ArsenalSummary {
  const count = (s: ArsenalStatus) =>
    entries.filter((e) => e.status === s).length;
  return {
    state,
    live: count("live"),
    restricted: count("restricted"),
    operatorEnabled: count("operator_enabled"),
    blocked: count("blocked"),
    candidate: count("candidate"),
  };
}

/**
 * Researched candidates the operator enabled, shaped as curated sites so the curated crawler can
 * read them. Policy-blocked hosts are never returned. Robots.txt is checked by the crawler.
 */
export function arsenalCuratedSites(
  raw: string | undefined = process.env.ARSENAL_ENABLE,
): CuratedSite[] {
  const enabled = arsenalEnabledIds(raw);
  if (!enabled.size) return [];
  const curatedHosts = new Set(CURATED_SITES.map((s) => hostId(s.url)));
  return STATE_DEALER_CANDIDATES.filter(
    (c) =>
      enabled.has(c.id) &&
      !policyBlockFor(c.url) &&
      !curatedHosts.has(hostId(c.url)),
  ).map((c) => ({
    url: c.url,
    name: c.name,
    state: c.states?.[0],
    city: c.location?.split(",")[0]?.trim(),
    type: "independent_dealer" as const,
  }));
}
