// Norfolk VA city impound auction results → sold_listings (source gov_norfolk_impound, basis 'sold',
// sale_channel gov_impound_auction). Public domain (Norfolk open data). Idempotent: re-running only
// adds new auction rows, so it is safe as a daily job on Zeus. One SoQL request per 1,000 rows.
//
//   npx tsx scripts/sync-norfolk-sold.ts                 # dry run, last 180 days
//   npx tsx scripts/sync-norfolk-sold.ts --since 2025-10-01 --write
import {
  fetchNorfolkSoldRows,
  norfolkSoldRows,
} from "../lib/sources/open-gov/sold-comps";
import { flag, report } from "./sold-comps-cli";

async function main() {
  const since =
    flag("since") ||
    new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const raw = await fetchNorfolkSoldRows(since);
  const rows = norfolkSoldRows(raw);
  console.log(
    `[norfolk] ${raw.length} auctioned rows since ${since} → ${rows.length} car/truck sales`,
  );
  await report("norfolk", rows);
}

main().catch((e) => {
  console.error("[norfolk] failed:", (e as Error).message);
  process.exit(1);
});
