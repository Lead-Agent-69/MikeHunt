// Bounded smoke test for the curated salvage/dealer network. Rotates through up to N eligible sites, then
// queries back what landed so we can confirm (a) cars ingested and (b) they categorize into the right
// lane. Run: npx tsx scripts/smoke-curated.ts [N] [FL,KY,...] [dealer-host,...]
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { scrapeCuratedSites, CURATED_SITES } from "../lib/scrapers/sources";
import { dealLane } from "../lib/discovery/categorize";
import { withSweepPlan } from "../lib/scrapers/sweep-plan";
import { LocalScraperCache } from "../lib/scrapers/local-cache";
import { withLocalWriteContext } from "../lib/scrapers/local-write-context";
import { withScrapeRunScope } from "../lib/scrapers/run-scope-context";
config({ path: process.env.SCRAPER_ENV_FILE || ".env.local" });
if (process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL)
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const n = Number(process.argv[2] || "3");
  const states = (process.argv[3] || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const dealerSourceIds = (process.argv[4] || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (
    !Number.isInteger(n) ||
    n < 1 ||
    n > CURATED_SITES.length ||
    states.some((s) => !/^[A-Z]{2}$/.test(s))
  )
    throw new Error(
      "Usage: npx tsx scripts/smoke-curated.ts [1..site count] [FL,KY,...] [dealer-host,...]",
    );
  const startedAt = new Date().toISOString();
  console.log(
    `Inventory database: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host}`,
  );
  console.log(
    `\n=== SMOKE: attempting up to ${n} policy-eligible curated sites, persistent rotation${states.length ? `; demand ${states.join(",")}` : ""} ===`,
  );

  const before = await sb
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("source", "independent_dealer")
    .eq("active", true);
  if (before.error)
    throw new Error(`Inventory read failed: ${before.error.message}`);

  const cache = new LocalScraperCache({
    maxDailyInserts: Math.min(
      500,
      Number(process.env.MAX_DAILY_INSERTS || 500),
    ),
    maxDailyUpdates: Math.min(
      500,
      Number(process.env.MAX_DAILY_UPDATES || 500),
    ),
    cacheOnly: false,
  });
  await cache.load();
  const total = await withLocalWriteContext(
    { cache, supabase: sb, cacheOnly: false, respectAccessBlocks: true },
    () =>
      withScrapeRunScope(
        dealerSourceIds.length ? { dealerSourceIds } : undefined,
        () =>
          withSweepPlan(
            states.length ? { states, zipsByState: {} } : undefined,
            () =>
              scrapeCuratedSites(n, {
                deadlineAt: Date.now() + 10 * 60_000,
                abortSignal: AbortSignal.timeout(10 * 60_000),
              }),
          ),
      ),
  );
  console.log(`\nscrapeCuratedSites returned: ${total} listings`);

  // Pull the most recent independent_dealer rows and show their computed lane.
  const { data: rows, error } = await sb
    .from("deals")
    .select("title, source, condition, damage_type, location_state, source_url")
    .eq("source", "independent_dealer")
    .gte("last_seen_at", startedAt)
    .order("last_seen_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Inventory read-back failed: ${error.message}`);
  const after = await sb
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("source", "independent_dealer")
    .eq("active", true);
  if (after.error)
    throw new Error(`Inventory count failed: ${after.error.message}`);

  const laneCounts: Record<string, number> = {};
  for (const r of rows || []) {
    const lane = dealLane(r as any);
    laneCounts[lane] = (laneCounts[lane] || 0) + 1;
  }
  console.log(
    `\nActive independent_dealer rows: ${before.count} -> ${after.count} (net ${(after.count || 0) - (before.count || 0)}); re-observed sample ${rows?.length ?? 0}`,
  );
  console.log("lane distribution (latest sample):", laneCounts);
  console.log("\nsample rows:");
  for (const r of (rows || []).slice(0, 8)) {
    console.log(
      `  [${dealLane(r as any).padEnd(11)}] ${String(r.condition).padEnd(14)} ${(r.title || "").slice(0, 50)}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
