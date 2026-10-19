import { load } from "cheerio";
import {
  crawlDealerCms,
  dealerCmsSiteFor,
} from "../lib/scrapers/platforms/dealer-cms";
import { politeFetch } from "../lib/scrapers/polite";
import { policyBlockFor } from "../lib/scrapers/source-compliance";
import { partitionVehicleScope } from "../lib/vehicle/vehicle-scope";

// Read-only: no pipeline, database client, queue, or collector-cache writer is imported.
async function main() {
  const observations = [];
  for (const host of [
    "https://x2builders.com",
    "https://www.billsmithauto.com",
    "https://www.riverbendrebuildables.com",
  ]) {
    const site = dealerCmsSiteFor(host)!;
    const block = policyBlockFor(host);
    if (block)
      throw new Error(`${site.name}: permission required (${block.kind})`);
    const rows = await crawlDealerCms(site, {
      load,
      fetchHtml: (url) =>
        politeFetch(url, { maxRetries: 0, timeoutMs: 25_000 }),
    });
    if (!rows.length)
      throw new Error(`${site.name}: no parseable inventory; inspect source`);
    if (
      rows.some(
        (row) =>
          !row.images?.length || !row.ask_price || !row.year || !row.model,
      )
    ) {
      // Non-vehicle equipment must remain subject to the normal intake gates.
      const vehicleRows = partitionVehicleScope(rows).kept;
      if (
        vehicleRows.some(
          (row) =>
            !row.images?.length || !row.ask_price || !row.year || !row.model,
        )
      )
        throw new Error(`${site.name}: missing required vehicle evidence`);
    }
    const titleCounts: Record<string, number> = {};
    for (const row of rows)
      titleCounts[row.condition || "unknown"] =
        (titleCounts[row.condition || "unknown"] || 0) + 1;
    observations.push({
      source: site.sourceId,
      observedAt: new Date().toISOString(),
      parsed: rows.length,
      eligibleVehicleTypes: partitionVehicleScope(rows).kept.length,
      withPhotos: rows.filter((row) => row.images?.length).length,
      titleCounts,
      published: false,
    });
  }
  console.log(JSON.stringify({ mode: "read_only", observations }, null, 2));
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Source verification failed",
  );
  process.exitCode = 1;
});
