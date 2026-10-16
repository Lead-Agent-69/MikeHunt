# Consolidated Completion Checklist

Snapshot: October 11, 2026, evening Chicago. This is the single integration index
for the user's audit, prior handoffs and the visible agent queue. It preserves
existing features and evidence; it does not declare the entire app finished.

## Read This First

### Recorded Walkthrough Follow-Through (October 15, 2026)

Branch: `codex/walkthrough-search-acceptance`, based on main after #424.
This section supersedes the earlier multi-persona product direction for the
buying interface. It does not grant admin access or remove account isolation.

Implemented in modular commits:

- One buying setup and preference form, with the old persona choice archived
  when the user confirms a save. No dealer/personal role selector or purchase
  upgrade requirement. Existing accounts and protected administration remain.
- Always-visible inventory view links and quick filters, prominent primary save
  actions, plus directly reachable model, mileage, multiple sources, ZIP and
  radius controls. Secondary insights mount only when requested.
- Cross-border radius filtering runs in PostgreSQL before sorting, counting and
  pagination. Scan, facets, Feed and Map share the same location scope; a ZIP is
  not also treated as an exact postal-code filter. Unresolved locations fail
  clearly rather than silently widening the search. Listings without coordinates
  cannot be placed inside a radius. Map's All view is distinct from Review/GO/HOLD.
- Sort choices now survive the Scan response normalization. Qualified price gap
  is explicitly before costs, separate from net profit; unverified asking amounts
  and unsupported valuations cannot qualify for this new sort.
- Why shown exposes recorded reference values, comp type/count/scope, mileage
  and title multipliers, evidence flags and genuine calculation timestamps.
  Missing inputs and unretained individual comparable IDs stay explicit, not
  invented. This is not proof of valuation accuracy against completed sales.
- Listing issue reports use the signed-in account's RLS client, bounded text,
  owner isolation, immutable records, daily limits and idempotent receipts.
  Failed submissions retain their text. Reports survive removal of the listing.

Required release order: independent review of this exact code/SQL head, current
primary-project storage/compute headroom, targeted application of the following
three migrations to `qupzqpezslsbobhugswp`, then app deployment and hosted QA:

1. `20261016005413_listing_feedback.sql`
2. `20261016005724_qualified_listing_margin.sql`
3. `20261016011958_radius_inventory_search.sql`

Do not use a blanket database push: unrelated unapplied migrations need their own
review. The new schema has been exercised only on guarded local Docker databases;
no production apply, full rescore, cleanup or worker recreation is implied.
The radius function uses an active-coordinate partial index internally and a
whole-row return so later inventory columns do not break it. Production execution
plans and latency still require measurement; do not describe it as planner-inlined.

Walkthrough acceptance checks:

- `e2e/walkthrough-feedback.spec.ts`: visible search/view controls, actual
  St. Louis/Belleville radius results excluding Chicago across inventory APIs,
  qualified gap order, preference save/reload and database-confirmed reports.
- `e2e/discovery-priority.spec.ts`: first vehicle price remains above navigation
  on desktop, narrow phones and both tablet orientations; tapping it opens that
  vehicle. Legacy account data is compatibility coverage, not new persona UI.
- `node scripts/test-listing-feedback.mjs`: disposable local PostgreSQL tests
  actual grants/RLS, forged ownership, modification denial, daily quota, report
  survival, evidence-qualified margins, cross-border/dateline radius and later
  inventory-column compatibility. It never targets the hosted database.

Still open beyond this branch: source-wide corrected-price/gallery ingestion,
Zeus rollout receipts, held-out valuation outcomes, independently reviewed safe
retention, measured hosted free-tier capacity, actual email/push delivery and
physical-device performance. Browser access to the signed-in hosted account is
currently unavailable; local synthetic-account QA is not a substitute for it.
Local security advisors also report five existing unrelated errors: the
`source_health` definer view and RLS-disabled `spatial_ref_sys`, `price_history`,
`scraper_runs`, `source_url_cache`. These need scoped review, not blind RLS changes.

### October 14 Release And Inventory Integrity

- #406 merged to `9539614a2fa61c59f744bc23ec186307a0e9f9cd`; its tested code tree
  matches main. Clean browser matrix: 441 passed, 15 expected platform skips,
  zero failures or flaky tests. Production Discover recovered for the actual
  Dealer account with a disclosed 2,000-vehicle recent preview; full Scan remains.
- Hosted guest QA then caught Sentry Replay's CSP-blocked blob worker. #408
  merged to `23da711ff6d79462cb06ba3be0a46d738b81ffe7`, exact-head CI green,
  Vercel production `dpl_7L95XF2CwdG5hqHozH2Skr6eRpPP` READY and canonical alias
  verified. It serves the installed SDK worker from the same origin, preserving
  compression/privacy and the unchanged CSP. All 27 hosted guest browser checks
  and 20 release-smoke checks passed afterward. Local worker protocol checks:
  9/9 across Chromium/Firefox/WebKit and phone/tablet/desktop sizes.
- Direct source checking found one concrete price/gallery conflict: Kona VIN
  `KM8HF3AB3VU504430`, captured amount $4,545 versus source-advertised $28,734,
  captured one photo versus 18 in the original gallery. One optimistic, audited
  maintenance update added existing `priceEvidence.kind=unknown` plus source
  review provenance. Vehicle, raw amount, first/last-seen timestamps, previous
  options and saved research remain. The actual live detail page now states the
  conflict and withholds value/profit assessment. No rows deleted or quotas reset.
  Raw upstream cause and complete gallery capture are still unresolved; do not
  infer a parser defect, full-source permission or an outcome from this sample.
- Rescore follow-up corrects non-existent cost/timestamp columns, carries source
  pricing and location evidence into analysis, preserves evidence with the score,
  and rejects unverified/payment/reference amounts from actionable math. API and
  CLI share a schema-compatible update; optimistic guards prevent overwriting
  newer collector changes. Failed/conflicting writes are counted, not silently
  called success, and admin receipts distinguish partial results from unknown
  completion. Focused regressions pass; exact merge/live receipts belong in its
  PR. No full hosted rescore was run. Budget and independently reviewed database
  rollout gates still apply; an unbounded bulk rescore is not free-tier-safe.
- The previous capacity, retention review, source permissions, all-role hosted
  delivery, actual-sale accuracy and physical-device performance gates below
  remain open. `decisionReady=false` is still the production result. These releases
  are progress, not certification of every feature or an elite launch.

### End-To-End Follow-Through (October 13, Late Evening Chicago)

The current integration is [PR #406](https://github.com/Lead-Agent-69/MikeHunt/pull/406),
including main through #407. Its exact merge, deployment and final browser results
belong in the PR receipt; this section does not turn pending work into a live claim.
Older dated sections below remain historical evidence.

**Implemented and verified locally:**

- Tablet research-header overflow, mobile identity/price-first cards, compact
  Discover filters/insights and honest indexed-inventory wording.
- Supplementary vehicle actions and install/update notices in document flow;
  navigation clearance, stable comparison clicks and no speculative search-link
  prefetch. Existing tools, original-source links and buyer modes are preserved.
- Shared form readiness prevents the first controlled edit disappearing during
  hydration. Deal Check identifies manual amounts instead of claiming AI read them.
- Service-worker failures resolve to valid responses; cached icons/image fallback
  and background cache-write failures are handled. Private HTML/API data is never
  moved into the offline cache.
- Purchase-checklist preloading waits for the confirmed non-flip account and handles
  speculative failure. A real Firefox NetworkError was traced to that preload.
- Hosted Discover's 10,000-row RPC hit PostgreSQL `57014` (statement timeout).
  A 2,000-row pull completed in 1.946 seconds. Discovery is now an explicitly bounded
  recent preview, including capped/empty-result copy; full paginated Scan remains.
  Raw cap evidence survives photo/freshness filtering. This is not whole-inventory
  recommendation ranking or a measured production-latency guarantee.
- Marked, bounded local freshness fixtures do not retime original or hosted rows.
  React `.test.tsx` files under `app` are included in the full verification gate.

Full gate at `8898ebf` passed 3,868 tests in 587 files, typecheck, lint (zero errors)
and production build; exact-head CI `38511360915` passed. Local evidence includes
35/35 first-glance checks across five desks/seven browser configurations, 14/14
auth flows, six freshly onboarded local fixture accounts, and 195/195 route/layout
checks. The broad 456-case run passed 438, skipped 15 non-iOS install cases and
failed three mobile comparison assertions at `43.999969px` versus a 44px target.
The existing two-decimal measurement convention now covers those checks; the
clean final matrix is pending in the PR. Do not call that earlier run all green.
External image/resource noise exclusions mean these tests do not certify every
source photo, network request or physical-device FPS.

**Actual hosted evidence, one existing Dealer/team account:**

- Unchanged MO home save succeeded and MO survived reload. Existing buying
  preferences saved successfully. Contact fields, coordinates, notification
  subscriptions, admin privileges and buying mode were not changed.
- The existing Saved Bronco's photo decoded; its lightbox and close control fit
  768x1024, 390x664 and 1440x900. Only one photo is captured from that source;
  source gallery completeness remains unproved. Other user identities, actual
  provider/recovery logins and delivered alerts remain separate hosted gates.
- `/api/push/status` returned `configured=true`. Vercel and Zeus have a matching
  VAPID pair stored outside Git. Configuration is not device receipt. Resend
  sender/webhook credentials and actual email/push delivery remain unverified.
- Read-only SQL returned database size 163,867,795 bytes. Both legacy deletion
  jobs remain inactive; market aggregation remains active. Protected prune and
  storage-measurement RPCs are absent. No cleanup, migration or grant was applied.

**Capacity and remaining priorities:**

- Supabase Free, cycle September 28-October 28: visible database usage 36%,
  uncached egress 28%, storage zero, eight MAU. Billing usage is delayed and its
  size view is distinct from the instantaneous SQL measurement. The local worker
  retains F-drive cache/log/profile binds, bounded Docker logs and ample disk;
  runtime data is not tracked in Git. Local disk never extends hosted quotas.
- Vercel Hobby, last-30-days view: Functions Storage 9.43/10 GB, deployment storage
  3.11/10 GB, active CPU 1h11m/4h, invocations 59k/1M. Function storage is GB-months,
  not instantaneous disk. Explicit approval was requested for project-only shorter
  deployment retention; no deletion or paid upgrade occurred. Retention reduces
  future storage, not already accrued usage. Preserve the production alias and
  rollback exceptions. [Storage](https://vercel.com/docs/deployment-storage) and
  [retention policy](https://vercel.com/docs/deployment-retention).
- Commercial launch remains incompatible with Hobby's personal/noncommercial
  restriction, independently of usage. Do not silently upgrade a paid plan.
  [Hobby policy](https://vercel.com/docs/plans/hobby).
- Security linter refresh: one error (`spatial_ref_sys` RLS), 12 warnings (three
  public extensions, two public photo-bucket listing policies, six PostGIS definer
  execution notices, leaked-password protection) and seven informational notices.
  Review extension dependencies and bucket access before applying changes; the
  advisor is not clean. Leaked-password protection is Pro-only.
- Finish #360's independent exact-head review and protected migration first, then
  hosted dry-run/reference-survival/restore checks. Keep legacy cleanup parked.
  The old CI scraper workflow is parked too; its client-side pruning is not a
  replacement for transactional reference protection and must not be resumed.
- Verify permitted-source yield, complete/decodable photos, advertised-price
  meaning and dedup conflicts before expanding collection. Preserve the worker's
  1,000-insert safety stop; do not fabricate freshness or bypass permission gates.
- Prove regional valuations/repair/fee assumptions against dated, held-out actual
  sale outcomes. The asking-price proxy backtest is explicitly not transaction
  accuracy; `decisionReady=false` remains the last recorded production result.
- Complete hosted all-role account/permissions/alert checks and cross-network,
  physical-device performance. Prior hosted API sampling had resets/timeouts;
  successful-response percentiles alone are not acceptance evidence.

- **Implemented** means code exists, not that the hosted feature works.
- **Merged** requires a main SHA; **live** requires a matching deployment receipt.
- **Accepted** additionally requires the actual user journey, negative/error cases
  and the relevant source/device/data evidence. Green CI alone is insufficient.
- Refresh every PR before landing. Squash merges and later fixes can supersede
  old patches; an open PR is not proof that its feature is missing.
- No broad dependency merge, paid upgrade, restricted-source bypass, quota reset,
  inferred permission or weakening of GO thresholds is part of this checklist.
- Admin privileges remain separate. Expanded buyer tools remain free with no
  payment required. Do not restore Listing Manager, Finance or Bulk screens.
- Owner records/history must survive source disappearance and cleanup. A local
  1 TB disk does not extend Supabase or Vercel limits.

## Confirmed Baseline And Current Work

Latest completed consolidation release: #370 merged as `a102e514` and canonical
Vercel production was verified READY at that SHA. Full local verify passed
533 files / 3,279 tests; GitHub CI and 20 public smoke checks passed. #318 closed
as confirmed superseded. Local buyer-mode checks passed 28/28. Hosted scope
columns already existed; only the local test database needed the existing
saved-search migration, after which desktop/mobile save checks passed 2/2.
The older snapshot bullets below remain point-in-time evidence.

- Current observed main: `425b40de093ad86d5f2ec935839c78fb96bf42c4` (#369).
  Vercel commit status reports success; signed-in/device acceptance is separate.
- #355/#356 already address condition wording, galleries and overlays.
  #357-359 preserve buyer scope, refresh counts and real location attribution.
  #361 separates auction reference values from purchase prices.
- #362 unifies cards and evidence-first detail; #364 restores scoped dealer
  coverage; #365 adds measured free-tier planning; #366 expands Missouri to
  17 anchors and nine Craigslist regions; #367 makes source readiness truthful.
  These are merged capabilities, not proof of full geographic coverage.
- The other active task, **Audit app end to end**, reports an idle local collector
  rollout and preserved quota/cache state in #367. That is not a remote Zeus
  rollout or proof that every source produced fresh listings. Its #369 payment
  disclosure work has now merged; full device/data acceptance remains open.
- #368 is pushed at `970fb9c`; GitHub build-and-test passed. It incorporates #351
  without reverting newer delivery tracking; full local verify passed 537 files /
  3,287 tests and build. Ren review, deployment and actual delivery remain open.
- This integration pass ports May's #318 install prompt to current main, adds
  actual React interaction tests, suppresses it on buying/auth screens, preserves
  dismissal, and records installation only after appinstalled. Full release
  receipts must be added after verification; do not close #318 before merge.
- Local browser evidence: anonymous Scan with a simulated install event at
  320/390/768/1440 light preference and 320/390 dark preference; banner height
  70 px, no document overflow, 44 px dismiss target and Escape passed. Six
  screenshots remain local under artifacts/qa-consolidated-install-2026-10-11.
  This is not signed-in QA, proof of all themes or real-device installation.
- CLI access to MikeHunt already works. Supabase project
  `qupzqpezslsbobhugswp`; Vercel project `mikehunt`. The Codex Supabase connector
  denial does not mean CLI access is unavailable.

## Finish In This Order

### Vendor Badge Integration (October 12 Follow-Up)

- #363's six-file vendor identity change is integrated on current main in a
  fresh branch rather than merging its older dependency tree. Discover and Saved
  now use the shared badge alongside the existing detail/shared card/table users.
- Badge links are native, touch-sized, separately named original-listing actions
  above the card navigation overlay, not nested links. Known source hosts select
  the vendor name; lookalike hosts never receive official artwork. The original
  local Craigslist favicon is retained; other vendors use a neutral store icon.
- Review found that hostname-only Craigslist classification could turn dealer
  ads into Private badges. Dealer/owner listing sections now determine that
  channel; an unclassified Craigslist hostname alone does not prove private sale.
- Forty-three focused tests passed, including actual Discover/Saved markup,
  channel attribution, unsafe URL rejection, event separation and image fallback.
  Full verification, CI, exact deployment and public smoke receipts belong to
  the integration PR. Browser inventory remains empty, so visual acceptance is
  still separate; no source collection, pricing or database changes are included.

### Release Reconciliation (October 12, Afternoon Chicago)

- #380 source-outcome receipts merged at `e57bb5e`; #381 detail hierarchy and
  original vehicle-title preservation merged at `46a07a0`. The heading and long
  alternatives findings recorded below are now closed by that implementation,
  not missing features. Heavy-duty truck alternative matching remains open.
- #382 filter disclosure/reset polish merged at
  `b6bd0c42339cbfdcab1dcde27d8e0cf1612a94ae`. Canonical production resolves to
  READY deployment `dpl_5qtEuKZFGwaF5tqBmvWdiqKzxyMC`; all 20 public smoke checks
  passed. Local verification passed twice: 557 files / 3,552 tests, typecheck,
  lint (zero errors / 228 existing warnings), and production build. CI run
  `38310207160` passed. All existing filter fields and buyer-mode contracts remain.
- Browser inventory returned no apps or browsers during this follow-through.
  Fresh signed-in, touch/keyboard and theme screenshots are still unverified;
  earlier October 12 browser receipts are historical, not repeated acceptance.
- Current follow-up removes raw source-readiness fallbacks from the Scan/Market
  table. Customer copy reports saved listings, photo evidence and latest listing
  observation; missing evidence is not fabricated as zero or a successful scrape.
  Twenty-six focused tests passed. This entry is implementation evidence, not
  a deployment receipt; record the exact merge and deployment in its PR.
- #363 vendor identity remains draft pending current-main integration and visual
  checks. #360 retention still needs review of hosted migration prerequisites and
  rollback; do not blanket-merge the queue or push every local migration. Admin
  positive-login, real alert delivery and validated sold comparables remain gates.

### Curated Source Outcomes (October 12 Follow-Up)

- #377 is merged at `b2e572fc23aacf2ee935fdb93381c23f25837054` with successful
  CI. Signed-in and deployed acceptance receipts remain separate from that fact.
- This follow-up records bounded, restart-persistent per-host outcomes in the
  collector's operator-only status: running, accepted records, no accepted
  records, policy/robots blocked, failed/timeout, and cancelled. Requested state
  context is retained without user identity, search text, credentials or URLs.
- Zero adapter writes are not proof of no matching inventory. Matching inventory
  stays unknown; adapters can deduplicate, cache or internally recover failures.
  Running attempts remain unfinished after interruption. Older completions cannot
  replace newer attempts. Budget-deferred sites retain their previous outcome.
- Outcomes are local operator evidence, not a public vendor-health claim or
  independently verified city coverage. Persistence is bounded to 500 hosts and
  atomic within the single collector process. Multi-process writers to the same
  journal are unsupported. Existing permissions, robots gates, scope, rotation,
  quotas and database retention remain unchanged.
- Rollout requires full checks and exact-head review. Preserve all mounted cache
  and quota files when updating the idle collector; never launch a scrape or reset
  its daily quota just to populate the new status. No hosted migration required.
- Independent review caught a dealer-CMS receipt bug: parsed rows were returned
  instead of the pipeline's accepted count. The adapter now returns the actual
  upsert receipt; regressions cover zero/partial acceptance, empty parses and
  failed writes. Full verification passed 557 files / 3,545 tests, typecheck,
  lint (zero errors, 228 existing warnings), and production build.

### Fresh Hosted And Browser Evidence (October 12)

- Supported CLI `supabase migration list --linked` successfully read hosted
  history. The primary checkout and hosted history differ; reconcile approved
  migration chains before rollout, not with a blanket push/repair. The #360
  retention migration is not in the returned hosted history, and #360 still has
  no recorded PR review. CLI access is not a successful security-advisor receipt.
- #377's main SHA has a successful Vercel deployment status. Canonical production
  passed all 20 public smoke checks. A gentle five-request-per-endpoint guest
  sample returned 200 for UI-sized deals, default deals and map; observed medians
  were 316, 294 and 319 ms respectively. This small sample is not a buyer p95/SLO.
- The connected in-app browser now has a working personal session. Discover
  showed 784 Missouri listings before filters and 276 matches. Saved connected
  and retained its device backup; Purchase plan showed a truthful empty state.
  Admin redirected the personal session to Discover. No admin session or role
  elevation was fabricated; populated account mutations remain to be accepted.
- Real PWA update refreshed without losing the session. Dark/System/Light
  controls changed state; the original Dark preference was restored. Mobile
  location search and Escape dismissal worked without changing markets or
  starting a collection run. A real detail rendered without horizontal document
  overflow at 320/390/430/768/1440; browser warnings/errors were empty in this pass.
  Local screenshots and guest latency evidence are under
  `C:/MikeHunt/artifacts/qa-foundation-2026-10-12` (not committed).
- Remaining detail QA: Discover's `2015 Chevrolet SILVERADO 3500HD WT` becomes
  `2015 Chevrolet Silverado` in the detail heading; preserve the known variant
  and examine whether alternative matching distinguishes truck families. The
  390px detail is still about 3,224px tall with six alternatives before examination
  sections; compact the alternatives without removing evidence. These are open
  findings, not claims that the entire UI audit has passed.

### Exact Saved Membership (October 12 Follow-Up)

- Release follow-through found and reproduced two refresh-recovery gaps: cached
  empty results hid a failed refresh, and complete collections had no retry after
  refresh failure. Those now surface a real error or retain loaded records with
  a working retry regardless of whether older pages remain. Connection copy no
  longer claims ready while a collection refresh is failing. New regressions
  preserve both empty and nonempty recovery expectations.

- Follow-up implementation adds owned 50-row cursor pages for Saved and the
  personal/parts Purchase plan. Date plus ID provides stable tie-breaking; legacy
  null dates have an explicit continuation. Read-time desk redaction is retained.
- Watching, passed and archived saves are no longer omitted from Saved's groups.
  Device copies are described as backups, not assumed local-only while only part
  of the account collection is loaded. Older-page errors retain loaded vehicles
  and offer a retry. No records are deleted or migrated.
- Fleet preloading uses the same owner-scoped page key; edits/deletes include
  X-Save-Owner and pending responses cannot update a newly switched account.
  Tests cover a 603-record tied-date fixture, null dates, redaction, invalid cursors,
  wrong-account empty receipts and retry recovery. Hosted large-account acceptance
  remains separate; no bulk hosted fixtures or SQL writes were performed.

- Detail membership now queries the viewed vehicle inside the verified account,
  before a one-row limit. Saves older than the newest 500 remain recognizable
  without transferring a whole collection or snapshot JSON.
- The read checks X-Save-Owner against the verified session, and returns an
  owner/vehicle receipt even for an empty result. The browser rejects mismatched
  receipts and caches by account plus vehicle. An unavailable database is an
  error, not a false "not saved" result; requests have a 15-second deadline.
- No schema, hosted SQL, retention, Docker or provider configuration changes.
  Legacy array API responses remain compatible; the buyer collection workflows
  now use verified envelopes rather than the older global checklist cache.
- Account-handling changes require exact-head Ren review before merge/live.
  Record verification and PR receipts separately; implementation is not release.

### Saved-Search Matching And Bookmark Follow-Up

- Reproduced in code: collector matches ignored stored state, seller, title and
  lane criteria; missing years/prices/coordinates could bypass constraints.
  The profit-sniper route read location_state instead of the saved state field
  and considered paused searches. Both now use one evidence-based matcher.
- Exact Scan scopes remain device bookmarks and are labelled Save search, not
  Save alert. They retain all current parameters; storage errors are actionable,
  identities are unique, and the 40-search limit no longer silently evicts older
  searches. Device bookmarks no longer have misleading Pause/Resume controls.
- Browser QA also found Save/Copy hidden inside collapsed filters. Both now sit
  in the visible scope-summary row, including when indexed matches are empty.
  The Government option is labelled Government auctions, matching its scope.
- New account searches do not automatically opt into email. Delivery remains
  requested, not certified; no credentials/provider or SMS activation is included.
- No schema or hosted SQL change. Complete Scan filters cannot yet synchronize
  to the account without reviewed storage/matcher migration work. Do not silently
  reduce a full bookmark to the account table's limited criteria.
- Collector matching changes require the operator's reviewed image rebuild;
  merging/deploying the web app alone does not make remote Zeus use this code.
  The collection quota state and existing Docker deployment remain untouched.
- Regression/browser/CI and production receipts must be recorded for this lane.

### Account Saved-State Follow-Up

- Reproduced: a saved vehicle remained in the owned API and Saved page, but
  its detail button lost the Saved label on a fresh device. This was a label
  hydration defect, not lost saved data.
- Current change: detail reads the existing bounded, snapshot-free checklist
  endpoint with an owner-scoped SWR key. Logout/account changes cannot inherit
  another account's cached badge. Device backups are labelled "Saved on device".
  Confirmed saves update membership without making a failed refresh look like
  a failed save; requests preserve the existing X-Save-Owner guard.
- Tests cover fresh-device hydration, account switch/logout, late responses,
  unavailable/malformed reads and confirmed saves. The browser test now checks
  canonical deal links, owned API persistence, reload and no device backup,
  instead of relying on the source's unnormalized vehicle title.
- Scope: no schema, hosted SQL, scraper activation, paid service or retention
  change. Full account saved-search filter persistence and real alert delivery
  remain separate acceptance items; Scan's complete-filter save is device-local.
- Acceptance: full local verify passed 534 files / 3,297 tests and the production
  build; 60 signed-in desktop/mobile browser checks passed across personal,
  parts, reseller and dealer accounts. Saved labels survive deleting device
  backups and reload. Width checks at 320/390/768/1440 had zero horizontal
  overflow; screenshots remain local in artifacts/qa-account-saved-2026-10-11.
- Limits: the existing checklist endpoint returns at most 500 saved records;
  pagination/exact membership for larger accounts remains follow-up work. The
  local source-photo fixture did not render its external image, so this receipt
  does not certify photo loading, additional-photo ingestion or live galleries.
- Main/production release receipts must be recorded after CI and deployment.

### Search-Reach And Workflow Review (Current Implementation)

Official benchmark pages reviewed October 11:
[market filters](https://visor.vin/search/filters),
[auction search and watchlists](https://www.copart.com/content/us/en/support/faq-topics/searching-1),
[outbound filter parameters](https://www.autotempest.com/widget-large).
These are internal reference material, not customer-facing comparison copy.

- Implemented in the current branch: replace benchmark-product shortcuts with
  existing supported marketplace search links. Preserve real ZIP/radius using
  the same parsing contract as indexed search; disclose unsupported location,
  title, damage, category, profit and other filters per destination.
- Show three marketplaces initially and keep the rest under one disclosure.
  Distinguish omitted filters from unconfirmed parameters and rounded distance.
  Exclude unverified formats, incompatible vehicle types and inappropriate
  dealer-only links for private-seller searches. Keep actual listing provenance.
- These links do not fetch pages, activate scrapers, call paid APIs, increase
  hosted writes, or prove new stored inventory. Productive source expansion still
  requires the ownership/retention/capacity and permission gates below.
- Next: save/reopen the complete filter contract, VIN/lot identity search parity,
  watchlist badge hydration across sessions, population-backed facets and a
  consistent total-landed-cost comparison. Existing raw-title Save E2E assertions
  need canonical identity checks; they are not proof that the save failed.
- Rich specification, local/seasonal and liquidity claims require observed fields,
  eligible dated comparisons and outcome samples. Do not add empty filters or
  invented MSRP/repair costs just to match a competitor's controls.
- Inventory priority: improve measured yield/completeness at already-permitted
  independent yards and public/API sources first; then permission-based regional
  dealer intake and authorized marketplace feeds. No new restricted-source bypass
  or unlimited/free third-party API assumption.

This pass needs its own full verify, browser checks, CI and release receipt.
It does not close the remaining acceptance items below.

### 1. Protect Ownership And Release Operations (P0)

- [ ] Obtain exact-head Ren review for #360 and sensitive security changes.
      Apply the reviewed retention migration before its dependent web rollout.
- [ ] Verify all six owner references: Saved, watchlist, inventory, outcomes,
      dealer purchases and alert matches. Prove unavailable Saved survives pruning.
- [ ] Replace/disable the two unsafe legacy deletion jobs through the approved
      change path. They were active on inspection; no pause or migration is claimed.
- [ ] Verify hosted migration history, grants, RLS and authorization against the
      dependency queue. Repair failed checks on current main before any merge.
- [ ] Recheck advisor findings, hosted password minimum 12, compromised-password
      protection eligibility and owner/admin isolation. Never blindly move extensions.
- [ ] Capture Vercel/Supabase monthly usage and growth; unknown is not zero.
      Vercel Hobby was confirmed active, but commercial-use eligibility remains open.
- [ ] Confirm production branch main, deploy exact tested SHA, smoke canonical
      routes, record rollback and monitor a complete scheduled cycle.
- [ ] Keep Sentry release health/noise triage, scraper alerts and admin audit
      history observable without exposing customer data or credentials.

Exit proof: Saved survival, reviewed migration receipt, denied cross-owner/admin
requests, current usage evidence, deployment SHA and rollback/restore receipt.

### 2. Make Prices And Intelligence Trustworthy (P0/P1)

- [ ] Accept #369 end to end: down payments/monthly payments are not asking prices or
      under-budget matches. Preserve real disclosures even when VIN already exists;
      suppress stale profit/ROI and exclude payment teasers from valuation samples.
- [ ] Reconcile VIN exact dedup, fuzzy candidates and conflicting VINs without
      silently merging distinct cars. Validate year/price/mileage before scoring.
- [ ] Preserve listing source/id/URL, fetch time, access basis, scraper version,
      price observations and field-completeness evidence.
- [ ] Reconcile sold-vs-ask-vs-final-bid, make/model/trim/year/title/condition,
      region and recency eligibility. A disappeared listing is not a verified sale.
- [ ] Wire local comparison, recency, condition and photo confidence consistently
      across card/detail/Compare/alerts/Plan; no circular ask-based market fallback.
- [ ] Verify distance math, same-state aggregates and landed cost. Label seasonal
      heuristics separately from measured historical/local patterns.
- [ ] Keep repair parts/labor baselines as ranges and distinguish editable
      assumptions from real inspection/quotes. Photos cannot prove roadworthiness.
- [ ] Validate holding/liquidity estimates with actual dated outcomes; expose
      sample counts and uncertainty, not invented sale speed or guarantees.
- [ ] Rescore bounded batches after reviewed changes, report GO/HOLD/PASS/unknown
      counts, embedding freshness and outcome holdout results under real traffic.
      Do not claim >=0.9 precision or change GO thresholds without evidence/decision.

Exit proof: source-disclaimer fixtures, unlike-comp rejection, consistent
evaluation version/cost basis and dated outcome metrics with sample sizes.

### 3. Finish Cohesive Buyer Workflows (P1)

- [ ] Personal, DIY, parts, reseller and dealer onboarding must save/reload home,
      ZIP/radius, additional markets, body type, budget and title/repair tolerance.
      Server preferences win over stale local state; save failures remain recoverable.
- [ ] Discover -> evaluate -> Save/Compare -> Plan is primary; Deal Check remains
      secondary/contextual, and operations remain admin-only.
- [ ] Cards expose identity, price basis, mileage, title/condition, location,
      vendor and freshness at a glance. Whole-card deep links never hijack Save,
      Compare, disclosures or keyboard interactions.
- [ ] Verify full photo evidence/gallery from permitted source detail, including
      sources with one stored image; do not fabricate extra photos.
- [ ] Audit bottom bars, recommendation nudges, install prompts and dialogs
      together so no essential fact/action is occluded.
- [ ] Combine Back-scroll restoration, paging/windowing and map batches; retain
      all filters and vehicle context on Discover/Search/Map/Swipe/Back.
- [ ] Verify populated Saved/Compare/Pipeline mutations, duplicate save,
      cross-device sync, stale/unavailable snapshots, errors and retry.
- [ ] Verify native links and meaningful empty/partial/error states for every
      exposed tool. Do not remove a useful capability just to reduce the menu.

Exit proof: signed-in populated role journeys and negative owner/admin tests,
320/390/430/768/1440 light/dark screenshots, keyboard/focus and no overflow.

### 4. Prove Alerts And Accounts (P1)

- [ ] Review/land #368, then retire #351 as confirmed superseded.
- [ ] Configure matching VAPID keys/subject only through explicit approved setup;
      never log keys or place private keys in NEXT_PUBLIC variables.
- [ ] Configure authorized Resend sender/webhook secret and verify delivered,
      bounced, opt-out, duplicate prevention and destination links.
- [ ] Prove a real device subscribe -> provider acceptance -> receipt -> tap ->
      correct deal, including installed PWA cold start and expired subscriptions.
- [ ] Verify saved-search columns/grants, criteria persistence, feedback,
      precision/recall and instant-vs-digest behavior without alert overload.
- [ ] Test account confirmation/recovery valid/expired/reused callbacks, browser
      restart, token refresh, logout and cross-tab/session restoration on mobile.
- [ ] Verify install prompt dismissal/installation and offline/update recovery
      on a real installed device. Install engagement helper existence is not proof
      that all Save/alert callers dispatch it.

Exit proof: actual delivery receipts, matching owned deep links, persisted
settings and real browser/device recovery. No fake email or delivery claim.

### 5. Grow Permitted Inventory Reliably (P1)

- [ ] Reconcile official eBay Browse/GSA adapter status and licensed sold-feed
      eligibility. GSA_API_KEY exists in Vercel; worker readiness still needs proof.
- [ ] Activate only permitted, compatible sources under real quota/storage gates.
      Facebook/IAA/ACV/ADESA/Manheim require verified access, not stealth bypass.
- [ ] Verify shared JSON-LD/CMS parsers, Damage.com yield and D&G pagination with
      actual accepted/stored records. Query anchors are not municipal coverage.
- [ ] Complete source terms/robots review, per-domain cooldowns, delta/ETag
      handling, partial/full scan semantics and safe retirement.
- [ ] Verify job-level HTTP/timeout/parse logging, soft-block/schema drift alarms,
      last-good pull/yield/freshness, breakers, DLQ review/replay and release stamps.
- [ ] Record real yield/completeness/dedup per source and city. External
      AutoTempest/Visor handoffs are not automatically ingested inventory.
- [ ] Pursue dealer networks, public feeds and phone/FB-only dealer outreach
      through permission-based intake. No-terms and Dealer.com enablement stays gated.
- [ ] Separate the already reported local collector from remote Zeus. Follow
      operator-only Zeus instructions; preserve volumes, cache, quota counters and
      source gates. Never reset limits to force another sweep.

Exit proof: permission/access receipt, exact deployed worker image, productive
run counters and fresh valid listings by source/state/city.

### 6. Capacity, Archive And Performance (P1/P2)

- [ ] Verify actual persistent storage mount/free disk, growth and bounded logs/
      Redis; protect buffered records and owner snapshots from cache compaction.
- [ ] Prove checksummed permitted cold archive, replay/idempotency, off-device
      backup and restore. Local disk capacity alone is not durability.
- [ ] Measure API payload/query timings and LCP/INP/CLS before/after optimization.
      Prioritize SQL totals/facets, paged feed/Saved, coalesced reads and idle polling.
- [ ] Bound background jobs/alert batches, remove measured N+1 reads and avoid
      repeated embedding/scoring/model work. AI provider budgets are separate.
- [ ] Keep private responses isolated from public caches. Measure photo proxy/
      image-transform/egress use; obey source permissions for retained photo bytes.
- [ ] Keep #165 parked; apply only scoped tested security pins. Historical lint
      counts/advisories are not current receipts.

Exit proof: fresh quota snapshot, trend/runway, Saved restoration and measured
performance without lost buying facts or unapproved billing.

## Agent Queue And Dependencies

This grouping records the prior team's work, not authorization to message those
tasks or a claim that any specific agent is active here.

| Lane                              | Work to reconcile                                                                      | Dependency / gate                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Ren / security                    | #360, #368, #349, #350, #342; #275 -> #279 -> #281; #310                               | Exact-head review; hosted prerequisites and negative authorization tests            |
| Amy / operations                  | #311 -> #335, #296 -> #309 -> #314 -> #323 -> #327; deployment/apply receipts          | Diff current main, repair failed checks, reviewed SQL before dependent rollout      |
| May / alerts and cards            | #318, #351 -> #368, #317/#349, #295, #278, #200, #352                                  | Preserve existing tracking/free policy; provider/columns grants and actual journeys |
| Sara / UX and scale               | #343/#344/#345, #326, #284, #283, #222/#224, #208                                      | Draft/failed checks and combined desktop/mobile/Back acceptance                     |
| Eva / valuation                   | #264 -> #268 -> #276; #316 -> #324 -> #331; #262; #303/#304/#305; #254 -> #266 -> #267 | Sold evidence and migration dependencies; never substitute asks/bids                |
| kera / enrichment and performance | #330 -> #347, #348; paging/CLS/JS/background SQL work                                  | Actual VIN refresh/retry guards and measured performance                            |
| elle / coverage                   | #277 -> #288, #280, #271, CMS/JSON-LD/dealer yield                                     | Terms, field validation, quota and source-specific productive-run evidence          |
| Integration / integrity           | #336, #307 -> #333/#312, #332, #334/#313, #338/#337, #290/#321, #363, #369             | Preserve newer main; current review, base-chain and source-policy gates             |

SHY Android/FPS, elevated Mig Verify and cloud agents remain outside this cars
release. Do not silently fold unrelated repository work into this task.

## Complete Open-PR Snapshot

67 open PRs in the fetched snapshot. Check statuses can become stale;
SUCCESS is not merge permission, hosted apply proof or live acceptance.
Review history was inspected separately: #360/#368 had no review. Comments for
#316/#324 refer to historical Ren sign-with-nits; subsequent nits/dependencies
still need verification, not blanket approval of the current queue.

| PR                                                         | Work                                                                                                                                                                                       | Head      | Base                         | Draft/check snapshot |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------------------------- | -------------------- |
| [#368](https://github.com/Lead-Agent-69/MikeHunt/pull/368) | Harden alert delivery and quota-aware buyer recovery                                                                                                                                       | `970fb9c` | `main`                       | Open; SUCCESS        |
| [#363](https://github.com/Lead-Agent-69/MikeHunt/pull/363) | Make vehicle vendor badges truthful and actionable                                                                                                                                         | `000688d` | `main`                       | Draft; SUCCESS       |
| [#360](https://github.com/Lead-Agent-69/MikeHunt/pull/360) | Protect saved vehicles and bound scraper storage growth                                                                                                                                    | `19b483d` | `main`                       | Open; SUCCESS        |
| [#352](https://github.com/Lead-Agent-69/MikeHunt/pull/352) | docs: monetization architecture (free by design)                                                                                                                                           | `38a8f56` | `main`                       | Draft; SUCCESS       |
| [#351](https://github.com/Lead-Agent-69/MikeHunt/pull/351) | fix(push): tapped alerts open the right deal; honest Enable alerts (server check + test send)                                                                                              | `76c3cc1` | `main`                       | Draft; Not recorded  |
| [#350](https://github.com/Lead-Agent-69/MikeHunt/pull/350) | security(deals): no seller identity for guests/non-flip on /api/deals + /api/deals/[id] (Ren P2 on #328, stacked on #328, needs Ren SIGN)                                                  | `2ae00cb` | `main`                       | Open; FAILURE        |
| [#349](https://github.com/Lead-Agent-69/MikeHunt/pull/349) | security(db): saved-search grants + bounds (20261010151000): anon out, inbox SELECT-only, column-limited writes, CHECKs, 50/user cap (Ren live hole, stacked on #339, needs Ren SIGN)      | `78bc30c` | `main`                       | Open; SUCCESS        |
| [#348](https://github.com/Lead-Agent-69/MikeHunt/pull/348) | test(db): Ren #325 nit — vitest asserts plant 18                                                                                                                                           | `d8c5b1c` | `main`                       | Open; SUCCESS        |
| [#347](https://github.com/Lead-Agent-69/MikeHunt/pull/347) | fix(vin): Ren #330 sign nits — 180d full refresh, 3-attempt cap → n/a (migration 20261010401000), fetchObservedPrices timeout                                                              | `3316e16` | `kera/vin-enrichment-nits`   | Open; SUCCESS        |
| [#345](https://github.com/Lead-Agent-69/MikeHunt/pull/345) | perf(map): chunked addLayers for 3k+ pins; verdict-majority cluster bubbles                                                                                                                | `9733978` | `main`                       | Draft; FAILURE       |
| [#344](https://github.com/Lead-Agent-69/MikeHunt/pull/344) | feat(lists): Back from a deal restores scroll + loaded pages on /feed, /saved, /scan                                                                                                       | `372d1c1` | `main`                       | Draft; SUCCESS       |
| [#343](https://github.com/Lead-Agent-69/MikeHunt/pull/343) | perf(scan): window /scan card grid with @tanstack/react-virtual; keep measured heights across Back                                                                                         | `1ebd970` | `main`                       | Draft; SUCCESS       |
| [#342](https://github.com/Lead-Agent-69/MikeHunt/pull/342) | security(images): gate /api/image/proxy by source access class — no proxied bytes for needs_permission/restricted/operator_override (needs Ren SIGN)                                       | `eb595e4` | `main`                       | Open; SUCCESS        |
| [#338](https://github.com/Lead-Agent-69/MikeHunt/pull/338) | fix(capture-audit): #322 review follow-up — Craigslist/Facebook photos direct only (off /api/image/proxy), Copart trim cap                                                                 | `7fe1e5d` | `main`                       | Open; SUCCESS        |
| [#337](https://github.com/Lead-Agent-69/MikeHunt/pull/337) | fix(ebay-sold): #320 follow-up — honest client, guard migration 20261010510000, ebay in SOLD_SALE_CHANNELS (needs Ren SIGN)                                                                | `b982a54` | `main`                       | Open; FAILURE        |
| [#336](https://github.com/Lead-Agent-69/MikeHunt/pull/336) | Harden production inventory integrity and scraper recovery                                                                                                                                 | `78e884f` | `main`                       | Draft; SUCCESS       |
| [#335](https://github.com/Lead-Agent-69/MikeHunt/pull/335) | test(net): Ren #311 nit — untilAborted's p.catch is load-bearing (test-only, stacked on #311)                                                                                              | `23aefe3` | `amy/ren-fetch-bounds-nits`  | Open; SUCCESS        |
| [#334](https://github.com/Lead-Agent-69/MikeHunt/pull/334) | fix(feed): Ren #308 nits — seller name only for non-flip desks, per-user feed limit (stacked on #308)                                                                                      | `e10c06a` | `main`                       | Open; SUCCESS        |
| [#333](https://github.com/Lead-Agent-69/MikeHunt/pull/333) | fix(dedup): Ren #307 nits — conflict rows cleared, one VIN key, converging fuzzy pass, get_market_pulse service_role only (20261010221000, stacked on #307, needs Ren SIGN)                | `65fc4af` | `dq/cross-source-dedup`      | Open; FAILURE        |
| [#332](https://github.com/Lead-Agent-69/MikeHunt/pull/332) | fix(data-quality): Ren #306 nits — rescore skips flagged rows, lock_timeout in 210000 (stacked on #306, needs Ren SIGN)                                                                    | `086383e` | `main`                       | Open; SUCCESS        |
| [#331](https://github.com/Lead-Agent-69/MikeHunt/pull/331) | fix(sold): #324 sign nits — attribution ~ '\S' (20261010412000), normalized-definition self-check, scrubbed gov titles, GovLane href check, one sale_channel list                          | `db6fd08` | `feat/sold-comps-followup`   | Open; FAILURE        |
| [#330](https://github.com/Lead-Agent-69/MikeHunt/pull/330) | fix(vin): #301 sign nits — 6h retry for failed safety/EPA extras, stream-only body cap, drop lib/api/vin.ts, cap vin-history/observed-price bodies                                         | `35510bb` | `main`                       | Open; SUCCESS        |
| [#327](https://github.com/Lead-Agent-69/MikeHunt/pull/327) | Reliability: Ren #323 nits (host-less source paths only, query stripped; 64-char partial-tail cap)                                                                                         | `c467dd8` | `fix/reliability-ren-nits-3` | Open; FAILURE        |
| [#326](https://github.com/Lead-Agent-69/MikeHunt/pull/326) | fix(scan): honest scale UX — no +$0 profit without a resale basis, end-of-list, lighter first paint; gov surplus says "Last bid"                                                           | `e745bb9` | `main`                       | Open; SUCCESS        |
| [#324](https://github.com/Lead-Agent-69/MikeHunt/pull/324) | fix(sold): #316 follow-up — last_bid attribution CHECK (20261010411000), maestro fetch bounds, guard .from(CONST), gov lane UI with CC BY credits                                          | `e38accf` | `feat/free-sold-comps-v2`    | Open; FAILURE        |
| [#323](https://github.com/Lead-Agent-69/MikeHunt/pull/323) | Reliability: Ren #314 nits (scrub-then-cut, phone shapes, payload allow-list, source-path URLs, docs)                                                                                      | `82d63c8` | `fix/reliability-ren-nits-2` | Open; FAILURE        |
| [#321](https://github.com/Lead-Agent-69/MikeHunt/pull/321) | feat(capture): Visor.vin listings + AutoTempest challenge recording, VIN/URL dedup, discoveredVia (operator_override; stacked on #290)                                                     | `e79e704` | `ren/source-access-class`    | Open; FAILURE        |
| [#318](https://github.com/Lead-Agent-69/MikeHunt/pull/318) | fix(pwa): install prompt waits, remembers, never blocks taps; honest manifest shortcuts                                                                                                    | `6d87843` | `main`                       | Open; SUCCESS        |
| [#317](https://github.com/Lead-Agent-69/MikeHunt/pull/317) | feat(alerts): saved-search tuning — thumbs on matches, per-search precision, instant vs daily digest (migration not applied)                                                               | `b2385dc` | `main`                       | Open; SUCCESS        |
| [#316](https://github.com/Lead-Agent-69/MikeHunt/pull/316) | feat(sold): free sold comps on main (recreates #302) — retail scope + gov lane w/ attribution, Norfolk/Seattle/GSA/GovDeals (20261010410000, needs Ren SIGN; HOLD until #264)              | `819862e` | `main`                       | Open; FAILURE        |
| [#314](https://github.com/Lead-Agent-69/MikeHunt/pull/314) | Reliability: Ren #309 nits (contact scrub, isContactKey, NUL/surrogates, URL scrubber, hashed bearer, check-only 206000)                                                                   | `8dc6092` | `fix/reliability-ren-nits`   | Open; FAILURE        |
| [#313](https://github.com/Lead-Agent-69/MikeHunt/pull/313) | security(cards): no seller names on Discover/Scan cards for guests (follow-up to #308, no migration)                                                                                       | `eb3a8a7` | `main`                       | Open; SUCCESS        |
| [#312](https://github.com/Lead-Agent-69/MikeHunt/pull/312) | feat(provenance): fetched_at + access_basis, price_history.source, stable listing ids, no relabelling to independent_dealer (20261010230000, needs Ren SIGN)                               | `eed9f4a` | `dq/cross-source-dedup`      | Open; FAILURE        |
| [#311](https://github.com/Lead-Agent-69/MikeHunt/pull/311) | security(net): Ren #293 nits: deadline armed before DNS + one-deadline redirect-chain and positive-control tests                                                                           | `688a8a9` | `main`                       | Open; SUCCESS        |
| [#310](https://github.com/Lead-Agent-69/MikeHunt/pull/310) | security(db): closure re-check v2 (20261010149000) + guard re-grant/fixtures/schema-qualified matching (Ren nits on #299; stacked on #299, needs Ren SIGN)                                 | `0006da6` | `main`                       | Open; Not recorded   |
| [#309](https://github.com/Lead-Agent-69/MikeHunt/pull/309) | fix(scrapers): Ren #296 nits — jsonb-sized dead letters + row fallback, PII/URL scrub, self-check migration 20261010205000, sequence revokes, constant-time bearer                         | `1e94d99` | `ops/reliability-sla`        | Open; SUCCESS        |
| [#307](https://github.com/Lead-Agent-69/MikeHunt/pull/307) | feat(data-quality): cross-source dedup — check-digit VIN + fuzzy, VIN conflicts flagged not merged, canonical readers (20261010220000, needs Ren SIGN)                                     | `40dd065` | `main`                       | Open; FAILURE        |
| [#305](https://github.com/Lead-Agent-69/MikeHunt/pull/305) | feat(valuation): opt-in comp recency weighting + depreciation/index on aggregateComps (audit IV 5)                                                                                         | `05cd9bf` | `main`                       | Open; SUCCESS        |
| [#304](https://github.com/Lead-Agent-69/MikeHunt/pull/304) | feat(valuation): per-listing completeness + missing-photo confidence penalty, one swappable function (audit IV 6)                                                                          | `bf2235e` | `main`                       | Open; SUCCESS        |
| [#303](https://github.com/Lead-Agent-69/MikeHunt/pull/303) | feat(valuation): market-local ratio from own comps + days-to-sell liquidity + opt-in holding hook (audit IV 2+4)                                                                           | `c7f2a7c` | `main`                       | Open; SUCCESS        |
| [#296](https://github.com/Lead-Agent-69/MikeHunt/pull/296) | feat(scrapers): reliability & ops — failure log, source SLA on /status, breaker auto-pause, dead letters, incremental scans, per-source tuning, version stamp                              | `906b3cc` | `main`                       | Open; SUCCESS        |
| [#295](https://github.com/Lead-Agent-69/MikeHunt/pull/295) | feat(admin): admin-only alert delivery view (depends on #291)                                                                                                                              | `4ea1be8` | `main`                       | Open; SUCCESS        |
| [#290](https://github.com/Lead-Agent-69/MikeHunt/pull/290) | legal(sources): per-source access classification, /status display, access-basis + republish docs                                                                                           | `3460a76` | `main`                       | Open; Not recorded   |
| [#288](https://github.com/Lead-Agent-69/MikeHunt/pull/288) | feat(sources): zero-source-state dealers — 5 clean-terms enabled (DE/HI/SC/MD), 9 registered off awaiting terms; JSON-LD Overfuel/DealerFire/space.auto/ProMax (stacked on #277→#272→#270) | `047a763` | `feat/curated-sweep-2`       | Open; SUCCESS        |
| [#284](https://github.com/Lead-Agent-69/MikeHunt/pull/284) | fix(find): Also search on — real disclosure button, 44px targets, clear external links                                                                                                     | `f84b4a4` | `main`                       | Open; FAILURE        |
| [#283](https://github.com/Lead-Agent-69/MikeHunt/pull/283) | feat(find): Check any listing UX — verdict first, one number, honest thin data, a11y                                                                                                       | `ecb1093` | `feat/check-any-listing`     | Open; SUCCESS        |
| [#281](https://github.com/Lead-Agent-69/MikeHunt/pull/281) | db: column + role-membership re-check (20261010145000) + guard catches multi-table/role grants, short invoker-off (Ren nits on #279; stacked on #279)                                      | `4337140` | `main`                       | Open; FAILURE        |
| [#280](https://github.com/Lead-Agent-69/MikeHunt/pull/280) | feat(sources): gov vehicle outlets for KS/OK/TN/AK/ID/ND (terms-checked) — replaces #231                                                                                                   | `6df4d18` | `main`                       | Open; Not recorded   |
| [#279](https://github.com/Lead-Agent-69/MikeHunt/pull/279) | db: stricter market_timing/stripe_events re-check (20261010140000) + guard test hardening (Ren nits on #275; stacked on #275)                                                              | `cc6e97b` | `main`                       | Open; SUCCESS        |
| [#278](https://github.com/Lead-Agent-69/MikeHunt/pull/278) | feat(freshness): not-live labels on Scan table, Similar deals and Arbitrage rows                                                                                                           | `533aebc` | `main`                       | Open; FAILURE        |
| [#277](https://github.com/Lead-Agent-69/MikeHunt/pull/277) | feat(salvage): +6 verified VehiclesNETWORK dealers (TN/ID/MA new, NY/UT/CO)                                                                                                                | `2ae5a04` | `main`                       | Open; SUCCESS        |
| [#276](https://github.com/Lead-Agent-69/MikeHunt/pull/276) | fix(deal-check): sold comps before asks, buyer-home state, title lanes never mix (stacked on #268)                                                                                         | `676ba24` | `main`                       | Draft; FAILURE       |
| [#275](https://github.com/Lead-Agent-69/MikeHunt/pull/275) | db: market_timing_signals server-only + stripe_events self-check (20261010120000, needs Ren SIGN)                                                                                          | `b8665c7` | `main`                       | Open; SUCCESS        |
| [#271](https://github.com/Lead-Agent-69/MikeHunt/pull/271) | feat(gsa): official api.gsa.gov auctions adapter (GSA_API_KEY, DEMO_KEY fallback, throttled, cars & trucks only)                                                                           | `b5c4956` | `main`                       | Open; FAILURE        |
| [#269](https://github.com/Lead-Agent-69/MikeHunt/pull/269) | feat(scrapers): polite mode by default for every scraper (randomized per-domain delays, robots always, honest UA)                                                                          | `7f760e1` | `main`                       | Open; SUCCESS        |
| [#268](https://github.com/Lead-Agent-69/MikeHunt/pull/268) | fix(sold-comps): one soldTitleCategory for sold headlines + title_unverified comp penalty (stacked on #264)                                                                                | `35c3deb` | `main`                       | Draft; FAILURE       |
| [#267](https://github.com/Lead-Agent-69/MikeHunt/pull/267) | feat(intelligence): tap-to-check advisor line on DealCard — depends on #266/#254                                                                                                           | `3723e0f` | `main`                       | Open; Not recorded   |
| [#266](https://github.com/Lead-Agent-69/MikeHunt/pull/266) | feat(intelligence): advisor card on deal detail (Sara's layout, dealId contract) — depends on #254                                                                                         | `4ddee73` | `main`                       | Open; SUCCESS        |
| [#264](https://github.com/Lead-Agent-69/MikeHunt/pull/264) | fix(sold-comps): normalized model+trim, explicit item state, basis='sold' filter (migration needs Ren)                                                                                     | `021edfc` | `main`                       | Open; FAILURE        |
| [#262](https://github.com/Lead-Agent-69/MikeHunt/pull/262) | fix(market): like-for-like market timing (same-listing trend, mix-adjusted fallback, min sample, confidence)                                                                               | `489cf0b` | `main`                       | Open; FAILURE        |
| [#254](https://github.com/Lead-Agent-69/MikeHunt/pull/254) | feat(intelligence): Check any listing: link/VIN/details in, one Buy/Wait/Pass card out                                                                                                     | `f4847d3` | `main`                       | Open; SUCCESS        |
| [#251](https://github.com/Lead-Agent-69/MikeHunt/pull/251) | fix(honesty): label frozen/stale/ended rows, rank live first, split live vs frozen counts                                                                                                  | `d65d01a` | `main`                       | Open; SUCCESS        |
| [#224](https://github.com/Lead-Agent-69/MikeHunt/pull/224) | fix(mobile): 390px layout — pinned action bars, tap-safe status banner, 44px state search, map padding                                                                                     | `808c70a` | `main`                       | Open; FAILURE        |
| [#222](https://github.com/Lead-Agent-69/MikeHunt/pull/222) | fix(a11y): WCAG AA contrast, solid focus ring, shared dialog keyboard hook, labelled controls                                                                                              | `0d7c01c` | `main`                       | Open; FAILURE        |
| [#208](https://github.com/Lead-Agent-69/MikeHunt/pull/208) | feat(map): OpenFreeMap vector tiles (free, no key)                                                                                                                                         | `8bfbcfe` | `main`                       | Open; FAILURE        |
| [#200](https://github.com/Lead-Agent-69/MikeHunt/pull/200) | fix(ui): Auction Lane profit/comps honesty + /arbitrage nav highlight                                                                                                                      | `d2a8ac4` | `main`                       | Open; SUCCESS        |
| [#165](https://github.com/Lead-Agent-69/MikeHunt/pull/165) | chore(deps): bump the dependencies group across 1 directory with 57 updates                                                                                                                | `1ae3d81` | `main`                       | Open; FAILURE        |

## Completion Receipt Required For Each Area

Record owner/contact, reproduced failure or acceptance fixture, files and tests,
exact reviewed head, migration receipt if applicable, main/deployment SHA,
real workflow evidence, remaining limitations and rollback/monitoring result.
Do not check an item merely because its PR was opened, merged or returned HTTP 200.

Related evidence:
[production readiness](PRODUCTION-READINESS-HANDOFF.md),
[buyer experience](BUYER-EXPERIENCE-EXECUTION.md),
[29-item foundation register](FOUNDATION-RELEASE-REMAINING-HANDOFF-2026-10-09.md),
[release integration audit](RELEASE-INTEGRATION-AUDIT-2026-10-10.md),
[Zeus operator checklist](zeus-deploy-checklist.md).

## Bounded Worker Logs (October 12 Follow-Up)

- Integrated the independently deployable log protection from #360 without merging its gated
  hosted migration or database-dependent routes. Worker file logs and Compose Docker logs are
  bounded; listing caches, quota state, status and browser profiles are preserved.
- Regression coverage includes restart accounting, concurrent queued writes, oversized UTF-8
  messages, oversized legacy generations, shutdown, unavailable log directories and invalid limits.
- `node scripts/storage-audit.mjs` is read-only, distinguishes unavailable checks from measured
  evidence and reports unbounded Docker logs/missing persistent mounts/tracked runtime data.
- Local attachments and QA artifacts are excluded from Git, Docker and Vercel upload payloads;
  the Vercel ignore also excludes runtime caches, profiles, logs and local authentication fixtures.
  No existing files are removed. Regression coverage checks all three exclusion boundaries.
- Actual local audit at 21:34 UTC found persistent mounts and substantial disk headroom, but the
  running scraper's Docker logs are still unbounded. The operator must deploy the worker and Compose
  changes. This work does not apply #360, clean hosted data, reset quotas or prove remote Zeus health.
- Removed unsafe blanket inactive-embedding/shorter-retention recommendations from the historical
  budget guide. Owner-protected retention review/apply and actual provider usage remain next gates.
- Fresh read-only hosted check on October 12: database size 101,510,291 bytes;
  `prune_inventory_retention(integer)` and `inventory_storage_bytes()` absent, migration
  `20261011142210` absent, and two active legacy deal-deletion jobs still present. #360's exact head
  `19b483de841023001bfa99adc7f384018b0a61cb` has no recorded PR review. No hosted writes were made.
- Fifteen focused tests and Compose configuration validation passed. Pre-integration head
  `7516aeb` passed 559 files / 3,567 tests, full build and 48 local desktop/mobile checks.
  Current-main integration, final CI and merge/deployment receipts remain separate requirements.
- Current live push status reports `configured=false`. Security advisor returned 11 findings.
  No new login was created when the newer Vercel dry-run CLI lacked existing credentials; upload
  exclusions are tested, but a CLI manifest receipt is not claimed.

## Local Collector Rollout Receipt (October 12)

- The already-merged #384 worker logging code is now running locally in image
  `mikehunt-scraper-release:bebb6b8`, built from exact main
  `bebb6b85af0c2c0d04d48942b3b6b07d445532a5`. Eleven rotating-log tests passed
  in the Linux image with networking disabled before deployment.
- The operator's existing Compose override now sets Docker logging to three
  10 MB generations. Original Docker log history was saved locally before the
  collector was recreated. Other services were not recreated or upgraded.
- Health is healthy; a fresh status update at 23:42 UTC reported quota_paused,
  no active job/error and unchanged 1,000 inserts / 535 updates / zero touches.
  Cache, profiles and logs retain their original mounts; quotas and scope are
  unchanged. This is a local rollout, not remote Zeus or hosted retention proof.

## Reported Pickup-Series Matching (October 12 Follow-Up)

- Reproduced through read-only production APIs: the known Silverado 3500 listing
  `869fde80-0d5e-4298-a396-00d45009e6c3` returned six same-model alternatives:
  three reported 1500, one reported 2500 and two did not report a series. None
  was a confirmed 3500 match. Generic stored model names hid these distinctions.
- The alternatives query now reads existing title/trim fields for server-side
  matching; no schema, grants or source permissions change. Those raw fields
  are not added to the response. Existing buyer-mode redaction stays intact.
- Silverado/Sierra matching compares only explicitly reported 1500/2500/3500
  series. Conflicting reports or unknown-vs-known series do not match. Two
  unknown-series records retain a family-level suggestion with an explicit
  missing-series reason, not an exact-model claim. Unrelated prices, down payments
  and odometer amounts do not substitute for a reported series.
- Forty-six focused matcher, identity and API-contract tests passed. Source,
  freshness, auction-window, condition, VIN and price-band guards are retained.
  Full integration/deployment and post-release query receipts remain separate;
  this does not validate every truck platform, physical specifications or resale.

## Share-To-Save And Neutral Guidance (October 12 Follow-Up)

- Remove branded comparisons/examples from buyer scope, auction scheduling,
  Discover auction guidance and shared-listing instructions. Factual source labels
  and original links are not promotional comparisons; their visibility is a
  separate product choice, not a reason to falsify provenance.
- Shared links embedded in prose are extracted before posting. Unsupported
  protocols, incomplete URLs and embedded credentials do not start a request.
  Server-side public-URL/permission checks remain authoritative and unchanged.
- Require a confirmed vehicle identifier before navigation. Failed or malformed
  responses offer a retry; anonymous sign-in preserves the shared listing;
  superseded/account-changed requests cannot navigate. Do not claim a valuation
  or profit calculation merely because listing details were saved.
- Market context now labels time since our first observation, not claimed days
  on market or inferred seller motivation. Cross-source API aggregate price
  comparability remains an intelligence follow-up; the visible table already
  distinguishes source-channel price types but those are not transaction proof.
- Local controlled tests cover all four ordinary desks on desktop/mobile.
  These do not prove a remote site's extraction permission or real hosted saves.
  Final test, merge and deployment receipts belong to the integration PR.
- Screenshot review caught the connection banner covering navigation globally.
  It now reserves document space including the safe-area inset. A failed app
  connectivity probe is labeled connection unavailable, not proof that the device
  is offline. Retry/sign-in buttons use a defined high-contrast text color;
  controlled browser tests check banner/header separation and 44px targets.
- Define paired accent/status text tokens for light and dark themes. Browser
  checks measure actual contrast ratios, not just the presence of white text;
  existing accent-token consumers also receive the dark-theme foreground.

## Remaining Acceptance Order

### October 13 Hosted Acceptance Snapshot

- Read-only hosted audit at 06:28 UTC: database size 102,960,275 bytes;
  protected retention and storage meter functions absent. Both legacy jobs
  (`cleanup-expired-deals`, `cleanup-dead-deals`) remain active. #360 remains
  open without a recorded review. No cleanup or hosted migration was applied.
- Containment after inspecting the job commands: paused only
  `cleanup-expired-deals` and `cleanup-dead-deals` with `cron.alter_job`.
  Verified both inactive; `aggregate-market-data` remains active. The dead-deal
  job had no owner exclusion; the expired-deal hard-delete excluded saves but
  not all research references. No data was deleted and no schema/grants were
  changed. This is temporary containment, not protected-retention completion.
  Review/apply #360 and verify reference survival before enabling replacement
  cleanup. Review actual hosted growth while legacy cleanup is paused.
- Dashboard billing counters: database 118/500 MB, egress 1.07/5 GB, log
  ingestion 0.49/1 GB. Billing counters and SQL relation size are different
  measurements. This snapshot does not certify monthly capacity.
- Active inventory snapshot: 8,266 stored rows across 11 source types. Only
  396 rows have multiple captured photos. Fresh observations within 24 hours:
  independent dealers 177/2,544, Copart 1,195/1,779, government 102/1,537,
  Craigslist dealer 202/855 and private 126/428. The other six source types
  have zero fresh observations in this window. These are not unique vehicle
  counts or proof that every source works. Recent runs include errors and
  an Autotrader success with zero rows; discovery is not persistence proof.
- Connected Docker host, not remote Zeus: image
  `mikehunt-scraper-release:b495d4e`, healthy status endpoint but
  `quota_paused`, 1,000 inserts and 550 updates. Persistent cache/log/profile
  binds use F:, disk 12% used, Docker logs bounded to 3 x 10 MB. No quota
  reset, container recreation, restricted-source activation or Zeus SSH.
- Live signed-in dealer account: unchanged profile/cost save confirmed,
  unchanged home-state save confirmed, reload preserved cost fields, account
  watchlist loaded and its detail link opened. Desktop and 390px photo preview
  loaded with an accessible close control; mobile dialog filled the viewport
  without page horizontal overflow. Existing saved research was not removed.
- Discover initially failed and recovered on retry. Push settings explicitly
  report that push is not switched on. These remain acceptance gaps. Other
  hosted buyer roles, admin authorization, purchase mutations, saved-search
  writes and real-device alert delivery are not certified by this dealer pass.
- Pipeline loaded its empty state and its saved-candidate link returned to the
  account watchlist. Saved searches rendered their empty account state. These
  checks do not prove populated purchase workflows or saved-search delivery.
- Alerts loaded the existing watched vehicle without inventing a price-drop
  event. Edit-onboarding loaded the dealer goal as selected; no role changes
  were made. The temporary QA tab was closed and viewport override reset.
- Craigslist search-card ingestion no longer invents `run_drive` when no
  listing evidence is available. Detail-page title evidence is preserved.
  Existing stored assumptions require a separately reviewed remediation;
  a web deployment alone does not update worker code or rewrite old records.
- Repeat the aggregate-only SQL snapshot with
  `supabase/tests/inventory-readiness-audit.sql`; read-only transaction and
  10-second statement limit, no customer rows or cleanup operations.

1. Protected retention #360: refresh against current main, independent database
   review, targeted hosted apply and grants/cron/reference-survival proof before
   dependent cleanup rollout. CI passing alone does not clear this gate.
2. Worker cache fix #387: code merged as `43c889e` and Vercel READY at that SHA;
   worker rebuild/observation recovery receipt remains separate. Preserve cache,
   profiles and quota state. Local log rollout at `bebb6b8` is not this code.
3. Actual hosted storage/egress/CPU headroom and cold-archive restore/replay proof.
   The connected F: disk and bounded logs do not expand hosted free-tier quotas.
4. Provider delivery configuration, delivered/bounced receipts and real device
   notification opening; hosted login/onboarding/saves and authorized admin QA.
5. Consistent versioned intelligence across cards, comparison, saved vehicles,
   alerts and pipeline; verified local comps and costs, held-out outcomes and
   real-traffic freshness before purchase-confidence or accuracy claims.
6. Permission-backed source expansion with per-source field/photo completeness,
   deduplication and successful fresh-row receipts. Never count catalog entries,
   blocked endpoints or speculative API routes as working coverage.

## Price Meaning And Comparable Research (October 12 Follow-Up)

- Cross-source observations now distinguish reported asking and buy-now prices
  from bids, payment amounts, reference values and unverified advertisements.
  Only recent, traceable full cash amounts enter a range; single observations or
  a truncated source sample do not establish a complete range. Missing values
  remain missing. Safe original links and factual source attribution remain.
- Sources are bounded to the latest 50 exact reported VIN observations, with an
  explicit incomplete-sample notice. VIN syntax is not identity verification.
  Service-role projections classify existing private JSON evidence server-side;
  raw seller text, descriptions and evidence are not exposed. No schema, grants,
  source activation, hosted cleanup or quota resets are part of this change.
- Comparable charts separate qualified cash asking prices from an explicitly
  labeled advertised-amount research mode. Known bids/payments/reference values
  are excluded from both. Research mode has no cash-price trend or deal grade.
  Current vehicles do not count toward the comparison sample, and a cash-price
  curve cannot grade a vehicle outside the actual observed mileage domain.
- The mileage API matches the complete model literally, checks price meaning,
  freshness and retail suitability, and bounds work to 500 observations. A
  truncated sample cannot generate a cash-price trend. Existing alternatives
  ranking, desk-based profit redaction and source permission boundaries remain.
- The adjacent seasonal panel uses theme surfaces instead of a dark-only fill.
  Seasonal copy remains a general heuristic, not measured local-sale forecasting.
- Read-only hosted audit: 6,693 active rows had no price-kind record, 900 were
  reference values, 488 unknown and nine current bids; no asking/buy-now kinds
  were recorded. These are point-in-time observations, not verified cars or
  evidence of cash-price coverage. Ingestion/enrichment must capture price
  meaning before cash intelligence can be broadly populated. Research views are
  intentionally preserved without inferring full prices from seller identity.
- Hosted database size was 102,583,443 bytes; protected retention remains absent.
  This measurement alone does not certify free-tier CPU, storage or egress.
- Global market snapshots, geographic comparisons and recommendation price
  differences still need a consistent versioned price-evidence audit. This
  phase does not certify repair costs, embeddings, resale accuracy, source photo
  completeness, alert delivery or real hosted account mutations.
- Verification before integration: 81 focused tests across seven files and the
  production build passed. Twenty-eight controlled local browser checks passed
  across all four ordinary desks on desktop/mobile, plus light/dark panel checks.
  Screenshots were inspected. Real local detail routes used mocked comparison
  evidence; this is not proof of hosted cash-price coverage or source extraction.

## Interactive Comparable Research (October 13)

- Turn the previously passive detail scatterplot into a selectable research
  surface. Mouse/touch selection and keyboard-focusable points synchronize with
  a native vehicle selector and an inline inspector showing exact amounts,
  mileage, source and available location. No hover-only essential information.
- Link selected alternatives directly to their existing detail and side-by-side
  comparison routes. Validate identifiers, prevent self-comparison and disable
  speculative route prefetching. Existing user-desk authorization stays intact.
- The linked saved comparison now uses the same price-evidence classification,
  including stated full asking prices, explicit buy-now offers, payments and
  reference values. Unverified amounts/bids/payments cannot create cash-cost
  subtotals. Keep the original advertised amount separately where it differs;
  inactive/ended offers do not become current purchase subtotals. Original links
  reject unsupported schemes and embedded credentials. No extra queries needed.
- On overflowing comparisons, provide previous/next and native vehicle selection,
  synchronize manual horizontal scrolling, and pin the metric labels. Narrow
  columns fit a 320px viewport; the controls stay absent when every column fits.
- Add maximum-amount and mileage controls with reset, per-field validation and
  explicit loaded-sample counts. Filtering/selection operates on loaded evidence
  rather than creating requests per keystroke. It is not a whole-market search.
- Keep small-sample alternatives inspectable without rendering a misleading
  curve. The current vehicle never fills the comparison sample. Research mode
  remains separate from cash comparisons; known bids/payments stay excluded.
- Acceptance covers all four ordinary desks, mouse/touch/keyboard selection,
  actual local detail/comparison navigation, narrow 320px layouts, light/dark
  themes, aligned 44px controls, sparse/empty/invalid filter recovery and no new
  evidence requests from selection/filtering. Controlled comparison fixtures
  do not establish real hosted data accuracy or competitor-wide parity.
- Remaining benchmark gates: capture and validate price meaning during ingestion;
  apply consistent evidence to cards and global market tools;
  obtain verified build/options and complete authorized photos; prove alert
  delivery and cold-cache performance. The first #390 production status smoke
  exceeded 15 seconds, a targeted retry took 11.5 seconds, and a warm rerun took
  111ms. A successful warm retry does not close the public cold-status cost/SLA
  gap. Reviewed retention, worker rollout and hosted capacity remain separate.
- Before integration: 48 focused interaction/price-evidence tests and the production build passed. Final
  browser run passed all 44 controlled cases, including real local detail and
  comparison destinations; screenshots were inspected. Release CI and exact
  production-commit receipts are tracked on the integration PR.

## Responsive And Scroll Acceptance (October 13)

- Discovery rails publish edge-control state only when an edge changes, with
  passive scrolling, one geometry read per animation frame and complete cleanup.
  Matching scroll padding fixes keyboard navigation leaving the first card 24px
  away from the start. Previous/next controls have 44px CSS-pixel targets.
- Vehicle cards and rail sections no longer wait for viewport entrance animations
  to reveal prices and facts. Remove unnecessary per-card layout measurement;
  retain optional hover feedback, native scrolling and reduced-motion behavior.
- Move the decision guide from a floating launcher that covered inventory into
  account navigation on every viewport. Preserve its existing opening event and
  requests made before the idle-loaded drawer mounts. Use the existing Radix
  modal dependency for focus containment, Escape, background locking and focus
  return. The guide remains rule-based buying help, not an AI photo inspection.
- Load the guide on user request, not merely idle. Its availability response
  distinguishes pending/unavailable from an empty index and labels index-wide
  totals instead of claiming they match selected filters. Profile and buying
  guidance does not infer source coverage from a failed request.
- Native discovery cards retain CSS interaction feedback without per-card motion
  subscriptions; reduced-motion CSS suppresses card transforms. Decode photos
  asynchronously and remove blur from scrolling image controls. Keep the same
  labels, prices, save behavior, deep links and source evidence.
- Install hints sit below navigation, and account-menu scrolling reserves footer
  and safe-area space. Intentional iOS-hint fixtures verify guide and All tools
  remain reachable for every ordinary user type, including unavailable-health
  recovery. This does not prove native installation or notification delivery.
- Give inventory its missing semantic heading. Extend controlled local account
  coverage to DIY alongside personal, reseller, dealer and parts. Test ordinary
  accounts cannot read admin aggregates; dealers still receive dealer tools,
  not admin privileges.
- Inventory results also render without staggered hidden-card entrance states.
  Page acceptance waits for loaded settings fields, inventory links and saved
  content rather than treating a loading heading as a finished screen; verify
  the actual HTML theme, not only the requested storage preference.
- Secondary marketplace handoffs are collapsed by default, so external links
  do not displace indexed inventory. The existing shortcut opens the native
  disclosure directly; preserve every destination and transferred/untransferred
  filter detail. This change does not create a new backend request.
- Discovery quick filters are also collapsed initially, with the active buying
  scope kept visible and a dedicated inventory button. Narrow cards repeat their
  existing vehicle identity, price label and amount at the top of the photo;
  screen readers retain the original facts without duplicate announcements.
  This is a visual preview of the same evidence, never a new cash-price inference.
- Disable speculative route prefetching in primary navigation, inventory view
  links and discovery cards. Links still perform normal client navigation on
  selection. The cross-engine diagnostic run exposed abandoned-prefetch errors
  in WebKit; errors are not filtered out of the acceptance check. Marketplace
  shortcuts now land immediately and focus the disclosure, retaining the URL
  fragment and modified-click behavior, so smooth scrolling cannot move controls
  behind fixed navigation during the next tap.
- Acceptance matrix: Chromium at 320x740, 390x844, 768x1024, 1024x768 and 1440x900;
  light/dark Discover, inventory, saved and settings; role-scoped APIs and detail
  routes; touch/keyboard/reduced-motion scrolling and guide focus restoration.
  This uses local authentication/data, not hosted provider or delivery receipts.
- Optional local-only WebKit phone and Firefox desktop projects are enabled with
  `E2E_CROSS_BROWSER=1`; do not expand production smoke traffic automatically.
  Include account-save persistence after clearing the device backup and reloading,
  plus reachable dealer pipeline and parts screens. These are local integration
  receipts, not proof of production provider login or hosted storage retention.
- Harden the write-test target check using parsed URL hosts shared by the runner
  and write helpers. Reject remote lookalikes, credential-bearing URLs and invalid
  protocols. Before this run, verify the test build's Supabase endpoint is also
  loopback (`127.0.0.1:54321`); a local web origin alone does not prove local data.
- Read-only hosted check confirmed the password minimum is already 12. At this
  snapshot, Supabase reports Free/Nano, CPU 6%, disk 21%, RAM 66% and 24/60
  connections; no scheduled backup shown. Advisor still flags the extension-owned
  `public.spatial_ref_sys`. Review effective exposure before changing a managed
  PostGIS table. The platform also shows an active incident banner. These signals
  do not certify sustained capacity or a completed recovery plan.
- Benchmark principles: prioritize immediately inspectable cards, predictable
  search/filter and saved workflows, reachable research and source attribution.
  Reference [Copart search](https://www.copart.com/content/us/en/support/faq-topics/searching-1)
  and [Visor filters](https://visor.vin/search/filters) externally only; no
  competitor branding belongs in the product. Use
  [Apple interaction guidance](https://developer.apple.com/design/human-interface-guidelines/buttons)
  as a design reference, not native-platform certification. Web targets here are
  CSS pixels, not a claim of physical iOS points.
- Synthetic requestAnimationFrame intervals establish an exercised scrolling
  path, not physical-device presented FPS, battery/thermal performance or field
  interaction latency. Field acceptance still needs representative iOS Safari,
  Android and installed-PWA devices, plus cold/warm and constrained-network runs.
  [Google Web Vitals](https://web.dev/articles/vitals) targets are LCP <=2.5s,
  INP <=200ms and CLS <=0.1 at the 75th percentile, separated by mobile/desktop.
- Chromium acceptance before the final handoff disclosure change: all 185 cases
  passed. Across 25 scrolling samples, median intervals were 16.7ms, the largest
  per-sample p95 was 33.4ms and there were no gaps above 50ms. Phone cases used 4x
  simulated CPU throttling. These observations are not a 60fps device guarantee
  or a controlled causal comparison with earlier diagnostic runs.
- The subsequent seven-project run passed 172 of 175 cases. One real iOS install
  overlap was fixed; two test assumptions were corrected (fitting rails need no
  scrolling, and Firefox geometry must settle). All three follow-up cases plus
  five forced-install-overlay regressions passed. The complete run remains a
  diagnostic receipt, not a claimed single all-green run. Further WebKit and
  final optimization receipts belong with the integration PR.
- Windows WebKit diagnostics showed stalls despite fast median intervals; the
  bare native-scroll control had 17-18ms p95 without stalls. Do not attribute app
  stalls solely to the engine or certify device FPS from functional passes.
  Cold versus settled sampling, profiling and physical Safari/Android remain
  performance gates even after these focused reductions in startup work.
- Final focused optimization run: 21/22 passed; the remaining abandoned `/alerts`
  prefetch was traced to workspace peer navigation and disabled there too. The
  native-card WebKit samples still reached 117ms p95 with 32 gaps above 50ms
  across five samples. Functional interaction checks are not a smoothness gate.
  Do not describe this phase as proven high-FPS Safari readiness; trace loading,
  decode/layout and steady-state work next, alongside the existing large-list
  and map integration queue. No package updates or paid infrastructure required.

### Product Promise Gates Still Open

#### Chrome Owner-Session QA Follow-Up

- Chrome automation reconnected after the user reopened their signed-in session.
  `/admin` loaded actual inventory/account/source aggregates, and `/orchestrator`
  loaded 33 configured sources (24 enabled, 10 meeting its health threshold).
  Those are run-history indicators, not proof of statewide listing completeness.
  Owner-only Admin dashboard and Source operations links appeared after the
  server-backed account check settled. No credentials or grants were changed.
- The bounded Missouri photo task returned its controls to idle, but its toast
  was too transient to retain a reviewable result. Maintenance now retains the
  latest counted success/partial/failure receipt on the dashboard until another
  task starts or the page is left. Confirmed writes remain visible even when a
  subsequent dashboard refresh fails. This is not a durable cross-session log.
- Watched-dealer UI previously treated loading and HTTP/soft failures as empty
  inventory. It now separates loading, retryable failure, unconfigured inventory
  and genuine empty results, and retains previously loaded cards on refresh
  failure. This corrects reporting; it does not claim new dealer imports.
- Admin stored-model outputs are no longer called high-confidence buys. Missing
  net estimates stay unavailable rather than becoming zero; raw diagnostics
  remain available to the owner without becoming purchase recommendations.
- Chrome's ReCar storefront exposed a separate cap: it requested unsupported
  `limit=300`, received the API's default 48-row page, displayed 48 as if it were
  the whole inventory and had no next-page action. It now uses explicit `page`
  and `pageSize=48`, shows the response total, and offers Previous/Next. Loading
  and failures cannot become a zero inventory count. Shared evidence-aware
  DealCards replace its legacy raw verdict/profit/title/photo rendering; the
  API's desk access controls economics and missing photos use the shared guard.

#### 2026-10-15 Source Coverage And Live QA Follow-Up

- Read-only production snapshot at 07:55 UTC: Missouri had 3,354 active rows,
  248 without galleries and 479 last seen more than 72 hours ago. The exclusions
  overlap. 2,738 rows passed the photo-presence/freshness candidate checks; this
  is not proof that all photos load, sellers remain available or cars are unique.
- Candidate source labels: independent dealer 1,048; CarGurus 1,122; Cars.com
  293; Carvana 105; TrueCar 86; government auction 33; eBay Motors 28; Copart 15;
  Craigslist dealer 8. Aggregator-derived rows do not prove direct-adapter health.
- Fixed generic dealer URL-tail identity collisions across sites, query-based
  detail links wrongly treated as inventory pages, and missed lazy photo URLs.
  Unique exact-URL legacy IDs are retained to protect existing saved references.
  Ambiguous identities are not guessed; failed lookups stop the write path.
- Normalized protocol-relative AutoTempest source links to absolute HTTP(S),
  preserving existing photo-audit evidence for equivalent URL normalization.
  Existing protocol-relative links were not necessarily unclickable or lost rows.
- Live worker limits remain relevant: new inserts reached the effective daily
  1,000-row allowance; existing-row refresh budget remained available. eBay and
  Cars.com direct requests returned 403; AutoTrader returned a challenge page.
  These are unavailable collection paths, not evidence of empty inventories.
  No quota reset, permission bypass, fabricated rows or coverage guarantee added.
- Live in-app-browser QA used an existing personal-mode session. At 390px:
  Discover to inventory, scope-preserving Feed/Swipe navigation, feed quick review
  and its close action passed. At 1440px: map loaded 1,000 sampled pins with
  approximate-location disclosure; keyboard activation opened a photo preview.
  Preview disappearance during unrelated renders exposed unstable marker inputs;
  memoization now retains marker groups, popup state and map position when the
  inventory array is unchanged, covered by a mounted-component regression test.
- Vehicle detail showed price uncertainty, seller-reported title attribution,
  missing cost/evidence checks and a one-photo completeness disclosure. Gallery
  open/Escape close passed. Saved reached account-connected state and retained
  its existing device backup. Settings loaded home location and buying controls.
  No user settings, credentials, saved cars or financial actions were changed.
- This is not full authenticated E2E certification: admin role, OAuth/recovery,
  write/reload persistence, populated pipeline, provider delivery and physical
  Android/iOS performance remain separate gates. Chrome extension control failed;
  the supported in-app browser was used instead. Do not mark these untested paths
  complete or convert a partial-source count into verified statewide coverage.
- Follow-up QA: 320/430/768px Settings had no horizontal document overflow;
  the 320px location sheet searched Missouri and displayed its active count.
  Profile editing restored the personal-mode selection without saving changes.
  The personal session was redirected away from `/admin`. This proves that
  session's navigation boundary, not a complete admin-role/security audit.
- Post-release map testing caught a second interaction defect: Leaflet's default
  click/Enter toggle could close an already-open hover/focus preview. New marker
  bindings now explicitly open on click/Enter rather than toggle; a regression
  covers focus then Enter, hover then click, and unrelated key handling.
- PR #417 landed as `f4432f2`; 3,952 tests and the production build passed, and
  the worker's six changed file hashes matched the tested image. Insert/update
  counters persisted at 1,000/2,000. The first public smoke run saw status 503;
  the subsequent complete 20-check run passed with decision readiness still
  false. No new-listing growth is claimed while daily write capacity is depleted.

Final integration receipts: refreshed against main #395/#396, keeping the new
body-style filter and pending-scope safeguards. The integrated view bar initially
hid phone prices; compact native disclosure and tighter spacing corrected it.
All 20 first-viewport/card-navigation cases then passed (five desks across desktop,
tablet, 320px Chromium and WebKit phone). Five forced iOS install-overlay cases
passed. Saved-card speculative prefetch was also disabled after the core pass
exposed aborted detail requests. Initial theme setup now happens before page load
instead of abandoning an initial Discover request; browser-error assertions remain
unchanged. The final ten tablet/WebKit core cases passed across light/dark loaded
Discover, inventory, Saved and Settings, including guide focus handling. These
functional receipts do not close the physical-device performance gate above.

The broader final Chromium matrix passed 95/100: all five landscape-tablet price
checks exposed a remaining first-viewport gap at 1024x768. The same existing price
preview now remains visible at every breakpoint, with duplicate vehicle identity
limited to phones; the original accessible body facts remain intact. The corrected
price/card-navigation matrix passed all 35 cases across the five Chromium sizes,
WebKit phone and Firefox desktop, covering every ordinary desk. This closes all
five diagnostic visibility failures, not a claim of a single 100/100 rerun.

Recording QA follow-up (2026-10-15): confirmed DriveNation's inventory lists
Savings before All In Price and Retail. The shared CMS parser now prioritizes the
seller's all-in/sale asking price and excludes savings, retail references and
financing-only amounts. Regression fixtures cover the reported Kia-shaped case
and card-to-deal import. This does NOT repair existing stored rows, rebuild the
running worker, or validate the valuation model. Recollect affected source rows
with the corrected worker, invalidate derived estimates and verify source detail
receipts before calling historical prices corrected.

Search usability follow-up: expose Max Miles and Source in the main results bar;
name the additional filter disclosure Year, distance & condition; add a visible
Search cars entry above Discover's compact filters; style Save buying preferences
as the primary form action. Existing mode-specific capabilities remain preserved.

Recording follow-ups still open: single-owner workspace simplification without
destroying archived capabilities; compact sparse discovery rails; radius-first
search across state borders; comparable-row provenance and estimate eligibility;
source-by-source price validation; lightweight feedback with permission-safe
storage. Test search first; do not equate a parser fixture with a corrected live
database or a model's comparable count with 20 qualified sold transactions.

DriveNation evidence follow-up: verified the K5 source detail states $19,520 and
54,124 miles. Its promotional 200-mile shipping radius was being used as the
odometer by the generic detail fallback. Read explicit `.d-title`/`.d-value`
fields and bounded JSON-LD mileage; never concatenate arbitrary digits or use
unlabelled delivery distances. The source registry no longer presumes all
DriveNation stock is repairable. A bounded dry-run/apply repair script validates
the project, URL, VIN, explicit all-in price, mileage and title; stores a before
receipt; compares updated_at before writing; and clears derived estimates instead
of immediately promising profit. Corrected price history excludes pre-correction
imports from customer charts without deleting the audit rows. Exact live apply
and worker rollout receipts must be recorded separately; fixture success is not
proof those operations ran.

Search clarity follow-up: keep model visible with a choose-make state; put ZIP
and radius alongside the primary filters; a completed ZIP removes the current
state boundary for this search only so nearby inventory may cross state borders.
Named radius collection is not yet supported by BuyerScope, so its source-plan
and collection actions must stop with a clear message instead of silently
collecting nationwide. Existing indexed inventory and public previews retain
their existing ZIP/radius filters. Applied-filter labels must not expose raw
storage slugs, and source/mileage selections no longer inflate the additional
filter count. Desktop Discover collections share two columns rather than giving
a sparse one-card collection an entire row; mobile retains its horizontal rails.

1. Inventory: permission-backed successful fresh-row receipts, validated price
   meaning, deduplication and authorized multi-photo completeness for each source.
   A configured adapter or a stored row count is not verified unique-car coverage.
2. Intelligence: versioned evidence shared across cards, comparisons, saved,
   alerts and pipeline; qualified local comps, measured repair costs and held-out
   outcomes. Keep unavailable estimates unavailable rather than inventing values.
3. Retention: independent review and targeted apply of #360, reference-survival
   tests, archive restore/replay and hosted capacity receipts. Unsafe cleanup stays
   paused; a 1TB worker disk does not expand Supabase/Vercel free-tier quotas.
4. Delivery and hosted workflows: missing VAPID/Resend setup, delivered/bounced
   receipts, real notification deep links, authenticated save/settings/onboarding
   persistence and populated pipeline tests. Empty screens are not end-to-end proof.
5. Performance: cold public status/API cost, field Web Vitals, real-device scroll
   and gallery rendering, offline/reconnect and installed-PWA lifecycle checks.
   This frontend release changes no database grants, source permissions, worker
   quotas or provider plans and requires no scraper rebuild by itself.
6. Unfinished performance integration: #343 virtual inventory and #344 list Back
   restoration remain drafts. Refresh against current main, prove 384+ loaded
   cards, retained focused items and Back restoration within 100px together.
   #345 map batching remains draft with failed CI; reconcile current DealerMap
   behavior, rerun the exact-head gate and verify 3,000+ pins. Old branch-local
   successes are not evidence these features are integrated or live.
7. Hosting eligibility: [Vercel's Hobby policy](https://vercel.com/docs/plans/hobby)
   limits that plan to personal/non-commercial use. Remaining below resource
   quotas is not permission for a commercial launch. Confirm the intended launch
   qualifies or choose compliant hosting before business rollout; do not silently
   upgrade a paid plan or describe free-tier headroom as commercial readiness.
