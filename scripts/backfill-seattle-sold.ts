// One-time backfill: Seattle FAS Sold Fleet Equipment → sold_listings (source gov_seattle_fleet,
// basis 'sold', sale_channel gov_fleet_auction). Public Domain. The dataset has published no sale
// since 2025-12-19, so this is a backfill, not a feed; re-running is harmless (idempotent upsert).
//
//   npx tsx scripts/backfill-seattle-sold.ts            # dry run
//   npx tsx scripts/backfill-seattle-sold.ts --write
import {
  fetchSeattleSoldRows,
  seattleSoldRows,
} from "../lib/sources/open-gov/sold-comps";
import { report } from "./sold-comps-cli";

async function main() {
  const raw = await fetchSeattleSoldRows();
  const rows = seattleSoldRows(raw);
  console.log(
    `[seattle] ${raw.length} sold fleet rows → ${rows.length} car/light-truck sales`,
  );
  await report("seattle", rows);
}

main().catch((e) => {
  console.error("[seattle] failed:", (e as Error).message);
  process.exit(1);
});
