# Zeus deploy checklist (scraper code landing 2026-10-10)

Jonah deploys Zeus himself. Agents do **not** SSH in, recreate containers or edit env on Zeus. This page
lists everything the open/merged scraper PRs need on the Zeus Docker stack (`docker-compose.local.yml`,
service `scraper`) once they are merged to `main`. Nothing here applies to Vercel unless it says so.

## 0. Order of operations

### Pinned Image Provenance

Worker health alone is not a release receipt. New images support baked metadata
at `/opt/mikehunt/scraper-release.json` and `release` in `/status.json`. `known`
means a valid image declaration, not a verified rollout or a signature. Missing,
invalid or legacy metadata stays `unknown`; runtime env and the mutable checkout
are never used to invent a live revision.

For an approved commit containing this tooling, the operator can first inspect
the build plan without changing Docker:

```text
npx tsx scripts/build-scraper-image.ts <exact-40-character-commit> mikehunt-scraper:<unique-release-tag>
```

Add `--build` only for an approved build. The builder streams `git archive` of
that exact commit into Docker, not the working tree, even when checkout HEAD has
moved or the checkout is dirty. Untracked env, profiles and caches are excluded
by construction; tracked protected runtime paths are rejected. Example env
templates are allowed. No protected runtime file is read or hashed for metadata.
The build has no container restart, env mutation, source enable or quota reset.

Record the built image ID. Inspect the actual target runtime's compose labels,
mounts, env-file references and quota state before an approved rollout; local
Docker Desktop evidence is not evidence about remote Zeus. Preserve every active
overlay and retain the previous image for rollback. Apply the approved image tag
through an image-only operator override appended to the complete existing compose
file list. Pass `--env-file .env.local.scraper` before the project/file options,
then use `up --no-build --no-deps scraper` with that full list. The service-level
`env_file` does not override explicit values inherited from the base compose file;
omitting the CLI env file can pair the hosted URL with a local-development key. Do not
rebuild from a mutable checkout during this step. A bare `up --build` remains an
unknown-provenance legacy build; a restart alone never updates its baked code.
Do not combine this rollout with moving C:/F: mounts or changing quota limits.

After rollout, use the actual container's loopback status binding:

```text
npx tsx scripts/verify-scraper-release.ts <exact-40-character-commit> <built-image-id-or-tag> <container-name> http://127.0.0.1:8787/status.json
```

This read-only verifier requires matching expected commit, image labels, built
image ID, running container image ID, and fresh worker metadata after the
container start. It checks the status port belongs to that container, bounds the
response/timeouts, and prints only release/identity fields, never full Docker
inspect or listing/env payloads. Nonzero exit means **not verified**, not permission
to reset state or restart automatically. Retain the receipt with active mounts,
quota continuity and source permissions. Positive real worker verification still
requires the operator-controlled rollout; unit fixtures are not that receipt.

### Preserve The Active Compose Configuration

Before any operator rollout, inspect the running scraper's
`com.docker.compose.project.config_files` label and retain every existing overlay.
The October 13 Windows rollout includes cache/photo, location-scope, pagination,
photo-freshness and worker-push overrides. A bare base-file deployment drops those
settings. The worker-push override references a protected generated env file
outside Git; never paste its private key into a compose file or shell argument.
The deployment receipt is `F:/MikeHunt/docker/worker-push-receipt-20261013.json`.
It records unchanged image, mounts, source settings and quota counters, not proof
of notification delivery. Keep the existing agent deployment restriction above;
an owner-approved exception for one rollout is not a standing permission.

Also compare the host source mounted at `/app/cache` on `scraper` with the host
source mounted at `/cache` on `janitor`. They must be the same directory. A
healthy janitor pointed at a different checkout does not protect the active
worker cache. On Windows, set `SCRAPER_STATE_ROOT` with forward slashes before
rendering Compose, then verify the resolved mounts after the worker is healthy.

The worker and Vercel must use the same `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, paired
`VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Do not generate a replacement pair when
subscriptions already exist. Confirm configuration on both runtimes, then verify
an opted-in device receives the notification and opens its intended vehicle.
Resend additionally needs `RESEND_API_KEY`, a verified sender and a registered
webhook with `RESEND_WEBHOOK_SECRET`; key presence alone is not delivery proof.

1. Merge the PRs (sections 2–3) to `main`.
2. On Zeus: `git pull` in the MikeHunt checkout.
3. Add or adjust env in `.env.local.scraper` (section 1). Never paste secrets into the compose file or a
   shell argument; edit the env file.
4. Build the exact approved commit with the pinned archive builder above. Preserve
   the full active compose file list and use an image-only operator override with
   `docker compose --env-file .env.local.scraper ... up --no-build --no-deps scraper`.
   Do not substitute a bare base-file rebuild, drop existing overlays or reuse the
   old image. Verify the new image/status receipt before declaring the rollout complete.
5. Check `http://127.0.0.1:8787` (status port) and `/status` on the app for the new per-domain ban-risk
   and polite counters (section 4). Logs must include the worker message
   `hosted database connection verified`; container health alone is not database-access proof.

## 1. Environment (`.env.local.scraper` on Zeus)

| Variable                                                                             | Needed?                      | Value / default                                      | Why                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ---------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SCRAPER_STATE_ROOT`                                                                 | Recommended on Windows       | `F:/MikeHunt/main` on the current host               | Keeps scraper cache, profiles and logs on the roomy data drive. The scraper and janitor resolve this same root; verify both mounted cache paths match after rollout.                   |
| `GSA_API_KEY`                                                                        | **Yes** for GSA at full rate | Jonah's api.data.gov key (already given; not in git) | GSA Auctions adapter. Without it, it falls back to `DEMO_KEY` (throttled, low hourly cap). Set it on Vercel production too if the app reads GSA.                                       |
| `SCRAPER_POLITE_MODE`                                                                | No (default **on**)          | unset = on. `0`/`off`/`false`/`no` = legacy          | Polite mode becomes the default for every scraper (robots.txt + Crawl-delay, randomized per-domain gaps, honest UA, Retry-After/backoff, ban-risk breaker). Only set `0` to roll back. |
| `POLITE_CACHE_DIR`                                                                   | **Recommended**              | `/app/cache/polite`                                  | Persists the ETag/Last-Modified cache and robots.txt across restarts so unchanged pages are not refetched. Lives on the existing `./cache` volume.                                     |
| `POLITE_MIN_GAP_MS`                                                                  | Optional                     | default in `lib/scrapers/polite/limiter.ts`          | Base gap between requests to one domain. Crawl-delay raises it per domain.                                                                                                             |
| `POLITE_JITTER_RATIO`                                                                | Optional                     | `1` (each gap is base to 2× base)                    | Random spread on every per-domain gap. 0–3.                                                                                                                                            |
| `POLITE_DOMAIN_CONCURRENCY`                                                          | Optional                     | 1 (max 2)                                            | In-flight requests per domain. Different domains still run in parallel.                                                                                                                |
| `POLITE_BREAKER_PAUSE_HOURS`                                                         | Optional                     | default in `breaker.ts`                              | How long a domain pauses after repeated 403/429 or a challenge page.                                                                                                                   |
| `POLITE_ALLOW_RENDER`                                                                | Optional                     | unset                                                | Lets the polite path use a headless render for JS-only pages that robots allows. Leave unset unless a source needs it.                                                                 |
| `SCRAPE_OFF_PEAK_ONLY` / `OFF_PEAK_TZ` / `OFF_PEAK_START_HOUR` / `OFF_PEAK_END_HOUR` | Optional                     | off                                                  | Restrict sweeps to off-peak hours.                                                                                                                                                     |
| `NEXT_PUBLIC_APP_URL`                                                                | Already set                  | `https://dealerhunt.vercel.app`                      | Used for the contact URL in the honest MikeHunt User-Agent.                                                                                                                            |
| `CL_USE_FREE_PROXY`                                                                  | Leave unset                  | —                                                    | Legacy-only. Ignored while polite mode is on (no proxy use in polite mode).                                                                                                            |

No new Supabase migration is required by the scraper PRs below (they write through existing tables and
`scrape_jobs.result`).

## 2. What changes behavior on Zeus

| PR                                                                                                          | Change on Zeus                                                          | Action                                                                          |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| #257 (merged) polite crawler toolkit + /status ban-risk                                                     | Toolkit present; opt-in in that PR                                      | Rebuild image                                                                   |
| #269 polite mode by default                                                                                 | **Every** scraper goes through robots + jitter + honest UA by default   | Rebuild; set `POLITE_CACHE_DIR`; watch /status skip and 403/429 rates for a day |
| #270 shared dealer-CMS parser (Damage.com, D&G pagination, AutoVada, St. James, Riverbend, Premier, Gary's) | More salvage rows from curated yards                                    | Rebuild                                                                         |
| #272 platform dealers (4cdg + VehiclesNETWORK) + new verified sites                                         | New curated dealers join their state's demand ring automatically (#247) | Rebuild                                                                         |
| #271 GSA official API adapter (cars and trucks only)                                                        | GSA lots via api.gsa.gov                                                | Rebuild + `GSA_API_KEY`                                                         |
| #247 (merged) per-state curated demand ring                                                                 | A user's home/saved-search state kicks that state's dealers first       | Rebuild                                                                         |
| source-gathering PRs (open-gov feed registry, link-only multi-site sources)                                 | Catalog only; nothing new is fetched until each parser lands            | None                                                                            |

### Expected side effects of polite-by-default (be ready for these)

- Sources whose robots.txt disallows the paths we used, or that serve bot challenges (CarGurus,
  Facebook Marketplace, other Cloudflare/DataDome sites), will be **skipped** rather than forced.
  They stay registered and scheduled; /status shows them as robots/breaker skips. No source is removed.
- FlareSolverr and the proxy settings are no longer used on the polite path. The `flaresolverr`
  container can keep running (harmless) and is still used if `SCRAPER_POLITE_MODE=0`.
- Fewer requests per sweep (cache hits / 304s), so sweeps finish later per domain but cost less.

## 3. Rollback

- One switch: set `SCRAPER_POLITE_MODE=0` in `.env.local.scraper`, then
  `docker compose --env-file .env.local.scraper -f docker-compose.local.yml up -d scraper`
  (no rebuild needed for env-only changes).
- Code rollback: check out the previous `main` commit and rebuild the `scraper` service.

## 4. Verify after deploy

- `/status` → Scraper section: per-domain requests, ok, 304 (notModified), 403 (forbidden), 429 (tooMany),
  challenges, robotsDenied, breakerSkips.
- `docker compose -f docker-compose.local.yml logs --tail=200 scraper` shows no proxy or FlareSolverr use
  while polite mode is on.
- GSA: `deals` rows with `source='gov_auction'` from api.gsa.gov appear after the first sweep (cars and trucks only).
- Curated dealers: new 4cdg/VehiclesNETWORK hosts show up in the curated rotation logs for the
  demanded states.

## 5. What Zeus needs for the new sources (from docs/sources-master.md §7)

- **Merge order:** #270, then retarget #272 to main and merge it, then #271, #280, #273, and #286 (sources master). All are catalog or parser changes. None needs a migration.
- **`GSA_API_KEY`** (free api.data.gov key) for #271. Without it the adapter falls back to `DEMO_KEY`, at 1 call every 2 hours.
- **Optional licensed APIs (Jonah's call, each a free signup):** eBay Browse API key, Auto.dev key, MarketCheck key.
- **Open-gov feeds:** the parsers exist, but there's no runner job yet. A follow-up PR adds an `open_gov` runner source. The image then needs `poppler-utils` (`pdftotext -layout`) for Baltimore, MoCo MD, Honolulu, Delaware and Boston, plus `tesseract-ocr` for Memphis's scanned impound PDF and a sheet reader for the Memphis XLSX. Poll at most daily (Memphis robots: crawl-delay 10). Seattle and Norfolk sold rows go into `sold_listings` with `basis='sold'`, which needs #264's `basis` column first.
- **"Ready" researched dealers** (BrandCarX SC, Midwest Jeeps IN, Kim Motor VA, Incredibuilt, Beard's AR, Kershner's NE, L&C TX): move them into `CURATED_SITES` once #270/#272 land. They then ride the existing `curated_dealers` sweep, with no Zeus change.
- **Unchanged:** don't bake `SCRAPE_SOURCES` into the image, terms-restricted sources stay opt-in, and no rotating proxies.

## 6. Capture audit follow-ups (docs/capture-audit.md, 2026-10-10)

- **Rebuild the scraper image from current `main`** after the eBay sold and Visor/AutoTempest PRs land.
  Since the Oct 9 restore, Zeus has only swept Craigslist, curated dealers, GSA and GovDeals: Cars.com,
  Autotrader, Carvana, eBay Motors, OfferUp, AutoTempest and eBay sold have never stored a row.
- **Env check** in `.env.local.scraper`: `SCRAPE_SOURCES` unset (or it overrides the restored default),
  `SCRAPE_TERMS_SAFE_ONLY` unset, `CACHE_ONLY_MODE=false` (cache-only keeps eBay sold rows local and
  writes 0 to Supabase), `SCRAPER_EXECUTION_MODE=hybrid`.
- **eBay sold:** `EBAY_SOLD_DELAY_MS` (default 5000, 5-7.5s with jitter) and `EBAY_SOLD_MAX_QUERIES`
  (default 40). Expect `scraper_runs.status='error'` with `challenged: www.ebay.com HTTP 403` while eBay
  refuses the request (seen from a residential IP on Oct 10). That is the honest state, not a crash.
  The old shared `cache/sold-item-ids.json` is no longer read; the new file is per Supabase project
  (`sold-item-ids.<project>.json`).
- **Visor:** new runner id `visor` (primary tier, operator-restored). `VISOR_MAX_PER_RUN` (default 100
  listing pages per run, after skipping VINs we already hold). Expect `challenged: visor.vin bot
challenge page` if Cloudflare challenges Zeus's client the way it challenged the box; the sitemap
  itself is open.
- **AutoTempest:** expect `challenged: autotempest.com refused: You are not authorized...` while its API
  requires a signed token. Not bypassed.
- **Craigslist:** `CL_ENRICH_MAX` (default 60 detail pages per run) is why VIN/photos are thin
  (VIN 0/830, photos 5/830). Raising it to 200-300 costs that many extra polite page reads per run.
- **Verify:** `scraper_runs` shows rows for `ebay_sold`, `visor` and `autotempest` after a full sweep
  (success or an honest `challenged` error), and `deals.options->>'discoveredVia'` is set on any
  Visor/AutoTempest row.

## 7. Durable observation buffer (2026-10-12)

- New and changed observations are saved to the local cache before remote
  classification, write-budget checks, or upserts. Paused, quota-limited and
  failed writes retain their latest payload for a later permitted attempt.
- Freshness updates request exact affected-row counts. Missing, partial or
  unverified matches stay buffered for reclassification rather than being
  reported as fully stored. Reported touches are confirmed matches; the daily
  touch budget conservatively reserves attempted rows, including failures.
- Deploy this worker code from reviewed `main` using the operator procedure
  above. Preserve the existing cache volume and quota state. Do not reset quotas
  or force a scrape to test recovery. A web deployment does not rebuild Zeus.
- This change does not apply protected-retention SQL, delete saved research,
  enable restricted sources, or establish a cold archive/restore guarantee.
