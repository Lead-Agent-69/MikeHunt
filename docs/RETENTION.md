# Retention: Vercel Free + Supabase Free + Zeus disk

Supabase holds searchable listing metadata, valuations, embeddings, account data and saved snapshots.
Photos normally remain source URLs, not stored image bytes. Zeus holds scraper fingerprints,
unsynced records, optional raw-page caches, logs and browser profiles. It is not yet a full durable
archive of every listing or photo. Vercel is the web/API layer, not an archive disk.

Read-only check on 2026-10-11: the running scraper mounts `F:\MikeHunt\main\cache`, `logs`, and
`profiles`. That F: drive is approximately 2 TB with 1.78 TB free, not the proposed 1 TB Docker
disk. Docker's internal virtual disk and Redis named volume are separate; their backing-disk
location is not proven by these bind mounts. Cache: 33 MB; logs: 7.2 MB; profiles: 241 MB.
Run `node scripts/storage-audit.mjs` to repeat this non-destructive check.

Docker engine audit: images 55.36 GB, build cache 17.34 GB, named volumes 259.6 MB, container
layers 172.2 MB. These are separate from the bind-mounted F: folders. No prune performed.
Redis uses 1.22 MB at inspection but has no live maximum. The local compose update caps it at
256 MB with `noeviction` and a 512 MB container limit: no silent eviction of queued jobs; at the
limit producers receive errors/backpressure. This does not archive or expire completed Redis jobs.

## Supabase (500 MB)

| data                                 | rule                                                                                                                               | where                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `deals` active                       | demoted to `active=false` when unseen **30 days** (reversible on re-sight)                                                         | `scripts/scrape-ci.ts` `pruneStaleDeals()` on Zeus                          |
| ended auctions                       | up to **100** known-ended active lots deactivated hourly when the queue/hybrid worker is idle; expiry rechecked during the write   | `LocalScraperCache.deactivateEndedAuctions()` via `scripts/scrape-local.ts` |
| `deals` inactive                     | protected retention: unseen **90 days**, bounded 1,000 per call, never when saved/watched/purchased/outcome/alert-match referenced | `prune_inventory_retention`, after reviewed migration apply                 |
| daily write budget                   | configured 1,250 inserts / 2,500 updates; pause at 80%. A write budget is NOT a database-size limit                                | `lib/scrapers/local-cache.ts`                                               |
| photos                               | URL-only (`CACHE_PHOTOS_MAX=0`), no bytes in Supabase storage                                                                      | `Dockerfile.scraper`                                                        |
| sold comps                           | rows older than **180 days** are ignored by the sold median                                                                        | `SOLD_MEDIAN_WINDOW_DAYS` (#119)                                            |
| `deal_signals`                       | **90 days**, newest **2,000 per user**                                                                                             | `run_retention()`                                                           |
| `page_views`                         | **180 days**                                                                                                                       | `run_retention()`                                                           |
| `deal_views`                         | **90 days** (metering reads today only)                                                                                            | `run_retention()`                                                           |
| `scrape_jobs`                        | finished jobs after **14 days** (pending/running never)                                                                            | `run_retention()`                                                           |
| `vin_decodes`, `nhtsa_recalls_cache` | **30 days past `expires_at`** (decode TTL 180d, recalls 7d)                                                                        | `purge_expired_vin_cache()` (same cron, second RPC)                         |
| `scraper_runs`                       | **60 days** (health reads 7)                                                                                                       | `run_retention()`                                                           |

`run_retention()` is called daily by the existing Vercel cron (07:30 UTC, cron-secret protected).
The protected inventory migration `20261011142210_protected_inventory_retention.sql` adds a
service-only INVOKER RPC and a BEFORE DELETE guard; removes both conflicting legacy cleanup jobs;
and reuses `cleanup-expired-deals` for bounded protected retention plus existing URL/VIN cache
cleanup. `scrape-ci` uses the same RPC instead of a truncated client-side saved-reference scan.
The web cron reports 503 if this protected RPC is missing, rather than silently falling back to
unsafe deletes. Apply the reviewed migration BEFORE deploying this route.

**Deployment status:** regression-tested locally in BEGIN/ROLLBACK. No hosted apply performed.
Local inspection found an unguarded `cleanup-dead-deals` job; production job state is unverified
because the connected Supabase inspection permission was denied. Retention is not production-safe
merely because this document or migration exists. Require Ren review, hosted apply, and cron proof.

Saved snapshots, notes, purchases and outcomes have **no age-based deletion** in this policy.
Users may remove their own records; account deletion is a separate policy. Source-hosted images
can disappear independently. Permanent photo preservation needs a permission-approved archive,
authenticated delivery, backups and restore tests; URL-only saves cannot guarantee it.

The Zeus local worker also checks the service-only `inventory_storage_bytes()` RPC before new
inserts: warn at 350 MB, buffer new observations locally at 450 MB, fail closed when measurement
is unavailable. Existing updates/touches continue. This is not a quota guarantee for all database
writers or network egress. Buffered records retain the latest observation; they are not a complete
price/event archive and require renewed capture/replay after capacity becomes available.

Auction expiry uses the worker's existing serialized daily update budget and 80% pause threshold. It does not delete deals, touch saved records, or rewrite their last-seen timestamp. Cache-only and paused workers do not write. Failed passes retry after five minutes; successful passes wait an hour. A missing end time is not proof of expiry. Ingestion marks known-ended lots inactive, excludes them from new-match notifications, and can restore rescheduled lots with a future closing time. Age-based hard deletion remains exclusive to the separate `scrape-ci` path above.

## Zeus disk (`./cache` → `/app/cache` in the scraper)

`janitor` service in `docker-compose.yml` and `docker-compose.local.yml` (the Zeus stack) runs `scripts/zeus-janitor.sh --loop` daily:

| path                                   | kept                                     |
| -------------------------------------- | ---------------------------------------- |
| `cache/arsenal/*.json` (probe reports) | 30 days                                  |
| `cache/html/**`                        | 14 days                                  |
| `cache/polite/*.json`                  | 14 days                                  |
| `cache/photos/**`                      | 30 days                                  |
| `cache/logs/**`                        | 30 days                                  |
| `cache/*.tmp`                          | 1 day                                    |
| mounted `logs/*.log.*`                 | 30 days; active log and status untouched |

The janitor never deletes scraper state or browser profiles. The worker itself compacts synced
fingerprints after 180 days and preview results after one day. Unsynced inventory and sold evidence
are retained, even if old, because they are not disposable. Worker file logs rotate at 10 MiB with
three backups; local-stack Docker logs use 10 MB with three files per service. These changes require
the operator's scraper/stack rollout; the inspected running Docker log config is still unlimited.

Do not run blanket `docker system prune`, delete the local cache, or clear profiles to save space:
that can lose queued records, quota state or sessions. Capacity growth must pause non-essential
capture or trigger operator action, never silently erase saved user data.

Vercel Hobby allows up to 100 daily cron jobs per project (changelog 2026-01-20; the old 2-per-team cap is gone), so this third daily cron fits.
