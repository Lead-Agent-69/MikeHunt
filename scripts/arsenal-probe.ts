/**
 * Arsenal probe — run on Zeus (inside the scraper container), never on Vercel.
 *
 *   docker compose exec scraper npx tsx scripts/arsenal-probe.ts TX [OK ...]
 *
 * For each researched candidate in the given states: skips policy-blocked hosts, fetches
 * robots.txt (one request per host), checks the homepage is allowed for our agent, and, only if
 * allowed, reads the site's own sitemaps for listing-like URLs. Writes a JSON report to
 * $LOCAL_CACHE_PATH/arsenal/<STATE>.json (the Zeus volume). Never scrapes listing pages and never
 * enables anything: the operator reviews terms and adds ids to ARSENAL_ENABLE.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildStateArsenal } from "@/lib/scrapers/arsenal";
import { createRobotsGate } from "@/lib/scrapers/source-compliance";
import { discoverListingUrls } from "@/lib/scrapers/crawl-discovery";

async function main() {
  const states = process.argv
    .slice(2)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{2}$/.test(s));
  if (!states.length) {
    console.error("usage: tsx scripts/arsenal-probe.ts TX [OK ...]");
    process.exit(2);
  }
  const allowed = createRobotsGate();
  const dir = path.resolve(
    process.env.LOCAL_CACHE_PATH || "./cache",
    "arsenal",
  );
  await mkdir(dir, { recursive: true });
  for (const state of states) {
    const rows = [];
    for (const entry of buildStateArsenal(state)) {
      if (entry.origin !== "candidate" || !entry.url) continue;
      if (entry.status === "blocked") {
        rows.push({
          id: entry.id,
          url: entry.url,
          result: "policy_blocked",
          reason: entry.reason,
        });
        continue;
      }
      const robotsOk = await allowed(entry.url);
      let listingUrls: string[] = [];
      if (robotsOk) {
        listingUrls = await discoverListingUrls(entry.url, { limit: 20 }).catch(
          () => [],
        );
        const gated: string[] = [];
        for (const u of listingUrls) if (await allowed(u)) gated.push(u);
        listingUrls = gated;
      }
      rows.push({
        id: entry.id,
        name: entry.name,
        url: entry.url,
        result: robotsOk
          ? listingUrls.length
            ? "ready_for_terms_review"
            : "no_listing_urls"
          : "robots_disallowed_or_unreachable",
        listingUrlSample: listingUrls.slice(0, 5),
        listingUrlCount: listingUrls.length,
      });
      await new Promise((r) => setTimeout(r, 1500)); // polite between hosts
    }
    const file = path.join(dir, `${state}.json`);
    await writeFile(
      file,
      JSON.stringify(
        { state, probedAt: new Date().toISOString(), rows },
        null,
        2,
      ),
    );
    console.log(
      `[arsenal-probe] ${state}: ${rows.length} candidates → ${file}`,
    );
  }
}

main().catch((e) => {
  console.error("[arsenal-probe] failed:", (e as Error).message);
  process.exit(1);
});
