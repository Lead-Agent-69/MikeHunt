# Project Status

Honest state of the app. Updated **2026-09-29** (supersedes the June docs -
`TODO.md`, `NEXT-STEPS.md`, `PROGRESS-REPORT.md`, `QUICK-REFERENCE.md`,
`RESEARCH-SUMMARY.md` and `docs/` plan files are historical, not current).

## Verified health (2026-09-29)

- `tsc --noEmit` clean; `vitest run` 379/379 passing (73 files).
- CI (`ci.yml`) + weekly accuracy gate (`accuracy.yml`) re-enabled in
  `.github/workflows/` (branch filter fixed main->master).

## Data pipeline (where scraping ACTUALLY runs)

- **Fly.io scraper fleet** - app `dealerhunt-scraper` (`fly.toml`,
  `Dockerfile.scraper`, `docs/SCRAPER-FLEET.md`), looping every 30 min
  (`SCRAPE_INTERVAL_MS`). GitHub Actions scraping was intentionally parked
  (`workflows-disabled/`) because scheduled Chromium scrapes exceed the
  private-repo Actions minutes free tier. Verify fleet health with
  `fly status` / `fly logs -a dealerhunt-scraper` (needs flyctl + `fly auth login`).
- Vercel crons (`vercel.json`): profit-sniper /10m, alerts /15m, embeddings /6h.
- Craigslist (incl. by-owner + by-dealer sections) proven nationwide; Cars.com
  is JS-rendered and eBay 403s datacenter IPs - retail-comp breadth still thin.
  Gated auction sources (Manheim/ACV/ADESA/IAA/FB Marketplace) remain
  `enabled: false` - credentials or an anti-bot budget required.

## Working / real

- **Auth** - Supabase Auth with SSR cookies; middleware enforces route+admin
  gating and now **fails closed** in production when env creds are missing.
- **Decision engine** - per-deal BUY/REPAIR/TRANSPORT/SELL -> profit/ROI/
  130-pt score/go-hold-pass verdict/recommended max bid, persisted to `deals`
  + `deal_analysis` JSONB.
- **$0 comps** - market value from our own scraped retail-vs-wholesale spread.
- **The moat is wired** - `LogOutcome` (predicted-vs-actual snapshot ->
  `POST /api/outcomes`) + `MaxBidCalculator` + `CalibrationNudge` render on
  `/deal/[id]`; `CalibrationNudge` also on `/today`; `CapitalVelocityTracker`
  on `/fleet`. Dealer calibration auto-computes after enough logged outcomes.
- **Notifications** - Resend email, Twilio SMS, web-push (VAPID) all real.
- **Admin** - `/admin` dashboard + `/api/admin/stats` with role validation;
  admin-gated via `ADMIN_ROUTES`.

## Partial / needs work

- **Pricing is undecided** - Stripe is NOT removed: `lib/stripe.ts`,
  `/api/billing/*`, `/api/checkout/beta-access`, `/upgrade`, `/beta` all exist
  and degrade gracefully to "not configured" until `STRIPE_SECRET_KEY` is set.
  App currently ships free. DECIDE: activate billing or delete the surface.
- **Identity tables (phase 1 done)** - code canonically uses `user_profiles`;
  `profiles` (FK target) is now auto-provisioned via a mirror trigger +
  backfill (`20260929000001`). Phase 2 (pick one table, repoint 15+ call
  sites, drop the other) is still open.
- **Comps precision** - keys on make+first-model-word; needs year/mileage band.
- **Algorithm consistency** - `app/api/ingest` and `app/api/save-from-url`
  still use the legacy `DealScoringService`; route through `analyzeDeal`.
- **Dead reads** - a few `app/api/deals/*` routes read nonexistent
  `seller_phone`/`seller_email` (contact lives in `options.contact`).
- **Page sprawl** - ~45 dashboard routes incl. 6+ overlapping deal feeds
  (`/find`, `/discover`, `/feed`, `/list`, `/swipe`, `/today`, `/best-buy`,
  `/flash-deals`). No per-page usage analytics -> prune after adding one.

## Known follow-ups

- Rotate the Supabase `service_role` key (was once hardcoded in deleted scripts).
- Install flyctl / `fly auth login` and confirm the scraper fleet is alive.
- Add lightweight page-level analytics before pruning routes.
- Identity-table phase 2 (see above).
- Enable RLS on `public.spatial_ref_sys` if desired.
