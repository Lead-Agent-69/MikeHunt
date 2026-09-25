// Bounded smoke test for the curated salvage/dealer network. Crawls the first N curated sites, then
// queries back what landed so we can confirm (a) cars ingested and (b) they categorize into the right
// lane (salvage/repairable), not "private". Run: npx tsx scripts/smoke-curated.ts [N]
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { scrapeCuratedSites, CURATED_SITES } from "../lib/scrapers/sources";
import { dealLane } from "../lib/discovery/categorize";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const n = parseInt(process.argv[2] || "3", 10);
  console.log(
    `\n=== SMOKE: crawling first ${n} of ${CURATED_SITES.length} curated sites ===`,
  );
  for (const s of CURATED_SITES.slice(0, n))
    console.log(`  • ${s.name} (${s.type}${s.state ? `/${s.state}` : ""})`);

  const before = await sb
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("source", "independent_dealer");

  const total = await scrapeCuratedSites(n);
  console.log(`\nscrapeCuratedSites returned: ${total} listings`);

  // Pull the most recent independent_dealer rows and show their computed lane.
  const { data: rows } = await sb
    .from("deals")
    .select("title, source, condition, damage_type, location_state, source_url")
    .eq("source", "independent_dealer")
    .order("last_seen_at", { ascending: false })
    .limit(20);

  const laneCounts: Record<string, number> = {};
  for (const r of rows || []) {
    const lane = dealLane(r as any);
    laneCounts[lane] = (laneCounts[lane] || 0) + 1;
  }
  console.log(
    `\nindependent_dealer rows before: ${before.count ?? "?"} · sampled latest ${rows?.length ?? 0}`,
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
