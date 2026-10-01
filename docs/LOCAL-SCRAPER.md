# Local Docker scraper

This setup uses the existing `Dockerfile.scraper`, source registry, deal normalization/scoring, and Redis-backed queue orchestrator. It runs only the scraper worker; it does not start the Next.js web app or maintenance worker. Local writes are scoped through `upsertDeals`; app/API persistence remains unchanged.

## Configure and build

From the repository root in PowerShell:

```powershell
Copy-Item .env.local.scraper.example .env.local.scraper
# Edit .env.local.scraper with the Supabase project URL and service-role key.
docker compose -f docker-compose.local.yml config
docker compose -f docker-compose.local.yml build scraper
```

The template starts with `CACHE_ONLY_MODE=true`. This stores normalized/scored listing payloads and hashes in `cache/local-scraper-cache.json` without writing to Supabase. Review the dashboard and logs, then set `CACHE_ONLY_MODE=false` to enable database writes.

## Start and monitor

```powershell
docker compose -f docker-compose.local.yml up -d
Start-Process http://localhost:8787
docker compose -f docker-compose.local.yml logs -f scraper
```

The dashboard polls the mounted status JSON and displays source progress, UTC daily insert/update usage, cache-only mode, and access barriers. Source concurrency is capped at three. Browser profiles persist per host with a stable fingerprint; local mode records a block and cools down that host instead of trying another proxy or fingerprint.

## Pause, resume, stop

Use the dashboard buttons or PowerShell:

```powershell
Invoke-RestMethod -Method Post http://localhost:8787/control/pause
Invoke-RestMethod -Method Post http://localhost:8787/control/resume
Invoke-RestMethod -Method Post http://localhost:8787/control/stop
```

Pause takes effect between queued sources and before the next write batch. Stop lets already active source calls finish, then exits. To stop all containers:

```powershell
docker compose -f docker-compose.local.yml down
```

Use `docker compose -f docker-compose.local.yml down -v` only when you intentionally want to remove Redis queue persistence. Cache, browser profiles, and logs are bind-mounted in the repository and are not removed by `down`.

## Local write guardian

The cache classifies candidate `(source, source_deal_id)` keys against `deals`, compares canonical SHA-256 hashes, and sends only new/changed rows in batches of up to 50 with a one-second delay between batches. Price history is written only if the ask price changed. The local runner pauses at 80% of either configured cap (defaults: 320 of 400 inserts or 480 of 600 updates) and resumes after the UTC day rolls over. `CACHE_ONLY_MODE` entries remain unsynced so a later write-enabled run can submit them.

The caps govern this local runner's `deals` writes only; they are not a project-wide Supabase quota and do not constrain app/API or other external writers. The runner skips registry-disabled or login-gated sources. Explicitly requested unavailable/gated sources fail fast with their IDs in the status error.
