# Project Status

Honest state of the app. Updated 2026-06-21.

## Working / real

- **Auth** — Supabase Auth with SSR cookies; middleware enforces route protection.
- **Database** — `supabase/migrations/` is the single source of truth. All tables the
  code queries now exist in production (deals, dealers, inventory, saved_cars,
  price_history, market_trends, teardowns, parts_estimates, finance_lenders,
  user_feed_inbox, user_saved_searches, scraper_runs, …).
- **Scraping engine** — runs end-to-end. Craigslist validated live: a single run
  ingested real listings into `deals` (normalize → quality → score → dedupe → upsert →
  price_history). Runs on GitHub Actions (`.github/workflows/scrape.yml`) with
  FlareSolverr; `$0` infrastructure (no paid proxies/APIs).
- **Dashboard pages** — scan, fleet, move, recon, settings, saved, alerts fetch real
  data via SWR/Supabase.
- **Notifications** — Resend (email) and Twilio (SMS) integrations are real.
- **Decision engine** — every scraped deal is run through `lib/scoring/deal-analyzer.ts`
  (wrapping `lib/scoring/profit-calculator.ts`). It computes, per deal:
  BUY (bid + auction buyer fees + title fee), REPAIR (from `damage_type` + recon for
  salvage sources), TRANSPORT (listing state → `HOME_BASE_STATE` × carrier rate),
  SELL (market value when known, else a source/condition markup), then PROFIT / ROI /
  carrying cost / 130-pt score / **go·hold·pass verdict** and a **recommended max bid**
  to hit `TARGET_ROI`. Persisted to `deals` (`true_net_profit`, `estimated_repair_cost`,
  `estimated_transport_cost`, `profit_score`, `sell_estimate`, `recommended_max_bid`,
  `deal_verdict`, and a full `deal_analysis` JSONB breakdown). Validated live across CA/FL/TX.
- **Nationwide coverage** — `lib/geo.ts` provides all-50-state data. Craigslist (50-state
  metro subdomains), Cars.com (one seed ZIP per state, radius search), and Copart (all
  states) now scan nationwide; eBay/IAA are national by nature. Tunable via env
  (`CL_CITIES`, `CL_MAX_CITIES`, `CARS_STATES`, `CARS_MAX_PAGES`).

- **$0 market valuation (comps)** — `lib/scoring/market-value.ts` builds resale value from our
  OWN scraped data, since no free vehicle-value API exists (all paid: MarketCheck/KBB/Edmunds).
  Retail channels (Cars.com, eBay, **Craigslist by-dealer**) set the resale target; wholesale/
  private (Craigslist by-owner, Copart, IAA) set the acquisition benchmark — the spread is the
  arbitrage signal, and it sharpens as coverage grows. Craigslist now scrapes both the by-owner
  (`cto`) and by-dealer (`ctd`) sections, giving real retail-vs-private comps with $0/unblocked
  data. Validated live: real `comps`-based "go" deals (e.g. private $9.8k → dealer-retail $22.8k).
- **Near-real-time ingestion ($0)** — `scrape-realtime.yml` scrapes a rotating 1/8 country slice
  from Craigslist every 30 min (static, ~2 min/run), cycling the nation every ~4h; new deals
  push to the scan page instantly via Supabase Realtime. GitHub Actions is unlimited on public
  repos (private ≈ 2,000 min/mo — go hourly or public for the 30-min cadence).

- **Experience / onboarding (Apple-style)** — public landing page at `/` (logged-in users
  redirect to `/find`), polished single-card login/register, installable PWA (brand `icon.svg`
  - fixed `manifest.json` + apple-touch/theme-color), consistent middleware gating. In-app:
    the deal page leads with the **verdict + recommended max bid as the hero** (cost ledger demoted
    to "Adjust assumptions"), calm reusable `EmptyState` across find/fleet/saved, deal cards show a
    verdict pill + net profit + max bid, and "Get Transport" passes deal context to `/move`. Builds clean.

## Partial / needs work

- **Retail source breadth** — Craigslist by-dealer is the proven $0 retail source. Cars.com is
  now JS-rendered (static fetch returns 0) and eBay 403s datacenter IPs; both need the browser
  path (patchright) or FlareSolverr to contribute retail comps. GSA Auctions
  (gsaauctions.gov, 30k+ free public gov vehicles/yr, hourly inventory) is a high-value $0
  source to add next.
- **Comps precision** — comps key on make+first-model-word only; refine with year band, mileage,
  and trim to cut noise (e.g. mismatched project/parts listings). Wiring
  `analyzeMarketIntelligence` (the 30 market-intel points default to neutral) is the next lift.
- **Algorithm consistency** — `app/api/ingest` and `app/api/save-from-url` still use the legacy
  `DealScoringService`; route them through the new `analyzeDeal` for uniform valuations.
- **Repair accuracy** — repair cost is driven by `damage_type`; private-party sources rarely
  emit it (repair ≈ 0). Salvage sources (Copart/IAA) populate it. Could be deepened with the
  VIN-driven `PartsCalculator`.
- **Source coverage** — Craigslist + Cars.com proven live nationwide. Copart/eBay/
  independent-dealer adapters are wired but need live validation (Copart needs FlareSolverr).
- **Gated auction sources** — Manheim / ACV / ADESA are `enabled: false`; they require
  paid dealer accounts. Out of scope until credentials exist.
- **Identity tables** — both `profiles` (canonical, used by all FKs) and `user_profiles`
  exist with live rows. The signup/provision path writes `user_profiles`; ownership FKs
  target `profiles`. These should be reconciled with a careful data migration.

## Removed

- **Payments / Stripe** — fully removed (mock Stripe, tiers, pricing page, subscribe
  route, `stripe` dependency). The app is free; no billing or usage gating.

## Known follow-ups

- Rotate the Supabase `service_role` key (it had been hardcoded in now-deleted scripts).
- Validate the GitHub Actions scrape run on schedule; add per-source schedules if needed.
- Reconcile `profiles` vs `user_profiles`.
- Enable RLS on `public.spatial_ref_sys` (PostGIS system table) if desired.
