# Consolidated Completion Checklist

Snapshot: October 11, 2026, evening Chicago. This is the single integration index
for the user's audit, prior handoffs and the visible agent queue. It preserves
existing features and evidence; it does not declare the entire app finished.

## Read This First

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
