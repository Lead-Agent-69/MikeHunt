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

- **Flag:** `SOLD_CAPTURE_LQDT`, **default ON**. Set `SOLD_CAPTURE_LQDT=0` (or `false`/`off`/`no`) to
  stop writing these rows. Live GovDeals/AllSurplus deal scraping is unchanged either way.
- **What the price is:** `isSoldAuction` means the auction closed with a winning bid. **A GovDeals
  seller (the agency) can still reject the high bid after close**, and the buyer can default, so this
  is the closing price the venue reported, not a confirmed transfer. It is kept as `basis = 'sold'`
  in the gov surplus lane and never enters retail comps.
- **Accepted risk (operator decision, 2026-10-10):** GovDeals/AllSurplus are terms-restricted (the
  Liquidity Services User Agreement bans robots and data mining). Keeping their sold-price history
  is a new use of restricted-source data. Jonah approved it as an accepted risk; that is a business
  decision, not permission. Revisit on any Liquidity Services takedown, C&D or terms change, before
  any paid or public launch, or before these rows are shown outside the gov lane or exported. The
  entry for `docs/legal/republish-policy.md` "Accepted risks" is filed as a follow-up on #290 (that
  file lands with #290).

## Keeping lanes honest

- Retail comps: every reader that turns sold rows into a price (`/api/sold` median,
  `/api/market/sold` average, the `market-value` sold index, `/api/arbitrage` comps, the
  `/api/system/status` count) goes through `lib/scoring/sold-scope.ts`: `basis = 'sold'` AND
  `sale_channel IS NULL`. Gov impound, fleet and surplus sales and GSA closing bids never count.
  `lib/scoring/sold-scope.test.ts` fails if a new `sold_listings` read skips that, unless it is an
  attributed gov lane.
- Gov lane: `/api/sold` returns `govLane` separately: Norfolk/Seattle/GovDeals sold prices
  ("Sold for") and GSA closing bids ("Last observed bid at close"). Each row carries its
  `attribution`, plus a `credits` list. Rows without attribution are not shown, and the DB rejects a
  gov row without attribution (`sold_listings_gov_attribution`). **Show the CC BY 4.0 credit wherever
  GSA rows are displayed.** The sold-comps card (`components/deal/RecentlySold.tsx`, `GovLane`)
  shows the lane under the retail records, with each row's price meaning and a "Sources:" credits
  line. Any other UI that renders `govLane` must render `attribution`/`credits` too.
- `20261010411000` adds `CHECK (basis <> 'last_bid' OR attribution IS NOT NULL)`; its self-check
  verifies both credit constraints by definition (`pg_get_constraintdef`).
- The guard test resolves `.from(CONST)` too: any identifier bound to `"sold_listings"`.
- `last_bid` is GSA only. Norfolk, Seattle and GovDeals `isSoldAuction` are `sold`.
- Hold: this PR needs #264 (basis column + filters) merged first. Don't run the GSA import with
  `--write` before both are applied.
- No plates, owner or tow-location fields, no photos, no seller contact.

## Licences and basis

- **Norfolk:** published under the City of Norfolk Open Data Policy, approved by Ordinance No. 46,912
  (adopted and effective July 18, 2017; https://opendatapolicyhub.sunlightfoundation.com/collection/norfolk-va-2017-07-18/,
  https://www.norfolk.gov/3885/Open-Data-Norfolk). Credit stored per row.
- **Seattle:** City of Seattle open data (data.seattle.gov), public domain; credit stored per row.
- **GSA closing bids:** GovAuctions.app dataset, CC BY 4.0. The credit line is stored per row and must
  be shown with the row.
- **GovDeals/AllSurplus:** restricted; see the accepted risk above.

## Fetch bounds

Every script fetch has a timeout (30s for Norfolk/Seattle SODA pages, 60s for the GSA CSV) and a body
cap (8 MB per SODA page; 12 MB for the GSA CSV, which is ~6.6 MB today). Content-Length is checked first,
then the stream is counted and cancelled once it passes the cap.

## Running

All three scripts dry-run by default and print counts by month. Add `--write` to upsert (needs
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`). Scheduling Norfolk daily on Zeus is a deploy step.

GovDeals/AllSurplus (maestro) fetches: search 30s timeout / 8 MB cap per page, detail 15s / 1 MB.

Ren #324 nits (follow-up, migration `20261010412000`):
- `sold_listings_attribution_nonblank`: `attribution IS NULL OR attribution ~ '[[:alnum:]]'` (btrim
  only strips spaces; `\S` let NBSP, ZWSP and BOM through). Its self-check compares attribution_len,
  attribution_nonblank, gov_attribution and last_bid_attribution to pg_get_constraintdef word for word.
- Gov-lane titles are built from year/make/model and scrubbed (`govTitle`, `scrubGovText`: VIN runs
  even when glued to other characters, plus the shared `scrubContact` for URLs, emails and phones).
  GovDeals/AllSurplus make/model are cleaned and capped at 40 chars at write time (`cleanGovName`).
  `/api/sold`'s gov query doesn't select `title` at all.
- `GovLane` renders a link only for a parsed http(s) URL (`safeHttpUrl`).
- sale_channel list: one source of truth in `lib/scoring/sale-channels.ts`, enforced by
  `sale-channels.test.ts` (latest migration's list == the constant; no later migration narrows an
  earlier one). 410000 is frozen with a gov-only list: never re-run it alone after a later definer
  (#320's 500000 adds 'ebay'); re-run that definer right after. 412000's self-check fails if 'ebay'
  is missing once 500000 is recorded.
