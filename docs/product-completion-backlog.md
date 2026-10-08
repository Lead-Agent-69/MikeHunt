# Product Completion Register

Updated October 4, 2026. Based on the conversation and code inspected, not a claim of production completion.

## Release Waves: October 7, 2026

1. Dependency security: Vitest 4.1.11 and Supabase CLI 2.120.0 pinned; compatible transitive fixes applied; selector parser pinned to 7.1.6. All four critical audit advisories removed. Production dependency audit reports zero advisories. Twelve high development-tool findings remain, all tracing to the unpatched braces nested-pattern advisory; no forced Tailwind migration or claim of a fully clean development audit.
2. Worker recovery and evidence coverage: still open. Historical running records need ownership-safe recovery, not age-only deletion. The last production audit found 3,295 of 3,790 listings without VINs and 25 without state. These need source-backed enrichment or explicit unknowns, never guessed values.
3. Signed-in user/admin QA: still open. Public production smoke checks pass (19 checks), but browser surfaces are disconnected. Actual account login, session restoration, onboarding, mobile interaction, and admin controls are not verified by anonymous HTTP checks.

Wave 1 final combined-tree verification: 1,364 tests across 278 files, typecheck, lint (255 existing warnings), and production build passed with the parser override. Compatible MCP SDK and proxy-addr updates are present in the lockfile; tinypool is no longer installed. Live smoke results describe the previously deployed release, not proof that these new dependency changes are deployed.

Wave 2 queue fixes implemented: active request reuse now requires the same scope, dry-run setting, and exact selected source set; found and saved counts are separate; no-results/all-failed execution is failed rather than successful completion; genuinely successful zero-match searches remain valid. Running jobs emit owner-filtered heartbeats, terminal writes require the current owner and running status, and customer status excludes raw runner errors and metadata. Historical scraper-run recovery and source-backed VIN/state enrichment remain open. A read-only live database check verified JSONB scope/source matching against an existing job; this is not proof of a successful end-to-end scrape or signed-in browser session.

## Adoptable Patterns

- Visor: precise inventory filters, dated listing observations, dealer inventory, and market slices with visible sample counts and geography. Listing disappearance must not imply a confirmed sale.
- Autotrader: saved search alerts, saved vehicle comparison, and direct seller contact.
- CARFAX: separate vehicle history from listing history; show report limitations and still require inspection.
- MIKEHUNT differentiator: mode-aware all-in costs, evidence provenance, and what would change the decision.

References: https://visor.vin/api ; https://visor.vin/search/filters ; https://www.autotrader.com/help/my-autotrader ; https://support.carfax.com/article/what-s-on-a-carfax-report-and-how-can-it-help-me

Visor API is free to start with included credit, not an unlimited free feed. No API subscription, key, scraping bypass, licensed history data, or paid integration is enabled by this work.

## Implemented Locally, Pending Release Validation

- Evidence-gated Deal Check and spotlight; discovery cannot promote model profit into purchase readiness.
- Repairable/auction research labels, explicit next checks, and unverified model ceilings.
- Optional market panels, accessible carousel navigation, expanded card estimates, reduced motion.
- Observed-price history validates dates and amounts, sorts and deduplicates timestamps, separates first observed from listing age, and removes seller-intent claims.
- History components distinguish loading, missing observations, and failed requests with retry; API failures no longer masquerade as empty successful histories.
- Existing photo viewer explicitly does not claim AI damage assessment.

## Release-Blocking Acceptance Gates

1. Deploy and smoke-test these local changes; verify cobalt M and installed-app update path.
2. Recheck email confirmation, intended destinations, Google OAuth, new-account onboarding, persistent sessions, restart, logout, and recovery using normal and authorized admin accounts. A previous normal-login failure remains unresolved.
3. Confirm admin authorization is enforced server-side, including API and cross-account negative tests. Do not solve login by granting ordinary users administrator privileges.
4. Validate each active source with scoped real runs, detail/photo fixtures, accurate amount types, refresh policy, and partial-run-safe retirement. Registry coverage is not working coverage.
5. Keep disappeared listings in Saved with last-known facts; distinguish unavailable from confirmed sold and offer replacements.

## Intelligence and Workflow Work Still Needed

- Versioned evaluations shared by cards, comparison, alerts, and pipeline; nullable unsupported prices/profit/ROI.
- Provenance and dates on important facts, source links, quote/inspection evidence, and explicit conflicts.
- Actual inspection/quote attachment, authorization, persistence, recalculation, and validated evidence gate writes.
- Personal ownership math, DIY capability/parts/workspace checks, reseller scenarios, dealer capital and recon planning: verify each branch beyond stored mode labels.
- Compare like-for-like title, condition, location, mileage, cost ranges, and evidence; asking-price comps are not sold prices.
- Evidence-change alerts with preference controls and real delivery; no generic urgency or unverified profit alerts.
- Outcome feedback separated into ownership reliability and resale performance; published holdout accuracy with sample counts and limitations.
- Real dated market cohorts before publishing demand/turnover or 50-state claims.
- Page-by-page mobile/desktop, dark mode, reduced motion, scrolling, keyboard, friendly errors, and performance checks.

Do not mark any item complete solely because a screen/component exists or unit tests pass. Record live verification and remaining limitations.

## Whole-App Accessibility and Intelligence Audit: October 7, 2026

Scope: route/navigation inventory, role-specific entry points, recommendation reads/ranking, market filters, inventory writes, and existing completion gates. This is a source audit plus focused automated verification, not certification against Apple, Google, Copart, or Visor. The live browser remains at sign-in; production database inspection was permission-denied during this audit. The local browser surface was policy-blocked, so new responsive visuals and signed-in interactions are not verified.

### First Remediation Set

- Add `/tools`, a searchable, grouped directory reachable from desktop navigation, the account menu, and the mobile dock. Use the saved buyer mode; unknown modes default to personal. Parts and DIY planning comes first for those desks; dealers/resellers retain every catalogued business tool. No administrative tools or permissions are added.
- Stop labeling resale outcomes/calibration as personal "Vehicle intel". Expose that screen as "Outcomes & intelligence" on business desks.
- Scope Discover's For You ranking to up to 120 eligible listing IDs from the current search, rather than intersecting unrelated recommendation pools after ranking. User/search-specific cache keys and focus revalidation prevent the previous fixed-key reuse. Saved preferences, not a query parameter, determine economics access. Non-flip ranking no longer uses profit score as its quality input.
- Return an explicit retryable service failure for transient signal, preference, and inventory read errors. Missing signal tables remain distinguishable from a new account with no history. Guest requests remain unauthorized, without showing a failure rail.
- Listing Manager now checks each write, reports partial failure, leaves only failed vehicles selected for retry, and refreshes inventory after confirmed saves. This is manual marketplace tracking, not automated publishing.
- Market now distinguishes request errors from successful zero matches and offers retry without clearing filters. Remove the duplicate title/condition control.

### Inventory Filter Remediation

- Scan and Market share database-backed detail filters for body, trim, fuel, transmission, drivetrain, damage, keys, buy-now availability, color, engine, run-and-drive reports, buy-now price range, auction end dates (UTC), city/ZIP, VIN/photos, and last-observed age.
- Market adds explicit multi-source selection, stored-field vehicle categories, minimum mileage, removable applied filters, URL restoration/sharing, mobile filter disclosure, and result paging. Scan preserves its existing saved-search and removable-filter workflow with the additional fields.
- Unknown reports are distinct from reported false values. Buy-now budgets do not use current bids or asking prices. Unknown listed prices display as "Not reported" rather than zero. Auction-date/buy-now searches explicitly include auction inventory.
- This is a supported-field search contract, not a source-coverage guarantee. License eligibility, live bidding, fees, complete sale-status/lot-number filtering, distance radius, and unavailable provider fields still require feed contracts and further implementation. Other inventory views retain their own filter contracts and require parity work.

### Feature Coverage

"Present" means a code path exists, not that a signed-in production workflow passed.

| Surface                                         | Accessibility / completeness finding                                                                                  | Next acceptance gate                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Discover, Scan                                  | Primary navigation present; prior lane exposed prices and expanded Scan filters. Tools adds alternate entry points.   | Signed-in five-role pass; all filter combinations, unknown prices, and card price types agree with server results.                          |
| Feed, Map, Swipe                                | Present and reachable for personal as well as business buyers; separate filter/state paths still need parity checks.  | Same saved scope yields the same eligible inventory; empty, partial, and failed loads remain distinct.                                      |
| Today, Flash, Find, Best Buy                    | Present; Find/Best Buy remain business-oriented.                                                                      | Source age and coverage visible; no claim of the whole market or guaranteed opportunity from a limited pool.                                |
| Deal Check, deal detail, Similar, Compare       | Evidence-gated paths and similarity fallback exist.                                                                   | Persist inspection/quote evidence, recalculate consistently, compare like title/condition/mileage/geography, preserve provenance.           |
| Saved and URL intake                            | Cloud/local workflows present.                                                                                        | Cross-device saves, missing/retired listing preservation, seller links/contact, and comparison tested under real sessions.                  |
| Saved searches, Alerts                          | Reachable from Tools/account. SMS remains unsupported.                                                                | Exact filter round-trip and actual email/push delivery with preferences, deduplication, and unsubscribe verified.                           |
| Auctions, Auction Lane                          | Run-list import and research paths present; not equivalent to live bidding.                                           | Validate imports, title/keys/run status/damage, sale time, license eligibility and bid-versus-buy-now semantics from licensed source data.  |
| Pipeline / Purchase plan                        | Shared stage workflow present; label alone does not establish personal suitability.                                   | Personal ownership costs and inspection tasks, DIY repair capability, parts recovery, and dealer inventory tested independently.            |
| Recon, Parts                                    | Present and promoted for relevant desks; demand and repair estimates are not proven outcomes.                         | Evidence-backed estimates, saved tasks/attachments and permissions, nullable unknown values, actual parts outcomes.                         |
| Transport                                       | Present; estimated transport is not a door-to-door quote.                                                             | Exact origin/destination and date, real quote provenance or clearly labeled assumptions.                                                    |
| Listing Manager                                 | False-success bug repaired locally; only already-listed inventory is selectable.                                      | Select ready-to-list stock directly; verify authorized writes and partial retry with real accounts. No claim of marketplace cross-posting.  |
| Bulk, Finance                                   | Bulk currently groups sourcing opportunities, not general batch inventory actions. Finance calculator paths exist.    | Match labels to workflow; test legitimate zero costs, interest units, capital exposure and lender-link behavior.                            |
| Market, Arbitrage, model Overview               | Market now consumes shared detail/source/category filters and pages results; Arbitrage/Overview parity is unverified. | Signed-in filter/coverage acceptance, state-aware comparable cohorts and non-circular values; other surfaces still need contract alignment. |
| Outcomes & intelligence                         | Resale outcomes/calibration UI exists; previously misleading personal shortcut removed.                               | Confirm outcome persistence and holdout evaluation; keep ownership feedback separate from resale performance.                               |
| For You, embeddings                             | Eligible-pool ranking/error/cache handling improved; vector backfill and attribute fallback exist.                    | Production embedding coverage/freshness, versioning and real-traffic recommendation outcomes measured, not inferred from unit tests.        |
| Onboarding, Auth, Settings                      | Saved mode drives catalog; normal login and profile editing still require production QA.                              | All five roles, restart/session restoration, logout, OAuth, recovery, and production password minimum 12 verified.                          |
| Upgrade, Help, Beta, Showcase                   | Billing/help paths present; beta/showcase fate remains a product decision.                                            | Authorized billing sandbox validation and coherent entry/exit routes; no live charge performed in this audit.                               |
| Admin, Sources, Status, Developer, Orchestrator | Server-gated operations exist; deliberately absent from ordinary user directory.                                      | Authorized administrator discovery/operation, cross-account negative tests, scraper ownership-safe recovery and always-on health verified.  |

### Remaining Priorities

1. **P1: Forecast calibration is unproven.** `lib/intelligence/predict.ts` derives sell times and price-drop probabilities from fixed supply/age thresholds, not calibrated sold cohorts. The October 8 remediation labels the panel as rule-based market signals and removes precise sell-time, numerical probability and urgency claims. Predictive claims still require dated holdout outcomes and sample counts.
2. **P1: Market filter and coverage contract needs production acceptance.** Local remediation now consumes categories and shared source/detail filters, reads ordered database pages, discloses the 8,000-row sample ceiling, and exposes result pagination. Filtered datasets are reused across result pages. Acceptance remaining: signed-in browser QA across personas and mobile/desktop, representative source-field coverage, and production latency under realistic traffic. This is not a claim of complete Copart inventory or bidding-tool parity.
3. **P1: Production source and intelligence health is unproven.** Zeus recovery, salvagezone JS yield, eBay/Copart licensed coverage decisions, embedding freshness and want-hit holdout performance across states remain open. Historical counts above are historical, not refreshed by this audit. Acceptance: scoped successful source runs, timestamps, known/unknown VIN/location coverage, source retirement safety and state-level evaluation published.
4. **P1: End-to-end roles and persistence need a signed-in pass.** Catalog tests do not establish workflow completion. Verify browse -> inspect -> save/compare -> plan -> alert for personal/DIY/parts; extend to auction/recon/list/outcome for resellers/dealers. Include keyboard, touch, desktop/mobile, reduced motion, back navigation and session changes. Actual production login is required.
5. **P2: Make every estimate evidence-aware.** Carry dates, source links, geographic cohort, title/condition match, sample counts and cost ranges through cards, comparisons, alerts and plans. Do not treat asking prices as sold values, missing amounts as zero, or disappearance as a sale. Publish an ownership-value story for personal buyers rather than relabeled resale margin.
6. **P2: Reduce repeated work and stale views.** Align URL/profile/saved-search filter contracts across desks; reset account-bound caches on identity changes, debounce expensive search, verify bounded/paged reads, and measure Core Web Vitals on real mobile devices. A searchable catalog improves discovery but does not replace ergonomic task-specific workflows.

Reference benchmarks reviewed: [Copart Vehicle Finder](https://www.copart.com/vehicleFinder), [Copart salvage results](https://www.copart.com/vehicle-search-type/salvage/vehicleFinder), [Visor API](https://visor.vin/api), and [Visor market feature notes](https://visor.vin/changelog/hunting-for-the-car-you-want-just-got-easier). These support prioritizing explicit condition/title/price types and dated inventory/pricing context; they are not evidence that MIKEHUNT has equivalent coverage or intelligence.

### October 8 Cross-View Remediation

- Scan links preserve source, vehicle, auction, reporting and budget filters into Map, Feed and Swipe. Explicit cleared filters do not silently restore saved profile defaults. Header location changes and browser back navigation refresh the shared scope.
- Map and Feed consume the shared database predicates, including Scan's auction opt-in default. Swipe now pages the Scan result contract. Map remains a bounded located sample; personalized Feed remains a 250-row photo-backed sample, not a whole-market result.
- Personal Map requests ignore verdict/profit probes and order by observation age. Feed ranking/cache entries distinguish personal from flip desks, and inventory read failures produce retryable errors. Stale Feed responses cannot overwrite a newer search.
- Feed featured cards and Swipe photos show reported prices immediately. Unknown prices remain unknown, auction labels remain bid-aware, and personal Swipe cards do not show resale economics. Failed Swipe saves retain a retry action and only confirmed writes increment the tally.
- Fresh local browser QA is available, superseding the October 7 local policy limitation. Mobile Map loaded 371 local points for the matching Scan scope. Its CARTO basemap returned API-key warning tiles; the component now defaults to attributed standard OSM tiles and permits `NEXT_PUBLIC_MAP_TILE_URL` / `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` provider configuration. The corrected local map rendered. Public OSM tiles are best-effort, not a production SLA; follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and select an appropriately licensed production provider before claiming pro availability.
- Local mobile Feed and Swipe previews loaded with the shared search and visible prices. Production remains at sign-in. Dealer Market browser acceptance, all five real account roles, external source health, Auth settings, embedding freshness, and sold-value calibration remain unverified. No production coverage or platform certification is claimed.

### October 8 Navigation and Ergonomics Remediation

- Align the primary journey on desktop and mobile: Discover -> Deal Check -> Saved -> Plan (personal/DIY/parts) or Pipeline (reseller/dealer). Dealer desktop keeps Auction Lane; mobile keeps Tools. Existing route permissions remain unchanged.
- Put Compare under Deal Check and dealer discovery under Discover. Keep planning/operations routes under the planning job. Add peer navigation for Saved, saved searches, alerts and account settings; suppress redundant browse navigation where the shared inventory-view toolbar already exists.
- Replace the account dropdown's duplicate full tool catalog with Settings, Upgrade, Help, Buying profile, Saved, saved searches, Alerts, All tools and Logout. Native links, initial focus, Escape focus restoration and loading states improve keyboard behavior. Logout errors no longer redirect as though logout succeeded.
- Derive keyboard search from the same role-aware catalog, retaining the full business catalog for dealers. Use a native modal, accessible close action and focus restoration; abort obsolete inventory searches. Saved's badge counts device-saved vehicles, not searches; the activity badge counts unread alerts only.
- Collapse healthy watchlist diagnostics, but expand failures with recovery controls. Give purchase plans an actionable empty state and recoverable empty stage filter; normalize unsupported stored stages. Deal Check supports keyboard-accessible gallery/photo selection and wrapping, touch-sized actions. Distinguish Discover's profile-match rail from For You.
- Local browser checks covered Deal Check, Saved, empty Purchase plan, account links and keyboard dismissal at desktop and 390x844 mobile. The mobile modal exposed only its own controls and returned focus after closing; no page overflow was observed. No real account logout, financial action, purchase-stage write or paid upgrade was performed.
- Remaining acceptance: signed-in production journeys for all five roles, populated Saved/Plan/Pipeline transitions, cross-device persistence, upload/analysis recovery, actual alert delivery, and evidence-backed intelligence. These changes improve placement and ergonomics; they are not an Apple/Google accessibility certification or full Copart/Visor parity claim.

### October 8 Benchmark and Vehicle Inspection Remediation

- Reviewed official [Copart search](https://www.copart.com/vehicleFinder), [Copart Watchlist](https://www.copart.com/content/us/en/search/publicwatchlist), [Visor filters](https://visor.vin/search/filters), [Visor unified saved searches](https://visor.vin/changelog/unified-filters-and-broader-saved-searches), and [AutoTempest](https://www.autotempest.com/?hl=en_US). Acceptance criteria are consistent search scope, clearly typed reported prices, visible vehicle identity/photos/location/condition, reversible shortlist actions, and source provenance. Feature count does not establish coverage or superiority.
- Vehicle detail now leads with the vehicle H1, bid/asking-price semantics, compact purchase-evidence warning, location, mileage, title/damage, explicit run/keys reports, VIN and observation date. Photos precede secondary analysis. Unknown or invalid values remain unknown. Preserve existing stored boolean run/keys reports in the detail mapper without inferring them from condition strings.
- Remove the one-way detail persona switch; the saved buying profile determines the desk. Keep Save, Purchase plan/Pipeline and Transport reachable. Remove the entrance transform that accidentally made the fixed action bar relative to the entire page; reserve space for both actions and mobile navigation.
- Gallery photos are keyboard-operable buttons. The native modal contains focus, supports arrow navigation and Escape, restores initiating focus, and avoids retry loops for failed preload images. Real browser checks confirmed Enter opening, arrow navigation and Escape focus restoration.
- Comparison adds price type, location, VIN, reported damage, run/keys and direct source links. Saved cards put the reported price directly below vehicle identity, provide touch-sized actions, avoid nested link/button markup and empty detail routes for source-only saves. Tool search includes existing catalog descriptions as hidden search metadata.
- Local mobile 390x844 first-viewport QA showed identity, $12,980 asking price, repair warning, facts and actual listing photo above the persistent action bar. Action bar ends where the primary mobile navigation begins; desktop remains viewport-fixed. No real purchase, account setting, save/delete or notification subscription was performed.
- Secondary Tools/Transport browser QA found missing coordinates coerced to zero, bypassing state fallback and displaying a zero-mile TX-to-CA route. Reject absent/blank coordinates before numeric conversion; preserve explicit zero coordinates. Route tests cover state fallback and incomplete input. Label state-centroid distance and cost assumptions explicitly; reserve profit-oriented trailer optimization for reseller/dealer desks. Registration-rule accuracy and exact-address carrier quotes remain acceptance gates.
- Still open: signed-in production role/persistence/write journeys, licensed source completeness, distance-radius semantics, live auction/license eligibility, real alert delivery, Zeus scraper health, calibrated market values and production embedding freshness. Acquisition recording and estimate provenance require production acceptance; an asking-price comparison is not a sold-value appraisal. PR remains draft pending those gates.

### October 8 Production Acceptance Follow-Up

- PR #166 at `7add245` passed GitHub build-and-test and Vercel deployment. Production browser remains signed out; the Supabase project read remains permission-denied. No Auth policy change or five-role production acceptance is claimed.
- Saved searches now distinguish load failures from empty accounts, preserve failed-save fields, lock pending writes, confirm returned rows before closing or changing status, scope cloud updates/deletes to the authenticated owner, and require confirmation for deletion. Correct device-only/email/SMS copy; preserve dealer profit criteria while excluding them from personal/DIY/parts forms. Validate year ordering, provide named controls and a supported-state selector.
- Consolidate acquisition entry points in detail, Saved and Best Buy into a native purchase-record confirmation form. Require actual price paid instead of copying an ask/current bid; keep missing VIN/year/condition unknown rather than fabricating identifiers or clean titles. Confirm an inventory ID before success and distinguish a failed Saved-status update from a successful inventory insert. Request failure is ambiguous: check Pipeline before retrying. Recording submits no bid/payment. Actual cost completeness, backend idempotency and production write acceptance remain open.
- Retire unverified route-specific title rules, blanket deadlines, inspection/license assertions and green clean-transfer assurances. Present a registration verification checklist and [official DMV directory](https://www.usa.gov/state-motor-vehicle-services). The old Texas safety-inspection claim was contradicted by [TxDMV guidance](https://www.txdmv.gov/motorists/register-your-vehicle). This is not a maintained 50-state legal rules engine.
- Read-only local operator check: the `mikehunt-scraper-1` container is running/healthy, database writes are enabled, and the last recorded GSA run found 26 rows. Status at `2026-10-08T08:29:43Z` reported 6 inserts, 158 updates and 2 touches for the UTC day, plus a scrape-job claim `fetch failed` error. The configured Supabase auth endpoint subsequently returned HTTP 401 without credentials, establishing reachability only, not job-claim recovery. Mounted stack paths point to `F:\MikeHunt\main`; no restart/rebuild or queue claim was performed from this checkout. Salvagezone yield, scheduler continuity and retention remain unverified.
- No Sentry auth token was available in the shell or local app configuration, so production release-health/noise checks could not run. No new broad token or access was requested. Production sign-in was requested from the user without asking for a password in chat.
- Regression coverage includes read/write failures, no-row confirmations, owner predicates, persona criteria, invalid year ordering, device-only persistence semantics, actual purchase-price input, missing facts, HTTP/confirmation failures, focus restoration and partial follow-up failure. Local mobile search form QA found no horizontal overflow or unnamed fields; Save remained above navigation. Real saves/deletes, notification subscription, purchase writes and paid actions were not performed.
