// GSA Auctions closing bids → sold_listings as basis 'last_bid' (NOT 'sold'): the GovAuctions.app
// dataset's `current_or_final_bid` is the last observed bid, "a bid level, not a confirmed sale price".
// Licence: CC BY 4.0. Every row stores the dataset's credit line in sold_listings.attribution.
// The dataset is rebuilt on the 1st of each month; re-running adds only new lots (idempotent).
//
// Do not run --write until sold-comp readers filter basis = 'sold' (#264); before that, /api/market/sold
// would average these bids in. The writer also refuses while migration 20261010410000 is missing.
//
//   npx tsx scripts/import-gsa-closing-bids.ts          # dry run
//   npx tsx scripts/import-gsa-closing-bids.ts --write
import {
  fetchGsaDatasetRows,
  gsaClosingBidRows,
} from "../lib/sources/open-gov/sold-comps";
import { report } from "./sold-comps-cli";

async function main() {
  const raw = await fetchGsaDatasetRows();
  const rows = gsaClosingBidRows(raw);
  console.log(
    `[gsa] ${raw.length} dataset lots → ${rows.length} car/truck lots sold=true with a closing bid`,
  );
  await report("gsa", rows);
}

main().catch((e) => {
  console.error("[gsa] failed:", (e as Error).message);
  process.exit(1);
});
