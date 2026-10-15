# Retention: Vercel Free + Supabase Free + Zeus disk

## Hosted Rollout Gate (October 13)

The following tables describe intended retention behavior, not a certified
hosted rollout. The hosted protected inventory function is still absent and
#360 needs independent database review before apply. Both legacy deletion
jobs (`cleanup-expired-deals`, `cleanup-dead-deals`) were paused after inspection
found incomplete owner-reference protection. The market aggregation job stays
active. This change deleted no records, changed no grants, and did not stop
worker collection. Watch hosted growth while replacement cleanup is pending;
local F: headroom does not expand hosted storage or egress quotas.

Do not re-enable the legacy hard-delete jobs. Apply the independently reviewed
replacement, prove saved/watchlist/inventory/outcome/alert reference survival,
verify grants and cron targets, and test archive restoration first. The pause
is a temporary safety measure, not an archive or permanent retention guarantee.

Supabase holds thin URL / index rows only. Heavy artifacts live on Zeus (Docker volume `./cache`,
~1.8 TB free on F:). Vercel crons stay light (one RPC each).

## Supabase (500 MB)

| data                                 | rule                                                                                                                             | where                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `deals` active                       | demoted to `active=false` when unseen **30 days** (reversible on re-sight)                                                       | `scripts/scrape-ci.ts` `pruneStaleDeals()` on Zeus                          |
| ended auctions                       | up to **100** known-ended active lots deactivated hourly when the queue/hybrid worker is idle; expiry rechecked during the write | `LocalScraperCache.deactivateEndedAuctions()` via `scripts/scrape-local.ts` |
| `deals` inactive                     | deleted when unseen **90 days**, never if in watchlist / inventory / saved_cars / deal_outcomes / alert_matches                  | same                                                                        |
| daily write budget                   | ~1,250 inserts / 2,500 updates per day (≈60k rows / ~240 MB at steady state)                                                     | `lib/scrapers/local-cache.ts`                                               |
| photos                               | URL-only (`CACHE_PHOTOS_MAX=0`), no bytes in Supabase storage                                                                    | `Dockerfile.scraper`                                                        |
| sold comps                           | rows older than **180 days** are ignored by the sold median                                                                      | `SOLD_MEDIAN_WINDOW_DAYS` (#119)                                            |
| `deal_signals`                       | **90 days**, newest **2,000 per user**                                                                                           | `run_retention()`                                                           |
| `page_views`                         | **180 days**                                                                                                                     | `run_retention()`                                                           |
| `deal_views`                         | **90 days** (metering reads today only)                                                                                          | `run_retention()`                                                           |
| `scrape_jobs`                        | finished jobs after **14 days** (pending/running never)                                                                          | `run_retention()`                                                           |
| `vin_decodes`, `nhtsa_recalls_cache` | **30 days past `expires_at`** (decode TTL 180d, recalls 7d)                                                                      | `purge_expired_vin_cache()` (same cron, second RPC)                         |
| `scraper_runs`                       | **60 days** (health reads 7)                                                                                                     | `run_retention()`                                                           |

`run_retention()` (migration `20261006020000_run_retention.sql`) is called daily by the Vercel cron
`/api/cron/retention` (07:30 UTC, `Authorization: Bearer $CRON_SECRET`). Missing tables are skipped.

### Cron Completion Receipts

The route confirms telemetry cleanup first, then purges expired VIN and recall
caches with `p_batch=1000` and `p_max_batches=1` (at most 1,000 rows per cache
table per call). Each request has a 20-second client deadline. This does not
bound the existing telemetry SQL's row count or guarantee server-side cancellation.

Both steps must return valid, nonnegative integer counts for a successful
receipt. Missing configuration, RPC failures, deadlines, and malformed receipts
return HTTP 503 with `completion: "unconfirmed"`, the failed step, and only
earlier confirmed counts. A timeout or lost receipt is not evidence of rollback;
do not replay deletion blindly. Raw database errors are not returned or logged.
Responses are private and not cacheable. This route does not call protected
inventory cleanup or change the hosted rollout gate above.

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
