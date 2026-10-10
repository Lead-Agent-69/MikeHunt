# Zeus deploy checklist (scraper code landing 2026-10-10)

Jonah deploys Zeus himself. Agents do **not** SSH in, recreate containers or edit env on Zeus. This page
lists everything the open/merged scraper PRs need on the Zeus Docker stack (`docker-compose.local.yml`,
service `scraper`) once they are merged to `main`. Nothing here applies to Vercel unless it says so.

## 0. Order of operations
1. Merge the PRs (sections 2–3) to `main`.
2. On Zeus: `git pull` in the MikeHunt checkout.
3. Add or adjust env in `.env.local.scraper` (section 1). Never paste secrets into the compose file or a
   shell argument; edit the env file.
4. Stamp the image with the commit, then rebuild and restart only the scraper:
   `sh scripts/write-scraper-version.sh && docker compose -f docker-compose.local.yml up -d --build scraper`
   (writes `.scraper-version.json`, git-ignored, so every `scraper_runs` row and /status show the live
   git SHA and build time; skip it and /status shows the version as unknown)
   (the image bakes the code: `Dockerfile.scraper` copies the repo; a restart without `--build` runs old code).
5. Check `http://127.0.0.1:8787` (status port) and `/status` on the app for the new per-domain ban-risk
   and polite counters (section 4).

## 1. Environment (`.env.local.scraper` on Zeus)

| Variable | Needed? | Value / default | Why |
|---|---|---|---|
| `GSA_API_KEY` | **Yes** for GSA at full rate | Jonah's api.data.gov key (already given; not in git) | GSA Auctions adapter. Without it, it falls back to `DEMO_KEY` (throttled, low hourly cap). Set it on Vercel production too if the app reads GSA. |
| `SCRAPER_POLITE_MODE` | No (default **on**) | unset = on. `0`/`off`/`false`/`no` = legacy | Polite mode becomes the default for every scraper (robots.txt + Crawl-delay, randomized per-domain gaps, honest UA, Retry-After/backoff, ban-risk breaker). Only set `0` to roll back. |
| `POLITE_CACHE_DIR` | **Recommended** | `/app/cache/polite` | Persists the ETag/Last-Modified cache and robots.txt across restarts so unchanged pages are not refetched. Lives on the existing `./cache` volume. |
| `POLITE_MIN_GAP_MS` | Optional | default in `lib/scrapers/polite/limiter.ts` | Base gap between requests to one domain. Crawl-delay raises it per domain. |
| `POLITE_JITTER_RATIO` | Optional | `1` (each gap is base to 2× base) | Random spread on every per-domain gap. 0–3. |
| `POLITE_DOMAIN_CONCURRENCY` | Optional | 1 (max 2) | In-flight requests per domain. Different domains still run in parallel. |
| `POLITE_BREAKER_PAUSE_HOURS` | Optional | default in `breaker.ts` | How long a domain pauses after repeated 403/429 or a challenge page. |
| `POLITE_ALLOW_RENDER` | Optional | unset | Lets the polite path use a headless render for JS-only pages that robots allows. Leave unset unless a source needs it. |
| `SCRAPE_OFF_PEAK_ONLY` / `OFF_PEAK_TZ` / `OFF_PEAK_START_HOUR` / `OFF_PEAK_END_HOUR` | Optional | off | Restrict sweeps to off-peak hours. |
| `NEXT_PUBLIC_APP_URL` | Already set | `https://mikehunt-69.vercel.app` | Used for the contact URL in the honest MikeHunt User-Agent. |
| `CL_USE_FREE_PROXY` | Leave unset | — | Legacy-only. Ignored while polite mode is on (no proxy use in polite mode). |

Reliability & operations PR (job failure log, SLA view, breaker, dead letters, incremental scans,
version tracking) adds these, all optional with safe defaults:

| Variable | Needed? | Value / default | Why |
|---|---|---|---|
| `SCRAPER_BREAKER_THRESHOLD` | Optional | `5` | Consecutive failed runs before a source is paused (temporary; never disabled or removed). |
| `SCRAPER_BREAKER_COOLDOWN_MIN` | Optional | `60` | First pause length; doubles for each further failed run. |
| `SCRAPER_BREAKER_MAX_COOLDOWN_HOURS` | Optional | `24` | Cap on the pause. After it the source is retried automatically. |
| `SCRAPER_INCREMENTAL_SOURCES` | Optional | unset (every source full scan, as before) | `a,b` or `all`: those sources skip unchanged pages (304 / same content hash) between full rescans. Needs `POLITE_CACHE_DIR` to persist. |
| `SCRAPER_FULL_RESCAN_HOURS` | Optional | `24` | Full rescan interval for incremental sources (keeps `last_seen_at` moving). |
| `SCRAPER_GIT_SHA` / `SCRAPER_BUILT_AT` | Optional | unset | Override the version stamp (otherwise `.scraper-version.json`, then `.git`). |
| `SENTRY_DSN` | Optional | unset | When set, breaker open/close alerts also go to Sentry. The `scraper_alerts` row is written either way. |

Per-source overrides live in the registry (`lib/scrapers/sources-registry.ts`, `polite: { minGapMs,
jitterRatio, maxConcurrent, breakerPauseHours, challengeBackoffMin, breakerThreshold, breakerCooldownMin,
incremental, fullRescanHours }`) and ship with the image; no env needed. Registry `rateLimit` (Copart/IAA
2 per 60s) is now a per-domain minimum gap.

Supabase: migration `20261010200000_scraper_reliability.sql` (Ren applies it; service-role only, no anon
grants), then `20261010205000_scraper_reliability_hardening.sql` (Ren's follow-up: revokes the identity sequences from anon/authenticated and self-checks grants, RLS, 0 policies, security_invoker and run_retention; it aborts if any check fails). The scraper and /status work before either is applied (they fall back to the old columns and skip
the new tables), so deploy order is free. After it is applied there is nothing to do on Zeus.

## 2. What changes behavior on Zeus

| PR | Change on Zeus | Action |
|---|---|---|
| #257 (merged) polite crawler toolkit + /status ban-risk | Toolkit present; opt-in in that PR | Rebuild image |
| #269 polite mode by default | **Every** scraper goes through robots + jitter + honest UA by default | Rebuild; set `POLITE_CACHE_DIR`; watch /status skip and 403/429 rates for a day |
| #270 shared dealer-CMS parser (Damage.com, D&G pagination, AutoVada, St. James, Riverbend, Premier, Gary's) | More salvage rows from curated yards | Rebuild |
| #272 platform dealers (4cdg + VehiclesNETWORK) + new verified sites | New curated dealers join their state's demand ring automatically (#247) | Rebuild |
| #271 GSA official API adapter (cars and trucks only) | GSA lots via api.gsa.gov | Rebuild + `GSA_API_KEY` |
| reliability & operations (this PR) | Every run row gets `outcome`, `error_counts`, `git_sha`; failed records go to `scraper_dead_letters`; 5 failed runs in a row pause a source for 1h, 2h, 4h… (max 24h) then retry | `sh scripts/write-scraper-version.sh` before the rebuild; Ren applies the migration |
| #269 Ren nits (Crawl-delay on exempt hosts, registry rate limits, source+path exemptions, photo-cache gate) | Grandfathered sources now read robots.txt for Crawl-delay only (disallow still not applied); Copart/IAA paced 30s apart; ebay-sold's exemption no longer covers ebay_motors | Rebuild |
| #247 (merged) per-state curated demand ring | A user's home/saved-search state kicks that state's dealers first | Rebuild |
| source-gathering PRs (open-gov feed registry, link-only multi-site sources) | Catalog only; nothing new is fetched until each parser lands | None |

### Expected side effects of polite-by-default (be ready for these)
- Sources whose robots.txt disallows the paths we used, or that serve bot challenges (CarGurus,
  Facebook Marketplace, other Cloudflare/DataDome sites), will be **skipped** rather than forced.
  They stay registered and scheduled; /status shows them as robots/breaker skips. No source is removed.
- FlareSolverr and the proxy settings are no longer used on the polite path. The `flaresolverr`
  container can keep running (harmless) and is still used if `SCRAPER_POLITE_MODE=0`.
- Fewer requests per sweep (cache hits / 304s), so sweeps finish later per domain but cost less.

## 3. Rollback
- One switch: set `SCRAPER_POLITE_MODE=0` in `.env.local.scraper`, then
  `docker compose -f docker-compose.local.yml up -d scraper` (no rebuild needed for env-only changes).
- Code rollback: check out the previous `main` commit and rebuild the `scraper` service.

## 4. Verify after deploy
- `/status` → **Source health SLA**: one row per source (status, last success, rows in the last run,
  fresh %, fails in a row, challenged/blocked) and the scraper version (short SHA + build time) in the
  panel header. The SHA should match `git rev-parse --short HEAD` on Zeus.
- Dead letters: `npx tsx scripts/replay-dead-letters.ts --list` (review), `--replay [--source x]` (re-run
  them through the normal quality gate).
- `/status` → Scraper section: per-domain requests, ok, 304 (notModified), 403 (forbidden), 429 (tooMany),
  challenges, robotsDenied, breakerSkips.
- `docker compose -f docker-compose.local.yml logs --tail=200 scraper` shows no proxy or FlareSolverr use
  while polite mode is on.
- GSA: `deals` rows with `source='gov_auction'` from api.gsa.gov appear after the first sweep (cars and trucks only).
- Curated dealers: new 4cdg/VehiclesNETWORK hosts show up in the curated rotation logs for the
  demanded states.
