# Scraper Orchestration Architecture Plan

## 1. Current State (Built in This Session)

### 1.1 Orchestrators

All orchestrators extend `BaseScraperOrchestrator` and share common behavior: logging, progress tracking, Supabase persistence, dry-run mode, and abort support.

| Orchestrator             | Purpose                            | Concurrency | Persistence | Best For                                        |
| ------------------------ | ---------------------------------- | ----------- | ----------- | ----------------------------------------------- |
| `SequentialOrchestrator` | One source at a time               | 1           | DB only     | Debugging, rate-sensitive sources               |
| `ConcurrentOrchestrator` | Parallel source execution          | N           | DB only     | Daily refresh, default mode                     |
| `PriorityOrchestrator`   | Tiered execution (high/medium/low) | N per tier  | DB only     | Auctions first, marketplaces later              |
| `QueueOrchestrator`      | Redis-backed job queue             | N workers   | DB + Redis  | Distributed workers, retries, multi-pod scaling |
| `RealtimeOrchestrator`   | Continuous frequency-based loop    | N           | DB only     | Always-on scraping service                      |

### 1.2 Reusable Tools

| Tool                 | Responsibility                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `ScraperRegistry`    | Register sources, enable/disable, track metadata, stats, last-run times, priority, frequency |
| `ScraperExecutor`    | Execute a single scraper with retry, timeout, dry-run, abort, and normalized results         |
| `ProxyManager`       | Proxy rotation, health tracking, cooldown, ban management, geo/type filtering                |
| `BrowserPoolManager` | Pre-warmed Playwright browser/context pool, stealth injection, page lifecycle                |
| `QualityController`  | Data validation, duplicate detection, quality scoring, recommendations                       |
| `Pipeline`           | Persist validated listings to Supabase, manage price history                                 |

### 1.3 Existing Sources Connected

- `copart` → `scrapeCopart()`
- `craigslist` → `scrapeCraigslist()`
- `independent_dealer` → batch dealer profiles
- `auto_discover` → `autoDiscoverAndCrawl()`
- `facebook_marketplace`, `adesa` → registered but disabled (stubs)

### 1.4 API Endpoints

- `POST /api/scrape/run` — trigger any orchestrator with source filter, concurrency, dry-run
- `GET /api/scrape/health` — source status, last run, success rate, due sources
- `GET /api/scrape/queue` — inspect queue and jobs
- `POST /api/scrape/queue` — enqueue jobs
- `DELETE /api/scrape/queue` — clear queue
- `PATCH /api/scrape/queue?action=retry|clear-dlq|deadletter` — manage DLQ

### 1.5 Worker & Scheduler

- `lib/scrapers/worker.ts` — long-lived queue worker CLI and programmatic API
- `lib/scrapers/scheduler.ts` — determines which sources are due and runs the right orchestrator

---

## 2. Foundational Layer (Covered)

### 2.1 Base Orchestrator (`BaseScraperOrchestrator`)

- Abstract `run()` and `stop()` methods
- Supabase logging for `scraper_runs`
- Progress emission with `{ total, completed, failed, percentage, currentSource }`
- Per-source result callbacks
- Dry-run mode for safe testing
- AbortController integration
- Options pass-through for Supabase credentials

### 2.2 Registry

- Source registration with metadata:
  - `id`, `name`, `type`, `priority`, `frequencyMinutes`
  - `requiresAuth`, `stealthRequired`, `enabled`
  - `fn: ScraperFunction`, `estimatedListingsPerRun`
- Enable/disable filtering
- Sorting by priority
- `getDueForRun()` based on last-run time
- Stats tracking: success/failure rate, avg duration, total listings

### 2.3 Executor

- `execute(scraper, options)` with:
  - Configurable timeout
  - Configurable retries
  - Abort signal support
  - Dry-run interception
  - Normalized `ExecutorResult`

### 2.4 Proxy & Browser Infrastructure

- Proxy rotation from environment variables or explicit config
- Health-based proxy selection
- Browser pool with multiple browsers/contexts/pages
- Stealth injection via `addInitScript`
- Isolated page option for high-risk sites

---

## 3. Integration Layer (Covered)

### 3.1 Runner.ts

- `createScraperRegistry()` — wires all known sources
- `runScrapers(options)` — selects orchestrator and runs
- `DailyRefreshManager` — backward-compatible wrapper using `ConcurrentOrchestrator`
- Quick helpers: `runSequential`, `runConcurrent`, `runPriority`, `runQueue`, `runRealtime`
- Re-exports all orchestrators and tools

### 3.2 API Endpoint

- `POST /api/scrape/run` accepts:
  - `orchestrator`: sequential | concurrent | priority | queue | realtime
  - `sourceIds`: optional filter
  - `concurrency`: worker count
  - `dryRun`: boolean
- Returns summary with total, successful, failed, total listings, total duration, per-source results

---

## 4. Gaps Still to Cover

### 4.1 More Real Sources

- ✅ eBay Motors, IAA, ACV Auctions, ADESA, Manheim, CarParts.com, Facebook Marketplace scrapers implemented and registered
- Independent dealer sites (DealerSocket, vAuto, Frazer, AutoRevo, etc.) still to add

### 4.2 Scheduling & Triggers ✅

- `ScraperScheduler` class with source-specific frequency enforcement
- CLI entry point for long-running scheduler
- ✅ Vercel cron job configured at `/api/orchestrator/run?secret=CRON_SECRET` using `ScraperScheduler.runOnce()`

### 4.2.1 Testing ✅

- ✅ Vitest + jsdom configured
- ✅ Registry tests: stats, auto-disable, reset, sort
- ✅ Executor tests: success, retry, abort, dry-run
- ✅ Concurrent orchestrator tests: multi-source, failure handling, progress

### 4.3 Distributed Worker (Queue) ✅

- `startScraperWorker()` entry point
- CLI with `--concurrency`, `--redis-url`, `--queue-name`, `--max-runtime-minutes`
- Job-level retry policy with exponential backoff
- Dead-letter queue (DLQ) for repeatedly failing sources
- DLQ retry/clear/inspect methods

### 4.4 Auth & State Management ✅

- ✅ `ScraperCredentialManager` with encrypted credential storage
- ✅ `/api/scrape/credentials` CRUD endpoint
- ✅ `ScraperStateManager` for persisted registry state
- ✅ Auto-disable state persists across restarts

### 4.5 Data Quality & Alerting ✅

- ✅ Per-source quality thresholds via `autoDisableThreshold`
- ✅ Auto-disable sources that fail N consecutive runs
- ✅ `ScraperAlertService` for price-drop emails
- ✅ `alert_log` table with price-drop trigger
- ✅ VIN-based duplicate detection function and columns
- ✅ `upsertListings` records price history and marks duplicates

### 4.6 Cost Control & Resilience ✅

- ✅ `CostGuard` with max duration, max listings, and page budgets
- ✅ All orchestrators share one `CostGuard` per run
- ✅ `CircuitBreakerRegistry` per-source fast fail-fast
- ✅ `ProxyManager` with free public proxy tier (`FreeProxyProvider`)
- ✅ `AuthSessionManager` reuses cookies/session to avoid repeated logins
- ✅ `AdaptiveEngine` — static fetch first, browser only on block, per-host mode cache, in-memory static response cache
- ✅ `ProfileManager` — consistent browser identity per source
- ✅ `HumanBehavior` — realistic mouse, scroll, typing, and wait patterns
- ✅ `BrowserPoolManager` — lazy, source-aware context reuse with idle cleanup and stealth injection

### 4.7 Customer Edge ✅

- ✅ `DealScoringService` — rule-based profit/ROI/arbitrage scoring (no AI cost)
- ✅ `upsertListings` auto-scores every listing
- ✅ `/api/deals` returns real scored listings instead of mocks
- ✅ Price-drop alerts and watchlist integration
- ✅ `QualityController` filters invalid/duplicate listings before persistence
- ✅ `ListingNormalizer` — VIN, title, location, price/mileage normalization + make/model/year extraction
- ✅ `ScraperCredentialManager` — AES-256-GCM encryption with mandatory 32-byte key

### 4.5 Observability ✅

- Structured logging to Supabase
- `/api/scrape/health` dashboard endpoint
- Metrics: listings/min, success rate, due sources
- Proxy health and browser pool stats available

### 4.6 Configuration Management

- Source configs from database instead of code
- Runtime enable/disable without deploy
- Per-source proxy/browser configuration

### 4.7 Legal / Anti-Bot Resilience

- robots.txt checking
- Rate-limit compliance
- CAPTCHA detection and handling
- Human-like behavior patterns

### 4.8 Testing

- Unit tests for registry, executor, quality controller
- Integration tests for orchestrators
- Dry-run tests that hit real sites without persisting

---

## 5. Recommended Next Steps

1. **Add more real scrapers** to the registry, reusing the existing `paginate`, `fetchHtml`, and `fetchBrowser` helpers.
2. **Add robust tests** with a test runner that runs orchestrators in dry-run mode.
3. **Move source configs** to the database for dynamic source management.
4. **Add auto-disable logic** for sources that fail repeatedly.
5. **Add price-drop alerting** wired to the existing `price_history` table.
6. **Configure Vercel cron jobs** to call `/api/scrape/run` or `/api/scrape/queue` on schedule.

---

## 6. Deployment Thoughts

- Use `ConcurrentOrchestrator` for quick Vercel cron jobs (max 5–10 minutes).
- Use `QueueOrchestrator` for heavy scraping workloads running on a worker container.
- Use `RealtimeOrchestrator` for a dedicated scraping service.
- Keep `SequentialOrchestrator` for local debugging and onboarding new sources.
- Use `PriorityOrchestrator` for tiered SLA enforcement (auctions > marketplaces > dealers).

---

## 7. Conclusion

The orchestration layer is now solid and modular:

- 5 orchestrators cover the main execution models.
- 6 reusable tools cover registry, execution, proxies, browsers, and quality.
- Existing sources are wired in via `runner.ts`.
- API endpoint and usage examples are in place.
- TypeScript compiles cleanly for all scraper/data files.

The next logical phase is to add more real source implementations and productionize the queue worker + scheduler.
