# DealerHunt remaining-work register — November 2, 2026

This register reconciles inspected code, the six-wave single-owner pilot plan and private release receipts. Checked means the stated bounded acceptance passed, not whole-app completion. The product remains a private independent-resale pilot: Market Explorer first, Discover second. Existing accounts, ownership and history stay protected.

## Released foundation

### November 5 Firefox keyboard follow-up — isolated browser receipts

- Isolated branch `codex/nav-keyboard-followup` starts at `origin/main` merge `2f4cc021`. Its base tree is identical to the original browser snapshot at `45e3ee3b`; the shared integration checkout and its edits remain intact. Main through performance PR #638 (`dcf78dad`) is integrated before the independent follow-up gate.
- Reproduced Firefox blocking Enter activation after a navigation scrub: its keyboard-generated click has `detail=1`, so the old pointer-click suppression intercepted it. Enter now clears that stale suppression. The regression failed against the old hook and all 10 navigation-hook tests passed with the fix.
- Official Playwright 1.63.0 installed Firefox 155.0 and WebKit 26.6 plus their dependencies only inside the disposable local Docker harness. With `E2E_CROSS_BROWSER=1`, latest bounded results after fixes and targeted reruns are 7/7 per engine: Market draft Apply/Cancel, Back, dealer source/radius persistence, cursor ZIP/distance sorting, isolated bid labels/table, real local map selection plus pointer/keyboard navigation, and 200% CSS header reflow. Auth and listing reads use the actual isolated local stack; only the auction photo response is mocked.
- WebKit's apparent 4,936px Back drift was an offscreen pre-click measurement: the product restored the actual saved marker within about 0.75px. The test now centers and verifies the clicked link before measuring, retaining its 16px threshold. Final return offsets were 0.75px WebKit and 0.48px Firefox. Reflow waits for loaded inventory and a painted downward scroll before reversing; its DOM scrolling checks layout, because Playwright mobile WebKit does not support `mouse.wheel`.
- Cleanup verified zero owned cross-browser map and auction rows. No production data writes, credentials in receipts, ADB, or changes to other Docker services. The harness remains available for reruns. Linux WebKit/iPhone emulation does not establish physical Safari/iOS or installed-app feel; CSS scaling is not native browser zoom. Map marker/selection behavior passed, but external basemap tile delivery was not asserted and the WebKit basemap capture is blank.
- Machine-readable results and scope limits: [`receipts/nav-keyboard-cross-browser-2026-11-05.json`](receipts/nav-keyboard-cross-browser-2026-11-05.json). Local screenshot/JSON bundle `dealerhunt-market-pilot-9gpye4si` retains `cross-browser-final-results`, `cross-browser-reflow-final-results`, their reports, and initial diagnostic failures. Full release gate, exact-head CI and deployment are separate acceptance receipts; these browser results alone do not declare release completion.

### November 5 PR #637 production receipt

- PR #637 is live at [dealerhunt.vercel.app](https://dealerhunt.vercel.app): merge `2f4cc021`, Vercel deployment `dpl_5LyWmfgxrfbykkbD1WprAWqw1Uoi`. CI passed with **5,921 full tests**.
- Production guest verification: **20 passed, 22 safely skipped**. Skips remain outside the accepted coverage.
- Newest-first Missouri/Florida cash-price inventory with photos returned three batches in **1.846 s, 0.506 s, and 0.589 s**, with **150 unique vehicles**.
- **Current cold alternate-search acceptance is pending.** These newest-feed timings do not close the genuinely cold price-sort/Insights performance gate.

### November 5 interaction and search follow-up — acceptance in progress

- Working branch `codex/pilot-interaction-completion` shares complete candidate scans for equivalent set-valued filters, opposite price directions, and independent Insights within a bounded 30-second, per-instance cache. Identical concurrent reads coalesce. Eligibility, full-result ordering, unknown-value handling and desk scope remain unchanged. This is not a distributed cache or proof of cold-search acceptance.
- Added bounded server diagnostics for Auth, location lookup, database-client batch wait, price interpretation, photo eligibility, aggregation, sorting and response serialization. Payload sizes are sampled decoded-JSON estimates, not measured wire bytes; client batch wait includes network and decoding, not isolated PostgreSQL execution. Retained all evidence fields: candidate/display splitting and a new index require representative production measurements before changes.
- Feed snapshots retain owner, desk, search, loaded vehicles, continuation, retry state and vehicle anchor for 30 minutes within the browser session. Account switches discard rendered owner-scoped state; unavailable storage falls back to fetching. Photo navigation retains its position, fixed stage dimensions and local retry. Map selection restores only for the same search and available vehicle. Feed scroll-up controls now show search/location context and active-filter count.
- Fixed a previous navigation timeout canceling a newer drag. Existing rim, inner highlight and pressed surfaces were verified against cached official Nuvio mobile source (revision `46febb568348aa5e135bff0d4d5c914933aff5a0`): 0.75 dp reference rim and 24 dp blur; DealerHunt uses a 1 px rim and 24 px blur. Native fidelity and physical feel are not claimed. Navigation component checks covered 320/390/430/768/1200/1440px, light/dark, reduced motion and keyboard focus.
- Replaced the expired-auction bid-label dependency with a dedicated isolated fixture and verified-cleanup assertions. Presentation mocks remain separate from persisted workflow acceptance. Initial focused checks passed; full local gate, exact-head CI, deployment and authenticated rerun receipts must be attached before release acceptance.
- Authenticated follow-up exposed obsolete immediate-filter/exact-total assertions: tests now require explicit Apply, persist both selected sources after reload, and distinguish bounded cursor inventory from exact distance-sort totals. The latest nine authenticated browser checks passed at desktop, 768px and 390px. Mobile Market Back drift was fixed by restoring the body scroller; measured return offsets were 0px desktop/tablet and 0.66px mobile. These are bounded browser checks, not the complete owner journey.
- Map preview reflows its photo, title, location and actions at narrow widths. TopNav now wraps when content requires it and publishes its measured height for sticky controls rather than overlapping them. Forty isolated browser cases distinguished native 200% zoom from CSS scaling, with no offscreen targets, target collisions or header/search overlap. These actual-component captures use fixture account/preferences.
- Swipe displacement, velocity, tilt and Save/Pass feedback now scale to the measured card width. Tests cover small, phone and tablet widths, short drags, opposed velocity and invalid measurements; physical reference-app fidelity remains unverified.
- Additional isolated acceptance: 21 persisted checks passed (18 existing checks and three connected real UI/API journeys through Saved, Compare, purchase, Pipeline costs/sale, linked outcome and account isolation). Eighteen separately mocked UI checks passed. Source-selection/ZIP checks passed six of six after correcting obsolete immediate-save/exact-total expectations. Cleanup verified zero owned listing, Saved, inventory and outcome fixtures. Feed's 24-card mocked-photo return check restored with zero drift in both themes; the real local Feed was empty, so those captures do not prove live inventory coverage.
- The first full gate found one outdated recovery mock (5,920 other tests passed). The fixture now supplies a resolved owner explicitly, and its focused error/retry test passes. Final gate and CI receipts remain required; no failed gate is treated as a release.
- Branding lives separately in `codex/dh-brand-review`. The approved raster reference supplies the H geometry; review captures and motion evidence are prepared separately. It must not merge or deploy before design review and its release gate passes.
- Still open: three genuinely cold price-ascending, price-descending and Insights requests each under 10 seconds; production query-plan and transfer analysis; complete owner and cross-account journey; source publication receipts; long-session memory/slow-network profiling; physical iPhone/Android installed-app and touch acceptance. Keep archival disabled pending independent recovery and isolated restore.

### PR #633 release verification

- Vercel reported a successful production deployment of merge 081c6973. GitHub CI and 5,877 local tests passed.
- Signed-in desktop Chromium ran against the isolated Docker stack with the repository lockfile installed and the app, browser, and Auth gateway sharing loopback. All 10 selected checks passed: six account setups, Market filter Apply and Cancel, light and dark outcome ledger, and purchase retry with one recorded purchase and retained photos and cents.
- The deployed Missouri and Florida cash search with photos required and repairables excluded returned HTTP 500 for newest first (9.02 s), price ascending (10.09 s), mileage ascending (11.32 s), and aggregate Insights (21.81 s). The public status reported buyerReady=true and decisionReady=false. The request failure cause is unconfirmed. Treat the earlier successful feed timings as historical.
- Later-batch Grid and Table restoration, the full owner journey and isolation, source publication receipts, physical devices, and independent recovery still need acceptance evidence.

### November 4 private pilot evidence

- PR #630 passed CI and deployed. The Missouri and Florida cash-price feed returned 50 listings in 3.41 s, 1.23 s, and 1.38 s on three uncached runs. Three consecutive cursor pages returned 150 unique listings.
- The same scope returned HTTP 500 for price ascending (10.10 s), mileage ascending (30.57 s), and aggregate Insights (25.17 s). These paths still read the full result set and remain open.
- PR #631 shipped keyboard navigation and Back restoration in Market Table. It passed 137 focused tests, type checking, and CI on the merged revision. Vercel deployed merge `88cca474`. A fresh production feed smoke check returned 50 listings with a continuation in 3.75 s.
- The app and Playwright reached isolated Auth by sharing the local Kong container's network namespace and using loopback. Applying the existing atomic owner preferences migration to the isolated database restored preference saves. A service-role write was confirmed in a rolled-back transaction.
- After that migration, all six desktop account setup checks, Market Back restoration, and the light and dark outcome ledger tests passed. The purchase retry rerun passed after the assertion was scoped to the recorded vehicle's visible Purchase cost row. It verified matching retry submissions, a single stored purchase, retained photos, and cents. Grid/Table later-batch restoration and the full owner and isolation suites remain open.
- The inventory owner-guard and stage-transition test passed at desktop and 390 px after explicitly persisting the reseller fixture mode. The Pipeline financial evidence rerun passed at both sizes after opening Costs and performance before checking the metrics. That run used mocked financial and sale-review responses; it verifies UI behavior separately from persisted inventory isolation.

### November 3 private pilot evidence

- PR #628 deployed a narrower Market analysis projection. The 49 Market route tests, full local gate, and CI passed. A read-only 500-row sample transferred 659,726 bytes before the change and 260,412 bytes with the new projection.
- The uncached 30-day Missouri and Florida cash-price search, with photos required and repairables excluded, returned HTTP 500 in 26.20 s, HTTP 200 in 25.85 s (13,939 matches), and HTTP 500 in 21.58 s. The 10-second acceptance gate failed. Capture per-page database and transfer timings, then measure eligibility filtering and sorting before selecting the next optimization.
- Local authenticated Playwright remains pending. The isolated Supabase gateway has no host binding, and Windows refused connections through a temporary published port. The temporary gateway was removed. Run the app and test browsers on the isolated Docker network with local credentials verified before fixture creation.
- St. James lot 1855 has an explicit junk-title disclosure in the seller description while the structured title says Other. DealerHunt showed Title unknown. Keep the disclosure visible and verify source precedence before updating the title classification. Lot 1401 is a seller-described F-250/Excursion conversion and warrants the existing identity warning.
- ReCar's restriction was verified in the deployed collector image in the prior pass. D&G has no newer successful receipt and the live worker reported zero remaining inserts and updates. AutoTempest publication, GovDeals detail evidence, and decision readiness still need verification.
- Physical-device checks, the authenticated owner journey, account isolation, and independent recovery remain acceptance gates. Keep private pilot access controlled and archival disabled.

- [x] PR614: VIN-matched primary dealer price/location observations, gallery extraction and original inventory entrypoints. Advertised final amounts remain unverified cash prices unless supported.
- [x] PR615: blocked/disabled sources remain visible in the unavailable group; impossible refreshes explain why instead of silently failing.
- [x] PR616: requested-shop names fit their own card at 320/390/430/768/1440px; selected availability filters expose state. Deployed console check passed.
- [x] PR617: persistent last-attempt enrichment cursor replaces clock-based batches that repeatedly selected the same cars. Tested interruption/restart and same-worker overlap; pinned running image verified. This is not distributed multi-worker locking.
- [x] Existing shared economics readiness, misleading-price exclusions, full-model comparisons, atomic preferences, image fallback and source-health cancellation were released in earlier slices. Their remaining live/device acceptance is listed below.

## P0 — Auction-detail truth (current implementation)

- [ ] Release the GovDeals/AllSurplus detail-field repair: actual `assetLongDesc`/`assetShortDesc` aliases, matched-lot galleries, description and title/meter facts under persisted `options`, and correct marketplace source links.
- [ ] Remove assumed run-and-drive condition; preserve buyback disclosures without classifying them as clean, salvage or rebuilt. Keep unknown odometer accuracy separate from comparison mileage.
- [ ] Reject mismatched detail asset/account identities, unrelated images and invalid bids. Keep bids separate from cash asking prices.
- [ ] Pass mapper, actual pipeline-persistence and wrong-lot response regressions, full gate, exact-head CI, deployment and collector provenance. Then verify a permitted new observation; old snapshots must not be declared corrected without an actual write receipt.
- [ ] Preserve actual auction premium, processing fees, reserve and removal disclosures with their source/time. Existing 20-photo storage bound remains; do not claim a 23-photo gallery was fully stored.

## P1 — Restore reliable source output

- [ ] Inventory every registered runner and dealer by role, effective setting, authentication requirement, policy reason, supported scope, last attempt and usable output. Separate vehicle inventory from parts and sold-price evidence.
- [ ] Reconcile `SCRAPE_SOURCES` replacement behavior, default sweep membership, per-source backoff and runtime flags. Restore accidentally omitted app-side settings only with evidence of the intended configuration; preserve active work.
- [ ] Fix AutoTrader/TrueCar blocked fetches returning successful zero results. An access barrier must not become “No matching inventory”; preserve any confirmed partial persistence receipt.
- [ ] Align runtime health authentication/cadence metadata with runner registrations. Copart account requirements for bidding must not imply its public collection feed requires sign-in.
- [ ] Replace globally capped latest-run sampling with bounded latest evidence per source and an explicit rate window, so busy sources cannot hide quieter adapters.
- [ ] Explain pending-intake rejection reasons. Recovery currently applies raw historical host blocks while fresh collection uses effective restored-host policy; preserve this distinction until a deliberate reconciled policy change is implemented.
- [ ] Distinguish historical policy records, operator restoration and actual runtime responses. Existing restoration is not proof of successful output; configuration alone is not verified provider permission.
- [ ] Confirm queued D&G/Missouri and St. James/Missouri jobs after existing daily allowance resets. Record requested scope, fetched observations, unique vehicles, exclusions, inserts, updates, renewals, unchanged and deferred outcomes.
- [ ] Recheck AE of Miami, ReCar, Damage, Riverbend, Glen’s and the remaining approved Missouri adapters individually. Retain explicit unavailable/access reasons rather than silently removing sites or bypassing challenges.
- [ ] Verify AutoTempest scope, pagination, photo eligibility and publication: the recorded 1,000 eligible observations with zero writes were not 1,000 new cars. Retain attribution and deduplicate cross-source identity.
- [ ] Expand across the owner's real radius and state borders after Missouri receipts, then other explicitly selected locations. Count coverage from observations, not catalogue directory entries.

## P1 — Capacity and freshness

- [ ] Re-measure table/index/payload/write costs and repeated no-op updates. The latest Nov2 snapshot was about 414 MB allocated and zero app-configured daily insert/update allowance remaining; these are not claimed Supabase daily write quotas.
- [ ] Reduce measured duplicate work and payload overhead without deleting protected history, raising quotas or changing the three-day default / 30-day research windows.
- [ ] Retain independent known-inventory refresh capacity alongside new buyer searches, and report defer reasons accurately. Queued/recheck time must not be presented as a completion promise.
- [ ] Repair Windows host-to-container loopback connectivity without exposing the worker publicly, changing unrelated services, or assuming container-local health proves host connectivity. Authenticated local browser acceptance is still incomplete.

## P1 — Recommendation and valuation evidence

- [ ] Persist comparison sample identifiers, sources, observed dates, geography, eligible/excluded counts and exact calculation assumptions. Legacy Bronco references lack a traceable full sample/math receipt.
- [ ] Reassess affected legacy prices in bounded resumable batches. Preserve originals and correction history; a new parser is not a completed historical repair.
- [ ] Audit every enabled provider's selling price versus savings, down payment, periodic payment, qualified finance amount, current bid and buy-now price.
- [ ] Reconcile VIN/canonical-link duplicates while retaining distinct vehicles, source attribution and Saved relationships.
- [ ] Keep clean retail, auction, rebuilt, salvage and parts-only eligibility consistent across Results, Feed, Swipe, Map, comparisons, MCP, alerts and exports.
- [ ] Capture permitted sold evidence and genuine owner outcomes, separating completed sales from asking prices. Measure regional/title/condition/source errors before changing readiness thresholds. Do not promise accuracy or profitability percentages.
- [ ] Verify source/time, missing checks and all three verdict explanations beside conclusions. Keep unsupported repair estimates, profit and purchase ceilings withheld.

## P2 — Search, photographs and vehicle journeys

- [ ] Verify visible model, mileage, source, title, condition, budget, radius and sort controls in every presentation, including cross-border distances and unknown-location disclosure.
- [ ] Verify shared filters, selection and return position through Results/Feed/Swipe/Map/details; pagination beyond two batches, deduplication, retry, exhaustion and stale-response cancellation.
- [ ] Complete feed overlay/accessibility, swipe versus scroll arbitration, undo and keyboard alternatives; map clustering, photo previews and selected-card synchronization.
- [ ] Audit source stock images, documents, stickers and placeholders. Session-local image failures must not change persisted availability or delete Saved history. Reconcile total/loaded/displayed/photo-hidden counts.
- [ ] Complete populated Saved/Compare/Pipeline inspection, purchase, cost, recon, sale and outcome flows with designated fixtures and cleanup receipts. Preserve originals.
- [ ] Simplify detail reading order around photos, price meaning, verdict, costs and evidence; one primary next action and expandable advanced facts. Recheck sticky navigation/filter controls for clipping and overlap.
- [ ] Profile physical iOS/Safari and Android scrolling, gestures, slow networks and long sessions. Browser viewport checks are not physical-device acceptance.

## P2 — Account, preference, notification and support acceptance

- [ ] Finish authorized first-time Google/email signup, confirmation, interrupted onboarding, browser restart/session restoration and logout; returning Google and isolated persistence checks do not cover every journey.
- [ ] Confirm user-completed phone password recovery. An email marked Delivered does not prove successful reset.
- [ ] Verify concurrent/cross-device preferences and header/settings/onboarding/search synchronization before queueing location demand. Preserve retryable drafts.
- [ ] Retain legacy buyer modes for compatibility while completing the single-owner reseller experience; no forced repeat onboarding or changes to server authorization.
- [ ] Extend account alert criteria for mileage/radius/specifications atomically without losing existing searches; verify worker matching.
- [ ] Consolidate alert transport onto approved Brevo where supported; keep Auth separate. Verify accepted/delivered/failed events, opt-out, duplicate suppression, device push and deep links.
- [ ] Complete feedback submission, owner-isolated admin review/correction/resolution and monitored support links. No invented mailboxes.

## P2 — Recovery, security and release acceptance

- [ ] Verify owner retrieval of the recovery key independently of this PC and an isolated restore using that copy. The private Drive copy/checksum alone does not satisfy independent recovery acceptance.
- [ ] Finish encrypted versioned archives, manifests/checksums, service-only index, guarded freshness/version/reference transaction, admin restore and original-identity recovery.
- [ ] Test archive races/failures, then a 100-record eligible canary. Archival remains disabled until recovery and eligibility pass; preserve the >30-day unseen cutoff and all protected records.
- [ ] Complete HTTP/browser cross-account isolation for Pipeline/costs/outcomes/feedback and maintenance; SQL rollback tests are separate evidence.
- [ ] Verify MCP key issuance/owner binding/revocation/rate limits, safe errors and no privileged diagnostics on customer pages.
- [ ] Complete authenticated isolated browser release checks plus expired-session, timeout, outage, offline, installed-PWA update and rollback acceptance.
- [ ] Measure API latency, responsiveness, layout shifts, image transfers and long-session memory; optimize demonstrated bottlenecks.
- [ ] Review remaining dependency/runtime-engine findings, provider-owned database advisor findings and measured hosting usage. Private pilot does not establish commercial eligibility on Vercel Hobby.
- [ ] Every release: focused regressions → full required gate → exact-head CI → merge → deployment → production proof. Collector releases additionally need matching running-image provenance and retained rollback.

Owner/device acceptance and genuine provider access requirements remain explicit dependencies. They do not stop independent code fixes. No paid services, raised quotas, fabricated coverage/freshness or permanent user-history loss are authorized by this register.
