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

Current-main worker rollout on October 13 uses image
`mikehunt-scraper-release:c6c63d5`, with original cache/profile/log mounts and
persisted quotas. Hosted read-only inspection reports 109,563,027 database bytes;
protected prune and storage-measurement RPCs are still absent. Source URL storage
is not a durable photo archive, and daily writes do not certify monthly capacity.

## Supabase (500 MB)

| data                                 | rule                                                                                                                               | where                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `deals` active                       | demoted to `active=false` when unseen **30 days** (reversible on re-sight)                                                         | reviewed database cron, after approved migration apply                      |
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
and reuses `cleanup-expired-deals` as the sole routine listing-retention executor. It sets
`statement_timeout=15s` and `lock_timeout=2s` BEFORE the cleanup SELECT. The function bounds each
demotion, unreferenced-listing deletion and expired URL-cache batch to the requested limit (default
1,000, maximum 2,000). URL-cache rows use ordered `FOR UPDATE SKIP LOCKED` and return a separate
`url_cache_deleted` count; there is no unbounded raw DELETE after the function.

Scraper cycles no longer delete listings, directly or through PostgREST. The Vercel cron handles
only telemetry and regenerable VIN/recall caches; #421 separately improves its receipts. It does
not depend on this listing-retention function. The worker size guard does depend on the reviewed
storage-meter function: apply the approved migration before deploying that worker candidate.

The inventory function no longer pretends that function-level `SET statement_timeout` arms an
outer-query deadline. It rejects zero or greater-than-15-second timeout configuration before any
mutation. This check is defense in depth, NOT proof of an armed timer. Service-only operator calls
must establish their bounded session/transaction timeout BEFORE the outer statement; do not call
through a wrapper that changes the setting mid-statement. Direct PostgREST mutation callers are
not part of the routine execution path. Do not broadly change service-role defaults to satisfy a
check. Verify the actual scheduled command, role, cancellation and rollback before hosted rollout.

**Deployment status:** no hosted apply performed. The October 12 observation of active legacy
jobs predates their October 13 safety pause documented above. Require revised exact-head
independent database review, approved targeted apply, and cron/Saved-persistence proof before
deploying dependent worker code. Historical database sizes are not current capacity receipts.

Run `node scripts/test-protected-retention.mjs` against the existing local Supabase Docker stack.
It rejects remote Docker endpoints/target arguments, verifies the MikeHunt container label, tests
the actual schema inside BEGIN/ROLLBACK, then creates and removes a uniquely named disposable
database for real two-session locking tests. A committed save survives both the bounded RPC and
a direct deletion race. When pruning wins, a late save fails its FK rather than reporting success.
The scheduler fixture records commands; no daemon runs its jobs. The test executes the actual
recorded multi-command job through one psql `-c` request with a shortened deadline, proving that
timeout during deletion rolls back an earlier demotion. It also rejects unbounded configuration
before mutation and checks a 1,205-row expired cache backlog stays batched while fresh rows survive.
This is not a hosted-apply receipt, proof of arbitrary isolation levels or production-load certification.

The replacement job no longer age-purges `vin_price_history`. Those observations can support saved
research and are not disposable cache entries. Owner-aware history archival/retention needs its
own reviewed policy; measure this table's growth rather than silently erase historical evidence.

Saved snapshots, notes, purchases and outcomes have **no age-based deletion** in this policy.
Users may remove their own records; account deletion is a separate policy. Source-hosted images
can disappear independently. Permanent photo preservation needs a permission-approved archive,
authenticated delivery, backups and restore tests; URL-only saves cannot guarantee it.

The Zeus local worker also checks the service-only `inventory_storage_bytes()` RPC before new
inserts: warn at 350 MB, buffer new observations locally at 450 MB, fail closed when measurement
is unavailable. Measurement has a five-second client deadline and an explicit race so even a
transport ignoring abort cannot indefinitely hold the serialized writer. A timeout fails closed,
retains buffered observations and can recover on the next scheduled measurement. It is not proof
of database-side cancellation. Existing updates/touches continue. This is not a quota guarantee for all database
writers or network egress. Changed/new observations are atomically written to local cache before
remote classification or upsert. Pauses, exhausted update budgets, read/write failures and
missing/invalid size measurements do not discard the newest payload or reset confirmed daily
counters. Buffered records retain the latest observation; they are not a complete price/event
archive and require renewed capture/replay after capacity becomes available. Ambiguous remote
commit receipts are not a global quota guarantee.

Auction expiry uses the worker's existing serialized daily update budget and 80% pause threshold. It does not delete deals, touch saved records, or rewrite their last-seen timestamp. Cache-only and paused workers do not write. Failed passes retry after five minutes; successful passes wait an hour. A missing end time is not proof of expiry. Ingestion marks known-ended lots inactive, excludes them from new-match notifications, and can restore rescheduled lots with a future closing time. Age-based hard deletion belongs only to the reviewed database scheduler described above.

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
