import { parseRobots, robotsAllows } from "../source-compliance";
import { ROBOTS_AGENT } from "./identity";

/**
 * Crawl-delay (seconds) for our agent from a robots.txt body, or null when none is set. Uses the same
 * group selection as robotsAllows: our own token's group wins, else `*`.
 */
export function robotsCrawlDelaySeconds(
  body: string,
  agent: string = ROBOTS_AGENT,
): number | null {
  const token = agent.toLowerCase();
  let current: { agents: string[]; delay: number | null } | null = null;
  const groups: { agents: string[]; delay: number | null }[] = [];
  let lastWasAgent = false;
  for (const raw of String(body || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "crawl-delay" && current) {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.delay = n;
    }
  }
  const own = groups.filter((g) =>
    g.agents.some((a) => a !== "*" && token.includes(a)),
  );
  const chosen = own.length
    ? own
    : groups.filter((g) => g.agents.includes("*"));
  const delays = chosen
    .map((g) => g.delay)
    .filter((d): d is number => d != null);
  return delays.length ? Math.max(...delays) : null;
}

export interface RobotsRecord {
  /** null = robots.txt could not be read (5xx / network): treat every path as disallowed. */
  body: string | null;
  crawlDelaySec: number | null;
  sitemaps: string[];
}

export function robotsRecordFromBody(body: string | null): RobotsRecord {
  if (body === null) return { body: null, crawlDelaySec: null, sitemaps: [] };
  const sitemaps: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap:\s*(\S+)/i);
    if (m) sitemaps.push(m[1]);
  }
  return { body, crawlDelaySec: robotsCrawlDelaySeconds(body), sitemaps };
}

export function robotsRecordAllows(record: RobotsRecord, url: string): boolean {
  if (record.body === null) return false;
  return robotsAllows(record.body, url, ROBOTS_AGENT);
}

// Re-exported so callers only import the polite module.
export { parseRobots };
