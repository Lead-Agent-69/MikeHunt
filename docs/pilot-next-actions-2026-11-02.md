# DealerHunt remaining-work register — updated November 5, 2026

This register reconciles inspected code, the six-wave single-owner pilot plan and private release receipts. Checked means the stated bounded acceptance passed, not whole-app completion. The product remains a private independent-resale pilot: Market Explorer first, Discover second. Existing accounts, ownership and history stay protected.

## Current acceptance — November 5

Local authenticated QA is closed for the bounded suites below through the Docker local app, Auth gateway and browser harness. This does not require a Windows host-network repair and does not establish production authenticated, physical-device or whole-app acceptance. Historical pending statements below are superseded by this section.

| Release                                                    | Merge      | Verified result                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#637](https://github.com/Lead-Agent-69/MikeHunt/pull/637) | `2f4cc021` | Full gate / exact-head CI passed; Production Ready (`dpl_5LyWmfgxrfbykkbD1WprAWqw1Uoi`). Guest 20 passed / 22 safely skipped. Newest MO/FL cash/photo pages: 1.846 / 0.506 / 0.589 s, 150 unique.                                                                                                                              |
| [#638](https://github.com/Lead-Agent-69/MikeHunt/pull/638) | `dcf78dad` | Full gate / CI and Production deployment passed. Reviewed projection migration applied; receipt count 1; `security_invoker=true`, SELECT denied to anon/authenticated and allowed to service_role. All 15 projected fields across 500 source rows: zero mismatches. No vehicle writes or index creation.                       |
| [#639](https://github.com/Lead-Agent-69/MikeHunt/pull/639) | `a612f332` | Firefox Enter-after-scrub fix released; full gate / CI: 5,926 passed, 16 skipped; build passed. Production `dpl_65C9f7zLSDXGCRaw9iQCQw6oMr9e` Ready; four GET-only smoke responses 200. Local Firefox/WebKit 7/7 each.                                                                                                         |
| [#640](https://github.com/Lead-Agent-69/MikeHunt/pull/640) | `0d66376b` | Full gate / [CI](https://github.com/Lead-Agent-69/MikeHunt/actions/runs/42029833953) and Production deployment passed (GitHub deployment `7574548149`). Full scans request 1,000 rows and exhaust on an empty response; actual PostgREST caps 500 and 1,000 passed nine tests each.                                            |
| [#641](https://github.com/Lead-Agent-69/MikeHunt/pull/641) | `833f6312` | Full gate / [CI](https://github.com/Lead-Agent-69/MikeHunt/actions/runs/42031582704) and Production deployment passed (GitHub deployment `7574849693`). Bounded normalized-host cache preserves source resolution; complete synthetic route outputs matched in all three baseline comparisons. Cold acceptance remains failed. |
| [#642](https://github.com/Lead-Agent-69/MikeHunt/pull/642) | `04d89aed` | Full gate: 5,967 passed / 17 opt-in skips, build passed; exact-head [CI](https://github.com/Lead-Agent-69/MikeHunt/actions/runs/42034228789) passed. Production `dpl_Ctu7TsNMtczhXjQLFuNFezPpBArh` Ready; alias verified. Six guest smoke checks passed. Confirmed evidence gates now protect Market purchase economics.       |

Skipped setup/authentication tests are not accepted coverage. Supabase Preview skips are also not substitutes for actual isolated runs. Detailed implementation evidence: [projection](market-json-candidate-projection.md), [batching](market-fullscan-batching-2026-11-05.md), [eligibility CPU](market-eligibility-profile-2026-11-05.md), and [cross-browser results](receipts/nav-keyboard-cross-browser-2026-11-05.json).

### Closed bounded local QA

- [x] **21 persisted workflow checks**: 18 existing checks plus three connected real UI/API Saved → Compare → purchase → Pipeline costs/sale → linked outcome/account-isolation journeys. Another **18 mocked UI checks** passed separately (Saved paging/recovery 3, Pipeline presentation 3, comparison chart 12). Mocked responses do not establish persistence.
- [x] **Nine authenticated Market/filter/Back checks** across desktop, 768px and 390px; body-scroll return offsets 0 / 0 / 0.66px. Source/ZIP assertions separately passed 6/6: Apply commits drafts; both sources persist; cursor inventory has intentional `total:null`, while distance-sort totals are exact. Expired-auction dependency replaced by a designated local persisted fixture.
- [x] **Firefox 7/7 and WebKit 7/7**: draft Apply/Cancel, Back, source/radius, ZIP/distance sorting, bid table, local Map/nav and 200% CSS reflow. Measured Back offsets 0.48 / 0.75px. Linux WebKit emulation is not physical Safari; CSS scaling is not native zoom. External map tiles were not asserted.
- [x] Cleanup found zero owned listing, Saved, inventory, outcome, comparison and cross-browser auction/map rows. Harness `dealerhunt-market-pilot-633` remains available. The four shared dirty copies were preserved during #639 work; at this reconciliation the shared checkout was observed clean at merge `a612f332`. This documentation branch did not change or clean that checkout. No fixture JWT was sent to production.
- [x] Actual-component responsive captures covered 320/390/430/768/1200/1440, light/dark, reduced motion and keyboard; 40 nav checks passed. Feed's 24-card mocked-photo long-page/Back checks restored with zero drift in both themes. The actual local Feed was empty, so these are presentation receipts, not live Feed inventory evidence.

Local artifact bundle `dealerhunt-market-pilot-9gpye4si` retains `owner-workflow-summary.json`, `owner-persisted-results.json`, `owner-journey-results`, `owner-ui-comparison-results`, `market-return-body-scroller`, `cross-browser-final-results`, `cross-browser-reflow-final-results` and HTML/screenshot reports. The release table and these suites cover their recorded snapshots; they are not a rerun of every suite on #642 or the combined branding release.

### Latest production scope and remaining gates

- Hegel's final #642 receipt completed at 13:45:02 UTC. `/market` redirected to login for a guest, `/api/admin/stats` returned 401, and public health reported `buyerReady=true`, **`decisionReady=false`**. The fresh empty-storage Firefox/WebKit production attempt after #639 likewise reached login with no dock; the released keyboard sequence was therefore **blocked, not production-passed**. No credentials or account/Saved writes were used; WebKit telemetry POST was blocked.
- In #642's reported-cash/minPrice=1 guest slice (157 eligible), all nine requests returned 200: ascending 5.737 / 5.887 / 2.039 s, descending 2.363 / 3.629 / 2.219 s, Insights 2.295 / 2.358 / 2.030 s. Three pages held 150 unique finite cash prices in ascending `price.cashPrice` order. All 157 retained “Asking price”; the supported asking-comparison estimate retained its “3 asking-price comparisons · low confidence” label. Guest purchase fields and aggregate profit-evidence counts were zero. Guest redaction does not prove authenticated supported-profit behavior.
- A separate #642 guest scope without the reported-cash filter returned 4,328 eligible rows (`capped=false`). Nine distinct application query keys all returned 200, with platform cache MISS: ascending 3.246 / 2.140 / 1.899 s, descending 2.287 / 2.005 / 1.894 s, Insights 2.153 / 2.074 / 2.199 s. Database caches were not disabled. **Both these and the prior 15,124-eligible-row MO/FL research probes were guest requests. The mismatch was query parameters, not authentication. These smaller-scope passes do not close the previous 24.590 s cold failure.** Full sanitized source receipt is retained at `artifacts/market-economics/pr642-production-receipt.json` in the `market-economics-gates` worktree; the checked-in [receipt copy](receipts/pr642-production-2026-11-05.json) preserves the final values and limitations.
- Hegel's corrected exact-scope #642 rerun used `priceBasis=cash&states=MO,FL&browse=1&hasPhotos=yes&includeRepairable=0&mode=all&sort=askPrice&sortDir=asc&page=0|1|2&_qa=<nonce>`. It returned **15,124 eligible rows**, 150 unique across three pages, correct `price.cashPrice` ordering and HTTP 200 throughout; page timings were **21.553 / 0.267 / 0.248 s**. No eligibility regression was reproduced. This API rerun was guest `mode=all`, not an authenticated flip-desk smoke, and the first-page latency still fails 10 seconds. The 4,328/157 probes omitted `browse=1`, states and `includeRepairable=0`; the default freshness window is three days, while `browse=1` uses 30 days. Their lower counts/timings cannot be compared as evidence of a full-scope speedup. The checked-in receipt includes the correction and original query definitions.

Final exact-scope #642 acceptance completed at 14:03:31 UTC using the same guest MO/FL `browse=1` parameters above, page 0/default 50 rows and a unique `_qa` per request. Ascending/descending used `sort=askPrice`; independent Insights used `sort=lastSeenAt&sortDir=desc&aggregate=1`. All nine returned HTTP 200, total 15,124, `capped=false`, 50 rows and platform MISS. **The all-requests 10-second target FAILED: two of nine exceeded it.** No timeouts or retries occurred. Guest purchase fields remained absent, with zero profit/profit-score evidence counts.

| Exact MO/FL guest query  | Attempt 1 | Attempt 2 | Attempt 3 |
| ------------------------ | --------: | --------: | --------: |
| Ascending                |  23.832 s |   7.468 s |   6.684 s |
| Descending               |  15.889 s |   6.690 s |   6.528 s |
| Insights (`aggregate=1`) |   8.742 s |   7.175 s |   6.458 s |

Unique application query keys and Vercel MISS do not prove physically cold database reads. No cache purge or database reset occurred. The prior three-page result was not repeated in these nine probes. The [checked-in receipt](receipts/pr642-production-2026-11-05.json) embeds all exact URLs, results and cache limitations in `finalExactScopeAcceptance`; it supersedes the smaller-scope samples for pilot performance acceptance.

- **Cold performance remains open:** the first cold ascending request after #641 took **24.590 s**, exceeding 10 s. Three genuinely cold ascending, descending and independent Insights runs each under 10 s in the same acceptance scope remain required. Raw full-query first-1,000-row EXPLAIN was about **3,040.7 ms** versus **12,209.6 ms** for expanded predicates; that slower alternative was rejected and must not be represented as shipped. A batch EXPLAIN and cache-busted API keys do not prove cold end-to-end acceptance. Hubble's bounded local query-only experiment found no consistent improvement; no additional performance code is accepted from that experiment.
- **Source production receipts remain open:** permitted per-adapter observations, exclusions and actual inserts/updates/publication, collector provenance, and historical correction evidence. Configuration, directory entries, zero-write observations and local fixtures do not establish production source coverage.
- **External/device gates remain open:** physical iPhone/Android and installed-PWA acceptance, long-session/slow-network behavior, independently retrieved recovery key and isolated restore, first-time/recovery Auth delivery and user-completed reset, notification delivery/opt-out/device push. Keep archival disabled pending recovery and eligibility acceptance.
- **Branding approved and live:** [PR #636](https://github.com/Lead-Agent-69/MikeHunt/pull/636) passed review with user approval and merged at 14:04:46 UTC as `bf54b40a271fa033f3c8c697a69c3b880aae45ec`. GitHub Production deployment `7575735588` succeeded; combined-main CI passed. The user-supplied release receipt confirms all 21 asset hashes match and the signed-in `release-production-market.jpg` capture. Earlier review-only status is superseded. [Brand evidence](dh-brand-review.md) and [startup acceptance](brand-review/startup-acceptance.md) remain separate from physical-device acceptance.
- **Application release status:** the planned application releases are merged and deployed. The performance acceptance gate remains unmet; no query-only performance fix has been proven. The explicit source-production, physical-device, recovery/Auth delivery and other acceptance gaps above remain open; this is not whole-app completion.

## Released foundation

### November 5 Firefox keyboard follow-up — isolated browser receipts

- Isolated branch `codex/nav-keyboard-followup` starts at `origin/main` merge `2f4cc021`. Its base tree is identical to the original browser snapshot at `45e3ee3b`; the shared integration checkout and its edits remain intact. Main through performance PR #638 (`dcf78dad`) is integrated before the independent follow-up gate.
- Reproduced Firefox blocking Enter activation after a navigation scrub: its keyboard-generated click has `detail=1`, so the old pointer-click suppression intercepted it. Enter now clears that stale suppression. The regression failed against the old hook and all 10 navigation-hook tests passed with the fix.
- Official Playwright 1.63.0 installed Firefox 155.0 and WebKit 26.6 plus their dependencies only inside the disposable local Docker harness. With `E2E_CROSS_BROWSER=1`, latest bounded results after fixes and targeted reruns are 7/7 per engine: Market draft Apply/Cancel, Back, dealer source/radius persistence, cursor ZIP/distance sorting, isolated bid labels/table, real local map selection plus pointer/keyboard navigation, and 200% CSS header reflow. Auth and listing reads use the actual isolated local stack; only the auction photo response is mocked.
- WebKit's apparent 4,936px Back drift was an offscreen pre-click measurement: the product restored the actual saved marker within about 0.75px. The test now centers and verifies the clicked link before measuring, retaining its 16px threshold. Final return offsets were 0.75px WebKit and 0.48px Firefox. Reflow waits for loaded inventory and a painted downward scroll before reversing; its DOM scrolling checks layout, because Playwright mobile WebKit does not support `mouse.wheel`.
- Cleanup verified zero owned cross-browser map and auction rows. No production data writes, credentials in receipts, ADB, or changes to other Docker services. The harness remains available for reruns. Linux WebKit/iPhone emulation does not establish physical Safari/iOS or installed-app feel; CSS scaling is not native browser zoom. Map marker/selection behavior passed, but external basemap tile delivery was not asserted and the WebKit basemap capture is blank.
- Machine-readable results and scope limits: [`receipts/nav-keyboard-cross-browser-2026-11-05.json`](receipts/nav-keyboard-cross-browser-2026-11-05.json). Local screenshot/JSON bundle `dealerhunt-market-pilot-9gpye4si` retains `cross-browser-final-results`, `cross-browser-reflow-final-results`, their reports, and initial diagnostic failures. The independent full gate, exact-head CI and #639 deployment subsequently passed as recorded above; browser receipts retain their separate scope.

### November 5 PR #637 production receipt

- PR #637 is live at [dealerhunt.vercel.app](https://dealerhunt.vercel.app): merge `2f4cc021`, Vercel deployment `dpl_5LyWmfgxrfbykkbD1WprAWqw1Uoi`. CI passed with **5,921 full tests**.
- Production guest verification: **20 passed, 22 safely skipped**. Skips remain outside the accepted coverage.
- Newest-first Missouri/Florida cash-price inventory with photos returned three batches in **1.846 s, 0.506 s, and 0.589 s**, with **150 unique vehicles**.
- **Current cold alternate-search acceptance is pending.** These newest-feed timings do not close the genuinely cold price-sort/Insights performance gate.

### November 5 interaction and search follow-up — released in #637

- Released #637 shares complete candidate scans for equivalent set-valued filters, opposite price directions, and independent Insights within a bounded 30-second, per-instance cache. Identical concurrent reads coalesce. Eligibility, full-result ordering, unknown-value handling and desk scope remain unchanged. This is not a distributed cache or proof of cold-search acceptance.
- Added bounded server diagnostics for Auth, location lookup, database-client batch wait, price interpretation, photo eligibility, aggregation, sorting and response serialization. Payload sizes are sampled decoded-JSON estimates, not measured wire bytes; client batch wait includes network and decoding, not isolated PostgreSQL execution. Retained all evidence fields: candidate/display splitting and a new index require representative production measurements before changes.
- Feed snapshots retain owner, desk, search, loaded vehicles, continuation, retry state and vehicle anchor for 30 minutes within the browser session. Account switches discard rendered owner-scoped state; unavailable storage falls back to fetching. Photo navigation retains its position, fixed stage dimensions and local retry. Map selection restores only for the same search and available vehicle. Feed scroll-up controls now show search/location context and active-filter count.
- Fixed a previous navigation timeout canceling a newer drag. Existing rim, inner highlight and pressed surfaces were verified against cached official Nuvio mobile source (revision `46febb568348aa5e135bff0d4d5c914933aff5a0`): 0.75 dp reference rim and 24 dp blur; DealerHunt uses a 1 px rim and 24 px blur. Native fidelity and physical feel are not claimed. Navigation component checks covered 320/390/430/768/1200/1440px, light/dark, reduced motion and keyboard focus.
- Replaced the expired-auction bid-label dependency with a dedicated isolated fixture and verified-cleanup assertions. Presentation mocks remain separate from persisted workflow acceptance. Full local gate, exact-head CI, deployment and bounded authenticated receipts passed as recorded above.
- Authenticated follow-up exposed obsolete immediate-filter/exact-total assertions: tests now require explicit Apply, persist both selected sources after reload, and distinguish bounded cursor inventory from exact distance-sort totals. The latest nine authenticated browser checks passed at desktop, 768px and 390px. Mobile Market Back drift was fixed by restoring the body scroller; measured return offsets were 0px desktop/tablet and 0.66px mobile. These are bounded browser checks, not the complete owner journey.
- Map preview reflows its photo, title, location and actions at narrow widths. TopNav now wraps when content requires it and publishes its measured height for sticky controls rather than overlapping them. Forty isolated browser cases distinguished native 200% zoom from CSS scaling, with no offscreen targets, target collisions or header/search overlap. These actual-component captures use fixture account/preferences.
- Swipe displacement, velocity, tilt and Save/Pass feedback now scale to the measured card width. Tests cover small, phone and tablet widths, short drags, opposed velocity and invalid measurements; physical reference-app fidelity remains unverified.
- Additional isolated acceptance: 21 persisted checks passed (18 existing checks and three connected real UI/API journeys through Saved, Compare, purchase, Pipeline costs/sale, linked outcome and account isolation). Eighteen separately mocked UI checks passed. Source-selection/ZIP checks passed six of six after correcting obsolete immediate-save/exact-total expectations. Cleanup verified zero owned listing, Saved, inventory and outcome fixtures. Feed's 24-card mocked-photo return check restored with zero drift in both themes; the real local Feed was empty, so those captures do not prove live inventory coverage.
- The first full gate found one outdated recovery mock (5,920 other tests passed). After the fixture supplied a resolved owner explicitly, the focused error/retry test and final #637 gate passed (5,921 tests, typecheck, lint and build); exact-head CI and deployment also passed. The initial failed gate is not counted as acceptance.
- Branding was developed separately in `codex/dh-brand-review`. The approved raster reference supplies the H geometry; review captures and motion evidence remain separate. User design approval, CI, merge and Production deployment subsequently passed in #636, as recorded above.
- Still open: three genuinely cold price-ascending, price-descending and Insights requests each under 10 seconds; further measured query/transfer improvements; production authenticated journey acceptance beyond the closed bounded local owner/isolation suites; source publication receipts; long-session memory/slow-network profiling; physical iPhone/Android installed-app and touch acceptance. Keep archival disabled pending independent recovery and isolated restore.

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
- Historical November 3 blocker: Windows refused the temporary gateway port and that gateway was removed. Subsequently resolved for bounded QA by running the local app and browsers with the actual isolated Auth gateway through Docker loopback. The accepted suites above do not depend on Windows host-network repair.
- St. James lot 1855 has an explicit junk-title disclosure in the seller description while the structured title says Other. DealerHunt showed Title unknown. Keep the disclosure visible and verify source precedence before updating the title classification. Lot 1401 is a seller-described F-250/Excursion conversion and warrants the existing identity warning.
- ReCar's restriction was verified in the deployed collector image in the prior pass. D&G has no newer successful receipt and the live worker reported zero remaining inserts and updates. AutoTempest publication, GovDeals detail evidence, and decision readiness still need verification.
- Physical-device checks, production authenticated journeys beyond the bounded local acceptance, and independent recovery remain gates. Local owner/isolation results above supersede the earlier local pending status. Keep private pilot access controlled and archival disabled.

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
- [x] Close bounded authenticated local browser QA by running app, actual Auth and browsers through the isolated Docker harness. Windows host-to-container repair was not required and is not claimed; no public worker exposure or unrelated service changes.

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
- [x] Verify bounded populated Saved/Compare/purchase/Pipeline costs/sale/linked outcome and owner isolation using actual local persisted fixtures: 21 checks with zero owned rows after cleanup. Keep the 18 mocked UI checks separate.
- [ ] Extend beyond that bounded suite for remaining recon/inspection, interrupted/offline and production authenticated acceptance. Preserve originals; local fixture acceptance does not certify every owner journey.
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
- [x] Verify bounded local HTTP/browser account isolation for inventory, purchase, Pipeline costs and linked outcomes through the persisted suite and connected journey; SQL rollback tests remain separate evidence.
- [ ] Complete remaining feedback/maintenance isolation and production/expired-session acceptance beyond that bounded suite.
- [ ] Verify MCP key issuance/owner binding/revocation/rate limits, safe errors and no privileged diagnostics on customer pages.
- [x] Complete the recorded authenticated isolated release suites via Docker local app/Auth/browser harness, including designated fixture cleanup.
- [ ] Complete remaining expired-session, timeout, outage, offline, installed-PWA update and rollback acceptance; physical/device and external auth-delivery evidence remain separate.
- [ ] Measure API latency, responsiveness, layout shifts, image transfers and long-session memory; optimize demonstrated bottlenecks.
- [ ] Review remaining dependency/runtime-engine findings, provider-owned database advisor findings and measured hosting usage. Private pilot does not establish commercial eligibility on Vercel Hobby.
- [ ] Every release: focused regressions → full required gate → exact-head CI → merge → deployment → production proof. Collector releases additionally need matching running-image provenance and retained rollback.

Owner/device acceptance and genuine provider access requirements remain explicit dependencies. They do not stop independent code fixes. No paid services, raised quotas, fabricated coverage/freshness or permanent user-history loss are authorized by this register.
