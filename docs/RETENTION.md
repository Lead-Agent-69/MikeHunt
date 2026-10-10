# Retention: Vercel Free + Supabase Free + Zeus disk

Supabase holds thin URL / index rows only. Heavy artifacts live on Zeus (Docker volume `./cache`,
~1.8 TB free on F:). Vercel crons stay light (one RPC each).

## Supabase (500 MB)

| data               | rule                                                                                                                             | where                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `deals` active     | demoted to `active=false` when unseen **30 days** (reversible on re-sight)                                                       | `scripts/scrape-ci.ts` `pruneStaleDeals()` on Zeus                          |
| ended auctions     | up to **100** known-ended active lots deactivated hourly when the queue/hybrid worker is idle; expiry rechecked during the write | `LocalScraperCache.deactivateEndedAuctions()` via `scripts/scrape-local.ts` |
| `deals` inactive   | deleted when unseen **90 days**, never if in watchlist / inventory / saved_cars / deal_outcomes / alert_matches                  | same                                                                        |
| daily write budget | ~1,250 inserts / 2,500 updates per day (≈60k rows / ~240 MB at steady state)                                                     | `lib/scrapers/local-cache.ts`                                               |
| photos             | URL-only (`CACHE_PHOTOS_MAX=0`), no bytes in Supabase storage                                                                    | `Dockerfile.scraper`                                                        |
| sold comps         | rows older than **180 days** are ignored by the sold median                                                                      | `SOLD_MEDIAN_WINDOW_DAYS` (#119)                                            |
| `deal_signals`     | **90 days**, newest **2,000 per user**                                                                                           | `run_retention()`                                                           |
| `page_views`       | **180 days**                                                                                                                     | `run_retention()`                                                           |
| `deal_views`       | **90 days** (metering reads today only)                                                                                          | `run_retention()`                                                           |
| `scrape_jobs`      | finished jobs after **14 days** (pending/running never)                                                                          | `run_retention()`                                                           |
| `scraper_runs`     | **60 days** (health reads 7)                                                                                                     | `run_retention()`                                                           |

`run_retention()` (migration `20261006020000_run_retention.sql`) is called daily by the Vercel cron
`/api/cron/retention` (07:30 UTC, `Authorization: Bearer $CRON_SECRET`). Missing tables are skipped.

Auction expiry uses the worker's existing serialized daily update budget and 80% pause threshold. It does not delete deals, touch saved records, or rewrite their last-seen timestamp. Cache-only and paused workers do not write. Failed passes retry after five minutes; successful passes wait an hour. A missing end time is not proof of expiry. Ingestion marks known-ended lots inactive, excludes them from new-match notifications, and can restore rescheduled lots with a future closing time. Age-based hard deletion remains exclusive to the separate `scrape-ci` path above.

## Zeus disk (`./cache` → `/app/cache` in the scraper)

`janitor` service in `docker-compose.yml` and `docker-compose.local.yml` (the Zeus stack) runs `scripts/zeus-janitor.sh --loop` daily:

| path                                   | kept    |
| -------------------------------------- | ------- |
| `cache/arsenal/*.json` (probe reports) | 30 days |
| `cache/html/**`                        | 14 days |
| `cache/photos/**`                      | 30 days |
| `cache/logs/**`                        | 30 days |
| `cache/*.tmp`                          | 1 day   |

The scraper's own state files (`local-scraper-cache.json`, `sweep-state.json`, `source-health.json`,
`state-rotation.json`) are never touched. Start it on Zeus: `docker compose -f docker-compose.local.yml up -d janitor`.

Vercel Hobby allows up to 100 daily cron jobs per project (changelog 2026-01-20; the old 2-per-team cap is gone), so this third daily cron fits.
