// The growing store of machine-discovered sites. JSON-on-disk (not a DB table) so it's reviewable in
// git, needs no migration, and the hand-curated CURATED_SITES stay the trusted seed. The discovery
// engine appends here; the CI crawl reads CURATED_SITES + this file. Used by scripts/CI only (uses fs).
import fs from "fs";
import path from "path";
import type { CuratedSite } from "../sources";

const FILE = path.join(
  process.cwd(),
  "lib/scrapers/discovery/discovered-sites.json",
);

/** Canonical domain key for dedup (drops scheme + leading www, lowercased). */
export function domainKey(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
}

export interface DiscoveredSite extends CuratedSite {
  /** "live" = car-site confirmed, "unverified" = resolved but bot-walled (let the crawl decide). */
  status?: "live" | "unverified";
  discoveredVia?: "llm" | "link";
  lastYield?: number;
}

export function readRegistry(): DiscoveredSite[] {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/** Append new sites, deduped by domain against what's already stored. Returns how many were added. */
export function appendRegistry(sites: DiscoveredSite[]): number {
  const current = readRegistry();
  const seen = new Set(current.map((s) => domainKey(s.url)));
  const add = sites.filter((s) => {
    const k = domainKey(s.url);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (add.length)
    fs.writeFileSync(FILE, JSON.stringify([...current, ...add], null, 2) + "\n");
  return add.length;
}

/** Record a crawl yield for a discovered site (so winners can be re-crawled, dead ones retired). */
export function recordYield(url: string, yieldCount: number): void {
  const cur = readRegistry();
  const k = domainKey(url);
  let changed = false;
  for (const s of cur)
    if (domainKey(s.url) === k) {
      s.lastYield = yieldCount;
      changed = true;
    }
  if (changed) fs.writeFileSync(FILE, JSON.stringify(cur, null, 2) + "\n");
}
