// Run the auto-discovery engine. The "machine" that grows the salvage network with no hand-curation.
//   npx tsx scripts/discover-sites.ts [stateCount] [--crawl] [--states=TX,FL] [--max=N]
// Default: scans the first <stateCount> states (alphabetical) for salvage/rebuilder/auction-proxy
// sites, validates + classifies them, and appends to lib/scrapers/discovery/discovered-sites.json.
// Add --crawl to also ingest the freshly-found sites immediately.
import { config } from "dotenv";
import { runDiscovery } from "../lib/scrapers/discovery/engine";
config({ path: ".env.local" });

async function main() {
  const args = process.argv.slice(2);
  const crawl = args.includes("--crawl");
  const statesArg = args.find((a) => a.startsWith("--states="));
  const maxArg = args.find((a) => a.startsWith("--max="));
  const countArg = args.find((a) => /^\d+$/.test(a));

  const ALL = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY",
  ];
  const states = statesArg
    ? statesArg.slice(9).split(",").map((s) => s.trim().toUpperCase())
    : ALL.slice(0, countArg ? parseInt(countArg, 10) : 3);
  const max = maxArg ? parseInt(maxArg.slice(6), 10) : undefined;

  console.log(
    `[discover] scanning ${states.length} state(s): ${states.join(", ")}${crawl ? " (+crawl)" : ""}`,
  );
  const r = await runDiscovery({
    states,
    crawl,
    max,
    onLog: (m) => console.log(`[discover] ${m}`),
  });
  console.log("\n=== DISCOVERY SUMMARY ===");
  console.log(`proposed by LLM: ${r.proposed}`);
  console.log(`added to registry: ${r.added}`);
  if (crawl) console.log(`cars crawled: ${r.crawled}`);
  console.log("per-state new sites:", JSON.stringify(r.perState));
  console.log("sample:");
  for (const s of r.sample)
    console.log(`  ${s.state}/${s.type}  ${s.url}  [${s.status}]  ${s.name}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
