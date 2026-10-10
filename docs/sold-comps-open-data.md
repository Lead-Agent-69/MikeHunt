# Free sold comps (open government data, GSA closing bids, GovDeals sold lots)

Based on kera's sold-coverage audit (2026-10-10). Everything here is free, and each source's licence
allows it. All rows go to `sold_listings` with a stable `(source, source_item_id)`, so every writer is
an idempotent upsert that leaves existing rows alone. Migration `20261010410000_sold_listings_open_gov_comps.sql`
(needs Ren's sign) adds `attribution` and `sale_channel` and widens `basis` to allow `last_bid`. Until it's applied,
the writer refuses to write instead of quietly dropping those columns.

| source                    | what the price is                                                                                                                        | basis                     | sale_channel          | licence / attribution                                                                                                                          | how it runs                                                                       | rows (measured 2026-10-10)                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gov_norfolk_impound`     | Norfolk VA city impound auction `sold_for`                                                                                               | `sold`                    | `gov_impound_auction` | Public domain (Norfolk open data); credit stored per row                                                                                       | `scripts/sync-norfolk-sold.ts` (daily, incremental, 1 SoQL call per 1k rows)      | 488 in the 180-day comp window; 944 since 2025-10-10; 11,321 all-time (since 2014); ~80/month                                                        |
| `gov_seattle_fleet`       | Seattle FAS fleet sale `sale_price`                                                                                                      | `sold`                    | `gov_fleet_auction`   | Public Domain; credit stored per row                                                                                                           | `scripts/backfill-seattle-sold.ts` (one-time)                                     | 162 cars/light trucks of 267 rows (2025-02-21 to 2025-12-19). None of them fall in the 180-day window, so they count for history, not today's median |
| `gsa_closing_bid`         | GSA Auctions **last observed bid at close** (GovAuctions.app dataset). The dataset says it is "a bid level, not a confirmed sale price". | `last_bid` (never `sold`) | `gov_surplus_auction` | **CC BY 4.0**: commercial use allowed with credit. The dataset's credit line is stored verbatim in `attribution` on every row                  | `scripts/import-gsa-closing-bids.ts` (monthly; the dataset is rebuilt on the 1st) | 1,222 car/light-truck lots with `sold=true` (May–Aug 2026, ~300/month). No VIN or mileage                                                            |
| `govdeals` / `allsurplus` | Winning bid on a lot the venue marks `isSoldAuction`, before buyer's premium                                                             | `sold`                    | `gov_surplus_auction` | Facts only, linked back. These sources are terms-restricted (see `TOS_RESTRICTED_SOURCES`) and run by operator decision; this adds no requests | Inside the existing GovDeals/AllSurplus scrape (`lqdt-maestro.ts`)                | ~0 per run today: the search sorts by time remaining, so sold lots rarely show up (0 of 113 in kera's probe)                                         |

## Why GovDeals sold rows were discarded

`maestroAssetToDeal` returns `null` for `isSoldAuction` lots, which is right for live deals because a
closed lot isn't a lead. The sale price was then thrown away. `scrapeMaestro` now also maps those
assets with `maestroAssetToSoldComp` and writes them as sold comps (best-effort, skipped in cache-only
mode, never fails the live scrape).

## Keeping lanes honest

- Retail medians (`/api/sold`, `market-value` sold index) only use rows whose title says clean title,
  so impound, fleet and GSA rows land in the "unknown" lane and are counted but never averaged into a
  retail price. `sale_channel` lets a later UI show them as their own lane.
- `last_bid` rows must stay out of every sold reader. #264 makes the readers filter `basis = 'sold'`.
  **Don't run the GSA import with `--write` until #264 is merged.** Before that, `/api/market/sold`
  would average the bids in.
- No plates, owner or tow-location fields, no photos, no seller contact.

## Running

All three scripts dry-run by default and print counts by month. Add `--write` to upsert (needs
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`). Scheduling Norfolk daily on Zeus is a deploy step.
