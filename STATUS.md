# Project Status

Honest state of the app. Updated **2026-09-30** (supersedes the June docs -
`TODO.md`, `NEXT-STEPS.md`, `PROGRESS-REPORT.md`, `QUICK-REFERENCE.md`,
`RESEARCH-SUMMARY.md` and `docs/` plan files are historical, not current).

## Verified health (2026-09-30)

- `tsc --noEmit` clean (0 errors); `eslint .` 0 errors / 321 warnings;
  `vitest run` 394/394 passing (75 files); `next build` exit 0.
- All 59 migrations apply clean from a blank database (`supabase db reset`).
- `types/supabase.ts` regenerated from the live schema: **46 tables / 6 views**
  (was 17 tables, dated 2026-06-25).
- `npm audit --omit=dev` clean for production; **9** remaining advisories are all
  dev-only (`supabase` CLI 1.x->2.x and `bull`->`uuid`, both breaking bumps).
- CI (`ci.yml`) + weekly accuracy gate (`accuracy.yml`) re-enabled in
  `.github/workflows/` (branch filter fixed main->master).

## Data pipeline (where scraping ACTUALLY runs)

- **Fly.io scraper fleet** - app `dealerhunt-scraper` (`fly.toml`,
  `Dockerfile.scraper`, `docs/SCRAPER-FLEET.md`), looping every 30 min
  (`SCRAPE_INTERVAL_MS`). GitHub Actions scraping was intentionally parked
  (`workflows-disabled/`) because scheduled Chromium scrapes exceed the
  private-repo Actions minutes free tier. Verify fleet health with
  `fly status` / `fly logs -a dealerhunt-scraper` (needs flyctl + `fly auth login`).
- Vercel crons (`vercel.json`) — **as committed, 3 DAILY jobs**:
  `profit-sniper` @08:00Z, `alerts` @09:00Z, `embeddings/backfill` @10:00Z.
  **This is a live blocker:** the Vercel Hobby plan allows a maximum of **2**
  cron jobs, so the third is rejected (and none of the hourly/10-minute cadences
  the older docs claimed are actually scheduled). If these are meant to be
  frequent, they belong on the Fly.io fleet loop instead. See "Known follow-ups".
- Craigslist (incl. by-owner + by-dealer sections) proven nationwide; Cars.com
  is JS-rendered and eBay 403s datacenter IPs - retail-comp breadth still thin.
  Gated auction sources (Manheim/ACV/ADESA/IAA/FB Marketplace) remain
  `enabled: false` - credentials or an anti-bot budget required.

## Working / real

- **Auth** - Supabase Auth with SSR cookies; middleware enforces route+admin
  gating and now **fails closed** in production when env creds are missing.
- **Decision engine** - per-deal BUY/REPAIR/TRANSPORT/SELL -> profit/ROI/
  130-pt score/go-hold-pass verdict/recommended max bid, persisted to `deals`
  - `deal_analysis` JSONB.
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
- **Identity tables (phase 1 done, phase 2 code-side done)** - code canonically
  uses `user_profiles`; `profiles` (FK target) is auto-provisioned via a mirror
  trigger + backfill (`20260929000001`). Phase 2's code half is complete: the
  legacy custom-auth path (`lib/auth/auth-system.ts` + `/api/auth/signup` +
  `/api/auth/signin`) was the ONLY remaining reader of `profiles`, was documented
  in-file as unused ("the UI doesn't call those routes"), and is now deleted —
  zero app code touches `profiles`. What remains is a deliberate destructive
  step (drop the table) that needs a production data audit first, because
  `profiles` is still an FK target and carries billing fields
  (`stripe_customer_id`) that `user_profiles` does not have.
- **Comps precision** - keys on make+first-model-word; needs year/mileage band.
- **Algorithm consistency - was already correct (stale claim)** - `/api/ingest`
  and `/api/save-from-url` were ALREADY routing through `upsertDeals` ->
  `analyzeDeal`, not `DealScoringService`. The legacy scorer was dead code
  imported only by its own test; `lib/scrapers/tools/deal-scoring.ts` and its
  test are now deleted, so `analyzeDeal` (lib/scrapers/tools/deal-analyzer.ts)
  is the single scoring path.
- **Dead reads - RESOLVED** - every `app/api/deals/*` feed route that read the
  nonexistent `seller_phone`/`seller_email` columns now goes through
  `lib/data/deal-contact.ts`, which reads the real `options.contact` jsonb and
  emits the `sellerPhone`/`sellerEmail` keys `DiscoveryCard` expects.
  `best-buy` no longer SELECTs the invalid column (it failed the whole query).
- **Page sprawl** - ~45 dashboard routes incl. 6+ overlapping deal feeds
  (`/find`, `/discover`, `/feed`, `/list`, `/swipe`, `/today`, `/best-buy`,
  `/flash-deals`). No per-page usage analytics -> prune after adding one.

## Known follow-ups

### P0 blockers (OPEN - not addressed by the 2026-09-30 maintenance pass)

- **Unauthenticated scraper-control APIs.** `/api/scrape/credentials`
  (GET/POST/DELETE), `/api/scrape/queue` (POST/DELETE/PATCH - accepts an
  attacker-supplied `redisUrl`), `/api/scrape/execute` and `/api/scrape/registry`
  have **zero auth**. Copy the fail-closed shared-secret pattern already used in
  `app/api/scrape/route.ts` (`SCRAPE_SECRET || CRON_SECRET`, reject when unset).
- **Vercel env vars.** ~15 still unconfirmed in the dashboard (Supabase URL/
  anon/service, `CRON_SECRET`, `INGEST_SECRET`, `SCRAPE_SECRET`, Resend, Twilio,
  Gemini, `VAPID_*`, Stripe, Sentry) — see `DEPLOYMENT-CHECKLIST.md`. Note
  `lib/auth/admin.ts` now **fails closed with no `ADMIN_EMAIL`**, so that one
  must be set or `/developer`, `/status`, `/orchestrator` lock everyone out.
- **Fly.io fleet unverified.** Needs `fly auth login` then `fly status` /
  `fly logs -a dealerhunt-scraper`.
- **Cron overage.** `vercel.json` has 3 daily crons; Hobby allows 2.

### Maintenance / hygiene

- Rotate the Supabase `service_role` key (was once hardcoded in deleted scripts).
- Install flyctl / `fly auth login` and confirm the scraper fleet is alive.
- Add lightweight page-level analytics before pruning routes.
- Identity-table phase 2's remaining step: production data audit, then drop
  `profiles` (code side is done — see above).
- ~~Enable RLS on `public.spatial_ref_sys`~~ done in
  `20260930120000_spatial_ref_sys_rls.sql` (RLS on + permissive SELECT so
  PostGIS SRID lookups keep working for anon/authenticated).
