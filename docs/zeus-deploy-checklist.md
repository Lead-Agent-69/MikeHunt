# Zeus deploy checklist (scraper code landing 2026-10-10)

Jonah deploys Zeus himself. Agents do **not** SSH in, recreate containers or edit env on Zeus. This page
lists everything the open/merged scraper PRs need on the Zeus Docker stack (`docker-compose.local.yml`,
service `scraper`) once they are merged to `main`. Nothing here applies to Vercel unless it says so.

## 0. Order of operations

1. Merge the PRs (sections 2–3) to `main`.
2. On Zeus: `git pull` in the MikeHunt checkout.
3. Add or adjust env in `.env.local.scraper` (section 1). Never paste secrets into the compose file or a
   shell argument; edit the env file.
4. Rebuild and restart only the scraper: `docker compose -f docker-compose.local.yml up -d --build scraper`
   (the image bakes the code: `Dockerfile.scraper` copies the repo; a restart without `--build` runs old code).
5. Check `http://127.0.0.1:8787` (status port) and `/status` on the app for the new per-domain ban-risk
   and polite counters (section 4).

## 1. Environment (`.env.local.scraper` on Zeus)

| Variable                                                                             | Needed?                      | Value / default                                      | Why                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ---------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GSA_API_KEY`                                                                        | **Yes** for GSA at full rate | Jonah's api.data.gov key (already given; not in git) | GSA Auctions adapter. Without it, it falls back to `DEMO_KEY` (throttled, low hourly cap). Set it on Vercel production too if the app reads GSA.                                       |
| `SCRAPER_POLITE_MODE`                                                                | No (default **on**)          | unset = on. `0`/`off`/`false`/`no` = legacy          | Polite mode becomes the default for every scraper (robots.txt + Crawl-delay, randomized per-domain gaps, honest UA, Retry-After/backoff, ban-risk breaker). Only set `0` to roll back. |
| `POLITE_CACHE_DIR`                                                                   | **Recommended**              | `/app/cache/polite`                                  | Persists the ETag/Last-Modified cache and robots.txt across restarts so unchanged pages are not refetched. Lives on the existing `./cache` volume.                                     |
| `POLITE_MIN_GAP_MS`                                                                  | Optional                     | default in `lib/scrapers/polite/limiter.ts`          | Base gap between requests to one domain. Crawl-delay raises it per domain.                                                                                                             |
| `POLITE_JITTER_RATIO`                                                                | Optional                     | `1` (each gap is base to 2× base)                    | Random spread on every per-domain gap. 0–3.                                                                                                                                            |
| `POLITE_DOMAIN_CONCURRENCY`                                                          | Optional                     | 1 (max 2)                                            | In-flight requests per domain. Different domains still run in parallel.                                                                                                                |
| `POLITE_BREAKER_PAUSE_HOURS`                                                         | Optional                     | default in `breaker.ts`                              | How long a domain pauses after repeated 403/429 or a challenge page.                                                                                                                   |
| `POLITE_ALLOW_RENDER`                                                                | Optional                     | unset                                                | Lets the polite path use a headless render for JS-only pages that robots allows. Leave unset unless a source needs it.                                                                 |
| `SCRAPE_OFF_PEAK_ONLY` / `OFF_PEAK_TZ` / `OFF_PEAK_START_HOUR` / `OFF_PEAK_END_HOUR` | Optional                     | off                                                  | Restrict sweeps to off-peak hours.                                                                                                                                                     |
| `NEXT_PUBLIC_APP_URL`                                                                | Already set                  | `https://mikehunt-69.vercel.app`                     | Used for the contact URL in the honest MikeHunt User-Agent.                                                                                                                            |
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
  `docker compose -f docker-compose.local.yml up -d scraper` (no rebuild needed for env-only changes).
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
