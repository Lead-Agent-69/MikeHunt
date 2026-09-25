# Redfin `gis-csv` — the open MLS door (verified 2026-06-30)

Redfin's internal map endpoint returns up to **350 listings per call as a clean CSV**, with **MLS-sourced
fields** — and it accepts a raw **lat/lng polygon**, so no region-id lookup, no autocomplete, no anti-bot.
A plain static `GET` returns HTTP 200. This is the same on-market data Zillow/Realtor resell, free.

## Endpoint

```
GET https://www.redfin.com/stingray/api/gis-csv
  ?al=1
  &num_homes=350
  &ord=redfin-recommended-asc
  &page_number=1
  &poly=<lng lat,lng lat,…>   ← closed ring SW→SE→NE→NW→SW; THE no-lookup key
  &sf=1,2,3,5,6,7
  &status=9                   ← active + coming-soon
  &uipt=1,2,3,4,5,6,7,8       ← all property types
  &v=8
  &sold_within_days=90        ← (optional) PAST SALE comps for valuation
```

Header: a normal desktop `User-Agent` is enough. `Accept: text/csv,*/*`.

## What blocks and what doesn't

| Path                                            | Result                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| `gis-csv` with `poly=` bbox                     | ✅ open, static, HTTP 200 — **use this**                                           |
| `gis-csv` with `region_id`+`region_type`        | ✅ works, but `region_id` is Redfin's INTERNAL id (not the ZIP) → needs a resolver |
| `/stingray/do/location-autocomplete` (resolver) | ❌ CloudFront 403 on bare fetch (needs the headed/FlareSolverr tier)               |
| Redfin listing HTML pages                       | ❌ PerimeterX-walled (why the old `redfin.ts` JSON-LD scrape rotted)               |

The bbox `poly` path sidesteps every wall — that's the unlock.

## CSV columns (header-keyed, resilient to reorder)

`SALE TYPE` (MLS Listing | PAST SALE), `SOLD DATE`, `PROPERTY TYPE`, `ADDRESS`, `CITY`,
`STATE OR PROVINCE`, `ZIP OR POSTAL CODE`, `PRICE`, `BEDS`, `BATHS`, `LOCATION`, `SQUARE FEET`,
`LOT SIZE`, `YEAR BUILT`, `DAYS ON MARKET`, `$/SQUARE FEET`, `HOA/MONTH`, `STATUS`,
`NEXT OPEN HOUSE START/END`, `URL`, `SOURCE` (listing brokerage), **`MLS#`**, `LATITUDE`, `LONGITUDE`.

Notes: Redfin prepends a disclaimer line (`"In accordance with local MLS rules…"`) before the header —
skip to the line containing `ADDRESS`. Longitudes are negative (US) — parse coords allowing negatives.

## Coverage by tiling

Each call is capped at 350 rows. We seed **~67 metros (every state + DC, nationwide)** (centroid + radius →
bbox) and **quad-subdivide** any box that hits the cap, so dense metros are fully covered. Verified: one
small Atlanta box (4-mi radius) returned **2,553 active listings, 100% with MLS#, price, beds/baths/sqft,
lat/lng, brokerage**; Miami a 3-mi box → 2,997.

**Budget + rotation (so it's safe AND complete):** each run is wall-clock-budgeted (`REDFIN_TIME_BUDGET_MS`,
default 240s — under the 300s harvest route limit) and starts at a rotating metro (by clock), so any single
run is bounded but successive runs cycle through the whole country (upsert dedupes across runs). The
always-on worker can raise the budget to sweep everything in one pass. `REDFIN_MAX_AREAS` caps metros/run.

Note on throttling: heavy single-IP probing can soft-throttle gis-csv (a box returns 0). The connector
degrades to `[]` gracefully; the fleet's IP spread + per-box/per-metro pacing keep it clean.

Implemented in `lib/housing/sources/redfin-gis.ts` (`harvestRedfinGis` for-sale, `harvestRedfinSold` comps).
Config: `REDFIN_AREAS="Name|lat|lng|radiusMiles,…"` (built-in nationwide seed runs by default).

## Enrichment + valuation (built on top)

- **ZIP-level ARV comps** (`redfin-zip-ppsf.ts`, `npm run data:zip-ppsf`) — streams Redfin Data Center's
  `zip_code_market_tracker` → `data/zip-ppsf.json` (24,530 ZIPs). `arv-psf.ts` now resolves ZIP → county →
  state; ZIP-level median is comp-grade (high confidence) in the deal-analyzer.
- **Per-listing enrichment** (`redfin-enrich.ts`) — the gis-csv CSV has no remarks, so a fleet pass fetches
  the listing page (headed tier clears PerimeterX) and pulls **marketing remarks** (the distress-signal
  goldmine — "as-is", "investor special", "needs TLC", "cash only"), the listing agent, and full-size
  photos. Verified live: remarks/agent/12 photos extract from `data-rf-test-id="listingRemarks"`,
  `listingAgentAndBrokerLogo">Presented by`, and `ssl.cdn-redfin.com/photo/…/bigphoto/….jpg`. INTELLIGENT
  gating: only Redfin leads missing a description, hottest-first, capped at `REDFIN_ENRICH_MAX` (40).
  Opt-in via `REDFIN_ENRICH=1` in the harvest (off → leads pass through untouched).

## Related doors

- **RESO Web API** (`lib/housing/sources/reso.ts`) — the _licensed_ feed; same data, fully legit, dormant
  until a member supplies credentials. The two are complementary: gis-csv for free nationwide coverage now,
  RESO for clean licensed data when available.
- **Realtor.com `hulk` GraphQL** (`https://www.realtor.com/api/v1/hulk?client_id=rdc-x&schema=vesta`) —
  returns MLS# + listing office, but POST is 403 without browser-session cookies. Next door to build:
  warm a Realtor page via the headed/FlareSolverr tier, then in-page `fetch` the GraphQL with those cookies.
