# Autoverse (DealerHunt)

Multi-source vehicle-sourcing intelligence platform. Scrapes vehicle auction and
marketplace listings (Craigslist, Copart, Cars.com, eBay Motors, independent dealers),
scores them for profit potential, and surfaces deals, fleet management, transport
quotes, parts/teardown estimates, and price alerts.

**Stack:** Next.js 15 (App Router) · Supabase (Postgres + Auth + Realtime) ·
TypeScript · Tailwind · SWR · Playwright/patchright scrapers · Gemini (AI valuation).

## Architecture

- **Web app + API** — Next.js on Vercel. Supabase for DB/Auth/Realtime/Storage.
- **Scraping engine** — runs on **GitHub Actions** (`.github/workflows/scrape.yml`),
  not Vercel serverless (which can't run a browser). FlareSolverr runs as a free
  ephemeral service container to bypass Cloudflare. No paid proxies or scraping APIs.
  See `lib/scrapers/` (sources, pipeline, orchestrators, tools).
- **Pipeline** — scrape → normalize → quality-control → score → upsert to `deals`
  (dedupe by `source`+`source_deal_id` and by VIN) → record `price_history` →
  match against `user_saved_searches` → notify (Resend email / Twilio SMS).

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase + optional API keys
npm run dev                  # http://localhost:3000
```

### Scrapers

```bash
# Run one or more sources locally (writes real data to Supabase):
npm run scrape:ci -- craigslist cars_com
# or via env: SCRAPE_SOURCES="craigslist" CL_CITIES="dallas,houston" npm run scrape:ci
```

In CI, the same entrypoint (`scripts/scrape-ci.ts`) runs on a schedule via GitHub
Actions. Configure repo secrets: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally
`GOOGLE_GENERATIVE_AI_API_KEY`, `RESEND_API_KEY`.

### Database

Migrations live in `supabase/migrations/` (single source of truth).

```bash
npm run db:migrate    # supabase db push
npm run db:generate   # regenerate types/supabase.ts
```

## Scripts

- `npm run dev` / `build` / `start` — Next.js
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — vitest (scraper unit tests under `lib/scrapers/`)
- `npm run scrape:ci` — run the scraping orchestrator
- `npm run worker` — BullMQ worker (optional, for self-hosted scraping; needs Redis)

See `STATUS.md` for the current honest state of each feature.
