# Cars Release And Remaining Work Handoff

Updated October 9, 2026 (America/Chicago). Scope: PR #166 and the current cars application.
This supersedes historical cars completion claims in the product register, not the separate
housing handoff. A merged release is not signed-in production acceptance or Copart/Visor parity.

## Release Scope And Evidence

- PR: https://github.com/Lead-Agent-69/MikeHunt/pull/166
- Web: https://mikehunt-69.vercel.app/
- Primary customer journey: Discover -> Saved -> Plan/Pipeline; Account and searchable Tools support it.
- Deal Check is secondary offer-cost review, not appraisal or primary navigation.
- Listing Manager, Finance and Bulk customer screens are removed; old links redirect to Fleet/Scan.
  Retired bulk/lender endpoints return 410. Do not recreate these as completion tasks.
- Optional expanded workspaces are free. Dealer desks retain surviving customer tools.
  Workspace upgrades cannot grant admin permissions. Existing subscriptions are not cancelled.
- Shared inventory filters, restored search scope, price semantics, error recovery, truthful
  estimates and owner-confirmed writes are implemented; real-role production acceptance remains open.
- Latest pre-integration gate: 1,718 tests / 343 files, typecheck, lint and production build passed.
  The combined master/PR tree must pass again before merge; use Git/PR checks for final release SHA.
- Production recovery: 32 active SalvageZone listings imported, real prices/mileage/title and
  vehicle links preserved. Six public inventory pages checked; held/sold cards excluded.
- Production Alan Jay recovery: 66 homepage URLs replaced with exact evidence-matched vehicle pages.
  163 homepage-only records remain in the last verified snapshot. Never guess their detail URLs.
- SalvageZone photo routing uses the existing restricted raster image proxy. Local desktop/mobile
  checks verified actual photos and first-viewport price. Production rendering needs release smoke.
- Worker: mikehunt-scraper-1, image mikehunt-scraper-inventory:f437604, last verified running/healthy.
  Existing Docker overrides keep CACHE_PHOTOS_MAX=0 and SCRAPE_SOURCES empty, selecting terms-safe
  defaults (GSA + curated dealers). Do not enable restricted marketplaces to inflate coverage.
- Bronco Sport identity/scoring repair was verified against five local records. Hosted historical
  repair is NOT proven; newer worker parsing alone does not repair existing hosted rows.

## Phase 1: Account, Authorization And Persistence

Suggested owners: Jonah (configuration/product), Ren/Amy (security/backend), May/Sara (acceptance).

- Verify hosted Supabase Auth minimum password length 12, public Site URL, callback allowlist,
  Google provider redirects and SMTP delivery. An earlier live audit observed protected-alias
  redirects; an existing restored admin session does not prove fresh login.
- Complete signup, confirmation, Google login, emailed recovery/password update, session
  restoration after browser restart, logout/failure recovery for personal, DIY, parts, reseller,
  dealer and a separately authorized admin. Use test accounts, never promote buyers to admin.
- Prove ordinary users cannot access admin routes/APIs or another owner's records; test free
  expansion without charges or privilege changes.
- Prove preferences/onboarding, Saved/watchlist, search criteria, tasks and repair budgets persist
  across devices. Distinguish device-only backups from cloud writes and alerts.
- Make concurrent preference merges atomic; current read/merge/write can lose another update.
- Verify account settings/deletion and privacy lifecycle with authorized accounts.

Exit: recorded role/session matrix, cross-owner negative checks and cross-device persistence;
provider settings verified in hosted configuration, not merely client-side 12-character validation.

## Phase 2: Inventory, Source Yield And Filter Truth

Suggested owners: Zeus operator, Amy/Eva; Jonah decides licensed coverage.

- Reconcile source registry versus truly yielding feeds by state/vehicle class. Measure active
  rows, new yield, duplicates, age, failures, VIN/location/price/photo completeness and detail links.
- Expand permitted dealer inventory with representative detail fixtures and bounded, paced runs.
  Finish the 163 unresolved Alan Jay links only when evidence uniquely matches; retire genuinely
  stale stock safely rather than rewriting ambiguous identities.
- Verify/apply hosted Bronco Sport identity repair; review other model aliases (including
  Ram ProMaster), truncated model names and missing VINs. Never manufacture VIN/location facts.
- Validate partial-run-safe retirement, unavailable Saved retention, missing versus confirmed
  sold status, redirects and image availability. Missing from a listing page is not proof of sale.
- Decide eBay Browse and/or licensed Copart CSV/API path, budgets, permissions and feed terms.
  External AutoTempest search handoffs are wider-market links, not inventory ingestion.
- Verify every supported filter against representative source rows: make/model/year/trim/body,
  price type and unknowns, mileage, title/damage, fuel/transmission/drivetrain, run/keys,
  photos/VIN, location, source/seller, buy-now and auction dates. Unsupported provider facts stay unknown.
- Finish exact-distance/radius semantics using valid coordinates and haversine; do not represent
  state-center estimates as exact proximity. Confirm same scope and category counts across views.
- Add authoritative lot/sale-status, eligibility and fee data only with licensed evidence.
  Research/run-list import is not bidding, purchasing or full Copart auction parity.

Exit: source/state coverage table with real runs; filter/result/facet agreement, safe retirement
and valid seller/photo links; operator-approved feed terms and explicit soft-launch gaps.

## Phase 3: Intelligence That Can Be Trusted

Suggested owners: Amy/Eva.

- Prove embedding migration/backfill status, model version, changed-input invalidation, coverage,
  freshness and cost limits in production. Master includes freshness/backfill code, not proof of yield.
- Evaluate For You with real traffic and versioned state/role cohorts; measure want-hit hold
  around 0.9 across states with sample counts, holdouts and drift, not a single snapshot.
- Establish dated, like-for-like sold-price cohorts. Last worker comp snapshot had 860 groups /
  2,159 comparisons and zero sold groups; asking-price comparisons are not sold appraisals.
- Master already includes P1 coordinate-distance, same-state comp aggregation and circular-value
  protections. Complete production acceptance for those paths and independent
  market values without circular asking-price averages. Reconcile confidence across API/cards/detail:
  strong listing completeness must not imply strong valuation when sold evidence is absent.
- Keep unsupported profit/ROI/turnover unknown; forecasts explicitly rule-based until calibrated.
- Preserve hard segment/price/year prefilters before semantic ranking plus live/fresh/auction
  eligibility rechecks and match explanations. Verify representative sparse and mismatched markets.
- Make evaluation versions/provenance consistent across cards, Compare, alerts and Pipeline;
  collect verified outcomes, separating personal ownership from resale performance.

Exit: published calibration/freshness metrics with limitations and representative holdout evidence;
no unsupported market-value, guaranteed-profit, urgency or 50-state accuracy claims.

## Phase 4: Complete The Buyer Jobs

Suggested owners: May/Sara, Amy for writes; Jonah for scope decisions.

- Run populated signed-in Discover -> detail -> Saved -> Compare -> Plan/Pipeline journeys
  for every role, desktop/mobile, loading/empty/failure/offline cases. Preserve search scope/back.
- Verify Find similar CTA/results, direct seller/contact links, always-visible price types,
  keyboard photo controls, mobile action bars and no hidden primary decisions.
- Prove two-vehicle comparison including local-only/unavailable records, aligned title/condition/
  mileage/location, unknown costs and dated evidence; do not compare bids as retail alternatives.
- Implement/verify inspection and quote attachments, authorization, storage/persistence,
  evidence gates and recalculation. Offer-cost arithmetic is not an inspection or appraisal.
- Make purchase recording idempotent; network timeout must not create duplicate inventory.
  Verify actual paid price, legitimate zero, stages, concurrent cost writes and complete expenses.
- Verify personal ownership costs/tasks, DIY capability/workspace planning, parts teardown budgets
  and dealer recon/capital workflows independently, not just different buyer-mode labels.
- Outcome completion is best-effort today: verify reliable writes before calibration uses it.
  Category-total costs are not an itemized evidence ledger.
- Complete actual email/push alert delivery, deduplication, preference controls and unsubscribe.
  A watchlist save does not prove delivery; SMS remains unsupported.
- Finish Settings mobile hierarchy and display/detail/reduced-motion discovery and save feedback.
- Decide /beta and /showcase fate, legacy flip URLs, dealer location depth and personal valuation
  story. Maintain compact More/Tools organization without restoring retired destinations.

Exit: populated role-based journey evidence; successful, failed and concurrent writes exercised;
actual notification delivery; all remaining destinations perform a clear, accessible buyer job.

## Phase 5: Accessibility, Reliability And Operations

Suggested owners: Ren/Amy, Zeus operator, May/Sara.

- Full-page keyboard/focus/screen-reader, contrast, touch target, text fit, reduced-motion,
  light/dark, 320px-to-desktop, slow network and offline acceptance. Earlier checks were narrow.
- Verify installed PWA updates/cache invalidation and recovery from old assets. Native Apple/
  Google store certification is a separate process, not a property of passing a web build.
- Load-test inventory/filter/market/recommendation latency and pagination under realistic traffic;
  publish safe count/sample bounds rather than silently claiming complete market coverage.
- Choose a compliant production map provider/traffic policy; public OSM is best-effort, not an SLA.
- Verify Zeus scheduler/job claims/heartbeats/ownership-safe stale-run recovery across multiple
  cycles, retention/cron, source failures, backups/restore, quotas and restart continuity.
- Review Sentry noise and release health with existing scoped access; no usable token was available
  in the earlier lane. Record actual errors, deploy SHA and alert ownership.
- Keep mega Dependabot #64 parked; apply surgical compatible security pins. Re-audit production
  and development dependencies separately; earlier development-tool advisories remain.
- Verify production environment/migration state independently. Supabase Preview was skipped;
  Vercel web deployment does not apply migrations or update the Docker worker.
  In particular, verify hosted application of 20261009200000_deal_embedding_freshness.sql
  and 20261010010000_similar_deals_prefiltered.sql from master before declaring those paths live.

Exit: monitoring/retention/restore evidence, sustained worker health, release smoke, security
audit and responsive/accessibility acceptance. A healthy container snapshot is insufficient.

## Release Procedure And Rollback

1. Integrate master without dropping newer fixes; resolve conflicts and run npm run verify.
2. Push exact reviewed head, mark PR ready, merge normally without bypassing protections.
3. Verify Vercel production deployment against merged commit, then smoke Discover/Scan,
   role-aware nav, retired routes, recovery, SalvageZone results and photo proxy.
4. Preserve worker env/volumes/source restrictions. Its verified inventory image is already deployed;
   deploy later worker changes explicitly, never infer them from a Vercel release.
5. Record final SHA/deployment evidence in the PR/release record. Roll back web via its known
   previous deployment if smoke fails; worker previous images remain available. Do not undo
   verified inventory writes or reset shared workspaces as a rollback shortcut.

Do not merge unrelated draft PRs, apply unknown migrations, enable paid/licensed services or
expand permissions under the phrase "deploy all". SHY FPS #24-#29, Mig Verify elevated work and
cloud agents remain outside this cars release lane.
