# DealerHunt remaining-work register — November 2, 2026

This register reconciles inspected code, the six-wave single-owner pilot plan and private release receipts. Checked means the stated bounded acceptance passed, not whole-app completion. The product remains a private independent-resale pilot: Market Explorer first, Discover second. Existing accounts, ownership and history stay protected.

## Released foundation

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
