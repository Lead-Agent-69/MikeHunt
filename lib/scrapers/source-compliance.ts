/**
 * Crawl compliance for the curated salvage / dealer network.
 *
 * 1. SITE_POLICY_BLOCKS: hosts we must not crawl. The reasons come from each site's own terms or behaviour,
 *    as reviewed on 2026-10-05: an explicit ban on robots/automated access, a ban on copying or displaying
 *    content, a bot challenge we will not bypass (no stealth), or an operator that bans bots on a sister
 *    portal. A blocked host is skipped before any request is made.
 * 2. robots.txt: every curated site's homepage and inventory page must be allowed for user-agent `*`
 *    (or our own token) before we fetch it.
 *
 * Rows stay URL-only (CACHE_PHOTOS_MAX=0). Nothing here changes prices.
 */

import { politeUserAgent } from "./polite/identity";

export type PolicyBlockKind =
  | "tos_bans_bots"
  | "tos_bans_copying"
  | "bot_challenge"
  | "needs_permission";

export interface PolicyBlock {
  kind: PolicyBlockKind;
  reason: string;
}

export const SITE_POLICY_BLOCKS: Record<string, PolicyBlock> = {
  "prosalvage.com": {
    kind: "tos_bans_bots",
    reason:
      "Terms ban robots, scripts, or spiders without prior written approval (Creative Design Group).",
  },
  "rebuildautos.com": {
    kind: "needs_permission",
    reason:
      "Run by Creative Design Group, whose ProSalvage terms ban automated access to 'the Company's sites'. It offers a data feed, so ask for that.",
  },
  "rebuild1.com": {
    kind: "needs_permission",
    reason:
      "Redirects to RebuildAutos (Creative Design Group). Same as rebuildautos.com.",
  },
  "rebuildtrucks.com": {
    kind: "needs_permission",
    reason: "Creative Design Group portal. Same as rebuildautos.com.",
  },
  "aeofmiami.com": {
    kind: "tos_bans_bots",
    reason:
      "Terms: no robot, spider, scraper, or other automated means without express written permission.",
  },
  "globalautoauctions.com": {
    kind: "tos_bans_bots",
    reason:
      "Terms: no robot, spider, scraper, or other automated means without express written permission.",
  },
  "casmiami.com": {
    kind: "tos_bans_bots",
    reason:
      "Terms ban bots, spiders, or automated devices that monitor or copy the site.",
  },
  "bidgodrive.com": {
    kind: "tos_bans_copying",
    reason:
      "Terms ban copying, downloading, displaying, or reproducing any materials without written consent.",
  },
  "erepairables.com": {
    kind: "tos_bans_copying",
    reason:
      "Terms ban copying, publishing, or exploiting content. Prices sit behind a paywall and the site serves a bot challenge.",
  },
  "repairablevehicles.com": {
    kind: "bot_challenge",
    reason:
      "Returns 403 to every non-browser request, including robots.txt. We will not bypass it.",
  },
  "municibid.com": {
    kind: "tos_bans_copying",
    reason:
      "Terms ban reproducing or publicly displaying the website. The site also serves a bot challenge.",
  },
  "autobidmaster.com": {
    kind: "bot_challenge",
    reason: "Serves a Cloudflare challenge. We will not bypass it.",
  },
  "ridesafely.com": {
    kind: "bot_challenge",
    reason: "Serves a Cloudflare challenge. We will not bypass it.",
  },
  "salvageautosauction.com": {
    kind: "bot_challenge",
    reason: "Serves a Cloudflare challenge. We will not bypass it.",
  },
  "salvagereseller.com": {
    kind: "bot_challenge",
    reason: "Serves a Cloudflare challenge. We will not bypass it.",
  },
  "revroom.org": {
    kind: "bot_challenge",
    reason: "Serves a Cloudflare challenge. We will not bypass it.",
  },
  "billionauto.com": {
    kind: "tos_bans_bots",
    reason:
      "Terms: data-mining and using a robot, spider, or automated device of any kind to monitor or copy the site is strictly prohibited (reviewed 2026-10-06).",
  },
  "craigandlandrethcars.com": {
    kind: "tos_bans_bots",
    reason:
      "Terms: no robot, spider, site search/retrieval application or other device to scrape, data mine or collect content (reviewed 2026-10-06).",
  },
  // Marketplace hosts that also appear on CURATED_SITES as auction_proxy. Runner ids are already
  // in TOS_RESTRICTED_SOURCES; without these blocks, curated_dealers could still crawl them when
  // SCRAPE_SOURCES is empty (hybrid Zeus default).
  "govdeals.com": {
    kind: "tos_bans_bots",
    reason:
      "Liquidity Services User Agreement (GovDeals): no spiders, crawlers, robots or similar means to access the site, and no data mining (reviewed 2026-10-06).",
  },
  "allsurplus.com": {
    kind: "tos_bans_bots",
    reason:
      "Liquidity Services User Agreement (AllSurplus): no spiders, crawlers, robots or similar means to access the site, and no data mining (reviewed 2026-10-06).",
  },
  "publicsurplus.com": {
    kind: "tos_bans_bots",
    reason:
      "publicsurplus.com terms: no robot, spider or automatic device to monitor or copy the site without written permission (reviewed 2026-10-06).",
  },
};

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Curated sites restored by operator decision (Jonah 2026-10-09: never remove or disable sources;
 * bring back any market that was turned off). Each was in CURATED_SITES and crawled before #80
 * (6f9bdf0, 2026-10-05) added its terms block; A&E of Miami had 91 live rows when it was cut off.
 * Their SITE_POLICY_BLOCKS entries stay as the record of each site's terms, but no longer stop the
 * crawl. robots.txt, the polite per-host delay and URL-only rows (no photo copies) still apply.
 *
 * Not restored, on purpose: bot_challenge hosts (they never returned data, and we do not bypass
 * challenges); erepairables.com and municibid.com (bot challenge too; Municibid runs through its own
 * runner); govdeals/allsurplus/publicsurplus.com (their dedicated runners are restored instead, and
 * this block only stops curated_dealers from crawling them a second time); billionauto.com and
 * craigandlandrethcars.com (blocked on the day they were researched, never part of the network).
 * Kill switch: SCRAPE_TERMS_SAFE_ONLY=1.
 */
export const OPERATOR_RESTORED_HOSTS: readonly string[] = [
  "aeofmiami.com",
  "prosalvage.com",
  "rebuildautos.com",
  "rebuild1.com",
  "rebuildtrucks.com",
  "globalautoauctions.com",
  "casmiami.com",
  "bidgodrive.com",
];

function restoredHostsActive() {
  return !/^(1|true|yes|on)$/i.test(
    String(process.env.SCRAPE_TERMS_SAFE_ONLY || "").trim(),
  );
}

/** The policy block for a URL's host (or a parent domain), if any. */
export function policyBlockFor(url: string): PolicyBlock | undefined {
  const host = hostOf(url);
  if (!host) return undefined;
  if (
    restoredHostsActive() &&
    OPERATOR_RESTORED_HOSTS.some(
      (restored) => host === restored || host.endsWith(`.${restored}`),
    )
  ) {
    return undefined;
  }
  for (const [blocked, block] of Object.entries(SITE_POLICY_BLOCKS)) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return block;
  }
  return undefined;
}

/* ---------------- robots.txt ---------------- */

interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

export function parseRobots(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const raw of String(body || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false;
      // An empty Disallow means "allow everything" and adds no rule.
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function ruleMatches(rule: string, target: string) {
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(target);
}

/**
 * Whether `url` may be fetched under these robots rules (RFC 9309): use the most specific matching
 * user-agent group, else `*`. The longest matching rule wins, and Allow wins a tie.
 */
export function robotsAllows(body: string, url: string, agent = "mikehuntbot") {
  let target: string;
  try {
    const u = new URL(url);
    target = `${u.pathname || "/"}${u.search}`;
  } catch {
    return false;
  }
  const groups = parseRobots(body);
  const token = agent.toLowerCase();
  const own = groups.filter((g) =>
    g.agents.some((a) => a !== "*" && token.includes(a)),
  );
  const chosen = own.length
    ? own
    : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const rule of chosen.flatMap((g) => g.rules)) {
    if (!ruleMatches(rule.path, target)) continue;
    const len = rule.path.length;
    if (!best || len > best.len || (len === best.len && rule.allow))
      best = { allow: rule.allow, len };
  }
  return best ? best.allow : true;
}

type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<Pick<Response, "status" | "text">>;

/**
 * A per-origin cached robots gate. A 4xx robots.txt (no file) allows everything. A 5xx or network
 * failure disallows, to be safe, until the next run.
 */
export function createRobotsGate(
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  agent = "mikehuntbot",
) {
  const cache = new Map<string, Promise<string | null>>();
  const load = (origin: string) => {
    let pending = cache.get(origin);
    if (!pending) {
      pending = (async () => {
        try {
          const res = await fetchImpl(`${origin}/robots.txt`, {
            headers: {
              "User-Agent": politeUserAgent(),
            },
            signal: AbortSignal.timeout(15_000),
          });
          if (res.status >= 500) return null;
          if (res.status >= 400) return "";
          return await res.text();
        } catch {
          return null;
        }
      })();
      cache.set(origin, pending);
    }
    return pending;
  };
  return async function allowed(url: string) {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return false;
    }
    const body = await load(origin);
    if (body === null) return false;
    return robotsAllows(body, url, agent);
  };
}
