# MikeHunt

Multi-source vehicle-sourcing intelligence platform. Scrapes vehicle auction and
marketplace listings (Craigslist, Copart, Cars.com, eBay Motors, independent dealers),
scores them for profit potential, and surfaces deals, fleet management, transport
quotes, parts/teardown estimates, and price alerts.

**Stack:** Next.js (App Router) · Supabase (Postgres + Auth + Realtime) ·
TypeScript · Tailwind · SWR · Playwright/patchright scrapers. AI is optional and
narrate-only: it never sets a price.

## Architecture

- **Web app + API** — Next.js on **Vercel Hobby** (2 crons). Thin **Supabase** for
  Postgres + Auth: listing rows and photo URLs only, never photo bytes.
- **Scraping engine** — **Zeus Docker** (`docker-compose.local.yml`,
  `Dockerfile.scraper`, see `docs/LOCAL-SCRAPER.md` and `docs/SCRAPER-FLEET.md`), on a
  residential IP. Not Vercel serverless (can't run a browser), not GitHub Actions
  (private-repo minutes), and not Fly.io (free stack only; nothing deploys from `fly.toml`).
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

The same scrapers run continuously in Zeus Docker (`docker-compose.local.yml`).
Scraper env (`.env.local.scraper`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. No paid LLM key is
required.

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
