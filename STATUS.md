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

### P0 blockers — 2026-09-30 pass: 3 of 4 resolved, 1 blocked on tooling

- ~~**Unauthenticated scraper-control APIs**~~ **RESOLVED.** New
  `lib/auth/scrape-gate.ts` is the single fail-closed implementation
  (`SCRAPE_SECRET || CRON_SECRET`; 503 in production when unset, 401 on
  mismatch) applied to `/api/scrape/credentials` (GET/POST/DELETE),
  `/api/scrape/registry` (GET/POST), `/api/scrape/execute` and
  `/api/scrape/queue` (GET/POST/DELETE/PATCH). The queue route additionally
  **dropped client-supplied `redisUrl`** — it always reads
  `process.env.REDIS_URL` now, closing the SSRF path (an attacker pointing Bull
  at their own Redis) even for a caller who already holds the secret.
  `/api/scrape/route.ts` and `/api/scrape/run/route.ts` were refactored onto the
  same module rather than keeping their own inline copies.
  `/api/scrape/health` deliberately stays open — both
  `scripts/freshness-monitor.mjs` and the `/orchestrator` SWR fetch call it with
  no `Authorization` header — but now withholds `lastError`, since
  `scraper_runs.error_message` can carry file paths and upstream URLs, from any
  caller without the secret or an admin session.
- ~~**Vercel env vars**~~ **RESOLVED for everything required.** Verified with
  `npx vercel env ls production`: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
  `SCRAPE_SECRET`, `INGEST_SECRET` and `NEXT_PUBLIC_APP_URL` were already set
  (the "~15 missing" figure was stale), and **`ADMIN_EMAIL` was added** — that
  one was mandatory, because `lib/auth/admin.ts` fails closed with no fallback
  and would otherwise lock everyone out of `/developer`, `/status` and
  `/orchestrator`. `DEPLOYMENT-CHECKLIST.md` now records which optional vars
  are deliberately unset and why.
- ~~**Cron overage**~~ **RESOLVED.** `vercel.json` now has the 2 crons Hobby
  allows: `/api/alerts/profit-sniper` at 08:00 and `/api/alerts/process` at
  09:00 UTC. `/api/embeddings/backfill` moved to
  `.github/workflows/embeddings-backfill.yml` — same 10:00 UTC slot, same
  `CRON_SECRET` gate (`isAuthorizedCron` already documented GitHub Actions as a
  supported trigger), plus `workflow_dispatch` for manual runs. **The workflow
  needs a `CRON_SECRET` repo secret**; without it the job fails closed with 401
  instead of running unauthenticated.
- **Fly.io fleet unverified — STILL OPEN, blocked on tooling.** flyctl is not
  installed and no `FLY_API_TOKEN` is present, so this needs an interactive
  login by a human: install flyctl, `fly auth login`, then `fly status` and
  `fly logs -a dealerhunt-scraper`.

### Maintenance / hygiene

- Rotate the Supabase `service_role` key (was once hardcoded in deleted scripts).
- Add lightweight page-level analytics before pruning routes.
- Identity-table phase 2's remaining step: production data audit, then drop
  `profiles` (code side is done — see above).
- ~~Enable RLS on `public.spatial_ref_sys`~~ **attempted, then reverted.**
  `20260930120000_spatial_ref_sys_rls.sql` failed the migration chain with
  `SQLSTATE 42501 must be owner of table spatial_ref_sys` — the table is owned
  by `supabase_admin` and the deploy role is not a superuser. The file was
  deleted rather than shipped as a silent no-op, so all 61 migrations apply
  clean from a blank DB. The advisor warning is cosmetic (PostGIS reference
  data, readable by design); actually changing it needs the Supabase dashboard
  or a role that owns the table.
