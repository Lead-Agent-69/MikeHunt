# MIKEHUNT User Journey QA - October 6, 2026

## Release Follow-Up

The audit below describes the earlier revision, not the corrected release. This follow-up ships these focused changes while preserving concurrent scraper improvements through `4ec9eb3`:

- Multi-select vehicle categories in onboarding; preferences save before the account is marked onboarded, and local scope changes only after both requests succeed. This is ordered, retryable persistence, not a database transaction.
- Explicit nationwide overrides no longer fall back to an old state. Discover's draft state follows the applied market. Empty results explain title exclusions rather than implying a lack of regional inventory.
- Personal Saved cards and similar-vehicle results hide reseller profit and bid scores. Source verification age uses actual last-seen time, not the date of saving. Notification delivery is not claimed merely because an account watchlist loads.
- Saved selection opens actual vehicle comparison for up to four candidates. Unknown costs and incomplete all-in totals stay explicit. Dealer market-segment research remains available separately.
- Personal Pipeline now offers account-persisted inspection/purchase checklists using existing owner-scoped saved-record APIs. Stage and task records are user-entered progress, not proof of inspection or condition. Dealer Pipeline remains intact.
- Personal Settings hides dealer defaults and duplicate business-location inputs. Email price-drop preferences save immediately with visible feedback; profile forms use their own Save profile button without a global sticky save bar.
- Valuation confidence no longer becomes High merely from listing completeness or an asking-price anchor. High requires the configured comparable/sold-evidence thresholds; this is not a measured accuracy claim.
- Public status no longer exposes database/service-role/runner readiness instructions. Freshness uses source last-seen time. The operator health command now exits nonzero when successful collection is overdue (24-hour default, configurable).
- Fleet carrying-cost threshold is labeled honestly, not described as financial break-even. Deal Check's listing input now has an accessible label. Similar-search requests cancel on closure to avoid stale results.

Live local checks confirmed a personal account's Saved cards omit profit, personal Pipeline loads, a checklist task persists after reload, and the QA task was restored to its original unchecked state. Personal Settings hides dealer defaults. Automated regression tests cover multiple categories, explicit nationwide override, mode-aware navigation, public status redaction, valuation confidence, unavailable-save retention in checklist rendering, and incomplete comparison costs.

Still outstanding: restore and prove current per-source collection cadence; validate production Google OAuth and admin/normal-user login lifecycle; notification delivery; installed-PWA update; source terms/coverage evidence; calibrated sold-price accuracy and inspection outcomes. The last successful collection observed during this release was about 4,101 minutes old, and the revised health command correctly exited 1. Browser viewport override timed out, so this release's full new responsive matrix is not yet verified. Earlier responsive audit evidence must not be used to claim that new workflows passed.

## Scope and Evidence

Revision audited: `24d9331`. Local app: `http://localhost:3000` using the configured database and the browser's existing personal-buyer session. The earlier responsive pass on this revision is included. No product code, account preferences, or saved records were changed during this audit. Onboarding edits were abandoned without saving.

Evidence types:

- **Live**: observed in the browser or a read-only local HTTP response.
- **Code**: confirmed implementation behavior, with a stated risk where not reproduced.
- **Unverified**: implementation exists or was requested, but the complete workflow has not been demonstrated.

Fresh validation: 247 Vitest files and 1,245 tests passed. `npm run health` exited 0 while showing the newest successful collection about 4,062 minutes old. This test result is not evidence of valuation accuracy, production OAuth success, or current inventory availability.

This is a broad product and implementation audit, not a claim that every control on every route has passed. Production login, account creation, admin operations, notifications, paid services, physical-device interactions, and network-failure scenarios remain explicitly unverified below.

## What the App Currently Does

1. Presents public/auth pages and an existing cobalt-M brand component.
2. Collects a buyer goal, one vehicle category, state, price ceiling, title tolerance, timeline, and some mode-specific preferences through four onboarding steps.
3. Browses database inventory through Discover and Scan, with profile, location, source/lane and price filters. Browsing existing rows is distinct from running collection.
4. Offers source collection controls and tracks source/run metadata. Configured source entries are not proof that inventory collection is functioning now.
5. Displays listing photos, source links, asking prices, estimated costs, condition warnings, and grouped evidence on vehicle detail pages.
6. Offers a separate Deal Check input for a URL, text, or photo. Its request controller and request IDs protect against stale responses in code.
7. Saves vehicles locally and through account APIs; distinguishes available, price-drop, and unavailable saves. An unavailable card retains its old price and offers similar vehicles.
8. Provides model-level market comparison. This is different from comparing two actual saved vehicles.
9. Provides reseller/dealer acquisition inventory with transport, recon, listing, offer, sold, expenses and outcome controls.
10. Contains alerts, market research, map, finance, transport, parts, auction tools and admin/operations pages. These have uneven buyer-mode integration and verification coverage.
11. Contains PWA update handling and development cache cleanup. Installed-app update behavior still needs a deployed test.

## Journey: Actual Versus Expected

| Step                 | Actual behavior                                                                                               | Expected buyer experience                                                                                     | Assessment                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Public entry         | Landing/auth components exist; `/showcase` is an accessible design-component gallery                          | A clear product entry with truthful scope and coverage; internal component demos clearly separated            | Public/auth signed-out journey still needs an isolated session test                  |
| Sign-in              | Email/password and recovery code exist; the current browser session loads account preferences                 | Reliable confirmation, reset, return destination, restart persistence and logout                              | Provider status says email reachable, Google unavailable; fresh login not exercised  |
| Onboarding           | Five goals including parts; four steps; vehicle choices behave as single selection                            | Goal-led visuals, multiple desired vehicle types where useful, clear location, realistic first-search preview | More complete than the old basic screen, but multi-category selection still missing  |
| Location             | Home is FL, saved search market MO; header and inline selector can show different values during/after loading | Home and current search market explicitly distinguished; all search controls agree on applied scope           | Confirmed confusing scope display                                                    |
| Discover             | Profile filters can yield zero while regional inventory exists                                                | Explain which filters excluded vehicles; offer targeted relaxation without losing preferences                 | Confirmed empty-state attribution gap                                                |
| Scan/refresh         | Inventory cards plus source-run summaries                                                                     | Results remain usable during refresh; concise buyer status; detailed failures on operations pages             | Source operation terms remain visible                                                |
| Vehicle review       | Photos, condition warning, source time, unknown cost disclosure, grouped evidence                             | Immediate decision summary, dated provenance, next check, all-in range, concise mobile examination            | Improved hierarchy; confidence and completeness semantics need work                  |
| Save                 | Local and cloud lists, retained unavailable records                                                           | One calm list, accurate sync status, mode-relevant costs, comparison selection                                | Confirmed reseller economics and raw codes leak to personal users                    |
| Compare              | Manually enter make/model/year to compare market aggregates                                                   | Compare actual candidates by cost, condition, evidence and personal fit                                       | Requested candidate comparison is absent from the examined route/Saved flow          |
| Purchase preparation | Dealer Pipeline exists; personal mode is blocked from it                                                      | Considering -> inspecting -> buying/owned with tasks for personal users; dealer stages for businesses         | Personal acquisition workflow is missing                                             |
| Settings             | Home/search locations, profile editor link, dealer fields, notification control and Save Settings             | Categories suited to the mode; immediate-save controls distinguished from form saves                          | Personal account still sees dealer profile/defaults and duplicated location controls |
| Alerts               | Feed and delivery controls exist; cloud-ready copy follows API load success                                   | Prove subscriptions, scheduling, delivery and deep links; explain actual changes                              | End-to-end delivery is unverified; readiness copy overstates what was checked        |
| Admin                | Server-side configured-email gate                                                                             | Restricted access plus useful denial/recovery; controlled operations with audit trails                        | Non-admin denial observed earlier; authenticated admin and DB isolation unverified   |

## Prioritized Findings

### F01 - High: Collection is overdue, but health reports nominal

**Live:** 2,669 active rows, no new rows in 24 hours, newest created row about 68 hours old. The latest successful curated-dealer run is about 4,062 minutes old; several auction runs are about 4,780 minutes old. Health exits 0 and prints "All systems nominal."

**Code:** `scripts/health-check.mjs:94` only considers stuck runs and consecutive errors critical. A worker that stops running can therefore remain green.

**Required:** Compare each source's last successful verification with its approved cadence; alert on missed collection, distinguish zero matches from failed execution, and propagate overdue status to recommendations.

### F02 - High: Freshness metric measures creation, not verification

**Code:** `app/api/system/status/route.ts` computes `newestAgeHours` from the newest `created_at`. Existing rows could be verified repeatedly with no new rows and still be classified stale. New rows could also obscure older unverified inventory.

**Required:** Separately report last listing verification, source heartbeat, creation age and refresh success. Avoid deriving current availability from a recent insert or an `active` flag alone.

### F03 - High: State controls and profile scope diverge

**Live:** The current account has FL home and MO search market. Header MO, a profile scope using another location, and an inline Nationwide draft were observed across hydration/navigation. These concepts are not sufficiently distinguished.

**Code:** `app/(dashboard)/discover/page.tsx:256` stores a separate state draft; URL, persisted intent and preferences determine applied scope through different precedence rules.

**Required:** One applied-search scope, a clearly labeled draft before submission, explicit home versus search-market labels, and no jump from All states to MO after account loading without context.

### F04 - High: Zero matches conceal the restrictive filter

**Live API:** Missouri + SUV + $20,000 produces 5 matching listings. Adding clean-title-only produces 0. The market context reports 60 listings before the remaining profile filters, while the empty state broadly says no SUVs.

**Required:** Show the decisive exclusion, such as "5 SUVs match your budget; none have a confirmed clean-title field." Provide an explicit option to include unknown/repairable title categories. Unknown title must remain unknown.

### F05 - High: Confidence is based on completeness rather than value evidence

**Live/code:** Scan can show "high math confidence" with an ask-based value. `components/shared/DealCard.tsx:236` uses data-quality score and any positive resale basis to decide confidence.

**Required:** Keep listing completeness, valuation provenance and recommendation certainty distinct. An ask anchor must not qualify as verified market value. Show comp count, sold/asking distinction, dates, match criteria and uncertainty where available.

### F06 - High: Saved ignores the personal buyer objective

**Live:** Personal Saved shows SELL, MAX BID, estimated profit, SALVAGE_TITLE, GOV_AUCTION, numeric scores, and a dealer listing's auction-timing checks.

**Code:** `components/saved/SavedCarCard.tsx:538` displays estimated profit without buyer-mode gating. The local-save rendering also includes sell/bid figures without mode gating.

**Required:** Personal cards emphasize asking price, total-cost completeness, condition, title source and next check. Resale economics belong to resale modes. Translate source/title identifiers and conditionally generate auction checks.

### F07 - High: Sync-readiness copy overstates delivered capability

**Live:** Saved initially says local-only/cloud setup incomplete, then says cloud alerts ready after account/list fetch. Settings promises instant deal pushes.

**Code:** `app/(dashboard)/saved/page.tsx` treats an available dealer ID and an error-free saved-list request as cloud readiness. It does not demonstrate an active notification subscription or delivered alert.

**Required:** Separate saved-list sync, alert enrollment, delivery channel configuration and last delivery result. Reserve "alerts ready" for the actual delivery prerequisites.

### F08 - High: Comparison does not satisfy the candidate-selection job

**Live:** `/compare` accepts one or more make/model/year entries. Ford F-150 2020 returned 11 listings, 4d observed age, zero GO deals and unavailable remaining metrics.

**Code:** `app/api/market/compare/route.ts:49` includes year +/-1 despite a single-year column heading; model matching uses its first word and there is no state filter. `first_seen_at` supplies the days-on-market input. Query errors are not checked before returning empty rows. The page lacks a request-error UI.

**Required:** Separate market-segment research from actual-vehicle comparison. Compare saved IDs and show budget/all-in costs, uncertainty, condition, safety/reliability evidence and fit. Disclose year range, geographic scope, sample size and observed-listing age in market research. Surface failures distinctly from zero inventory.

### F09 - High: Dealer break-even calculation uses the wrong quantity

**Code only:** `app/(dashboard)/fleet/page.tsx:100` and `:687` calculate break-even day as total acquisition cost divided by daily carrying cost. That gives the time for carrying expenses to equal acquisition cost, not the time until profit becomes zero.

**Required:** Derive the carrying-cost limit from supported net sale proceeds minus purchase and other costs, or rename this display to its actual meaning. Do not show a profit threshold without a supported sale scenario.

### F10 - Medium: Onboarding still restricts vehicle interest to one category

**Live:** Selecting Trucks deselects SUVs. Categories expose checkbox-like pressed state even though they are mutually exclusive.

**Code:** `app/onboarding/page.tsx:331` uses `setVehicle(item)`.

**Required:** Support multiple categories or explicitly use single-select radio semantics. Separate body style from powertrain and luxury class so Hybrid/EV and Luxury do not compete with SUV/sedan selection.

### F11 - Medium: Onboarding persistence can partially succeed

**Code only:** `app/onboarding/page.tsx:208` writes the local intent first, then separately saves profile/onboarded state and preferences in `Promise.all`. A failure in either server request leaves earlier successful changes in place.

**Required:** Commit coherent server profile/preferences together, then promote the local state. Make retries idempotent and recover from incomplete setup. Test each individual failure and navigation during save.

### F12 - Medium: Personal settings still exposes dealer operational defaults

**Live:** Dealer Profile, Dealership Name, auction fee, recon default, daily floor rate, a second home-state control, and Save Settings appear to a personal buyer.

**Code:** `app/(dashboard)/settings/page.tsx:74` gates the profit target, but the rest of the dealer form remains.

**Required:** Mode-aware settings categories. Consolidate location editing and distinguish immediate-saving notifications from a separately saved profile form. Rename the form button to its actual scope.

### F13 - Medium: Navigation excludes personal purchase tracking

**Live:** `/fleet` shows a reseller/dealer-only gate. Personal mobile uses Alerts where the requested navigation specified Pipeline. Desktop Alerts and Activity point to the same destination.

**Required:** Give personal buyers acquisition tasks and ownership tracking. Keep Activity on the bell and retain dealer-specific capital controls only for business modes. Decide this consistently in `components/layout/nav-items.ts` and route gates.

### F14 - Medium: Operations jargon remains on customer surfaces

**Live/code:** Scan shows sources checked/unavailable; Saved shows watch readiness, trust scores, raw title/source codes and setup diagnostics. The public status API includes database/server-write setup instructions even after redaction.

**Required:** Buyer copy describes missing evidence, availability and an actionable recovery. Move runner/setup diagnostics to authorized operations pages. Public auth readiness should contain only what the login interface needs.

### F15 - Medium: Readiness badges have inconsistent freshness rules

**Live/code:** A Saved card about 3 days old says "Fresh source proof." `components/saved/SavedCarCard.tsx` uses a 72-hour boundary, while global status uses a 24-hour creation-age boundary. Missing last-seen time falls back to the user's save date, which can make old evidence appear newly checked.

**Required:** Use per-source verification freshness. Saving a vehicle must not update the evidence date. Source link presence is not title/condition verification.

### F16 - Medium: Accessibility labeling and input semantics need a pass

**Live/code:** Compare inputs have placeholders without persistent labels. Deal Check's textarea has no explicit accessible label. Onboarding mutually exclusive choices expose checkbox-like semantics.

**Required:** Labels for each input, radio semantics for exclusive choices, minimum touch targets, keyboard focus checks and screen-reader task-status announcements. Layout-width checks do not prove accessibility.

### F17 - Medium: E2E coverage is too weak to validate product completion

**Code:** `e2e/smoke.spec.ts:92` asserts a count is >=0, which always passes. The "Save a Deal" test only opens Saved; it does not save. The smoke file does not prove signup, alert delivery, onboarding persistence, comparison correctness or admin isolation.

**Required:** Real user assertions: create a test save, reload, verify it, compare candidates, confirm correct profile filtering, test error/retry, logout and restore. Use dedicated test records and accounts with cleanup. Add two-account ownership and unauthorized-admin API tests against the deployed database.

### F18 - Medium: Responsive image delivery remains incomplete

**Code:** Dense DealCard and Saved rendering includes raw `<img>` elements. Next's configured image formats alone do not optimize these.

**Required:** Responsive image sizing, lazy loading and stable dimensions; preserve fallbacks. Measure cold/warm rendering and bytes at each viewport before making speed claims.

### F19 - Medium: Dataset naming and facets need normalization

**Live earlier pass:** Scan facets include `(C)`, `Mclaren` and `McLaren`.

**Required:** Canonical make/model values and validation at ingestion, with raw source text retained separately. Correct existing rows before relying on market groups and comparison joins.

### F20 - Medium: Documentation does not form one reliable backlog

**Code/docs:** Several historical readiness/implementation files coexist. `docs/HANDOFF-REMAINING-WORK.md` is a July housing handoff, despite its general name. These documents cannot establish current automotive completion.

**Required:** A current feature registry with owner, user entry point, implementation status, live evidence, remaining acceptance tests and deployment revision. Archive or clearly date unrelated old handoffs.

## Improvements Preserved and Still Visible

- Shared navigation uses the cobalt M and an accessible MIKEHUNT home link. Relevant auth/public/header components share the brand implementation; no aviator reference was found in the targeted source search except negative tests. Installed icons/offline caches still need a production check.
- Onboarding now has illustrated goal choices and a four-step structure, rather than the old basic text panel. Category breadth has increased, although multi-selection has not.
- Vehicle detail shows repair-aware warnings, explicitly unconfirmed costs, source links and grouped examination/evidence/planning sections. Source photos are disclosed as not being an inspection.
- Unavailable Saved handling retains previous price/details and provides Find Similar in code. Live disappearance and replacement behavior is not yet exercised.
- Request cancellation/stale-response guards exist in Deal Check. A request lifecycle stress test remains outstanding.
- Normal scrolling is native; the global smooth-scroll wrapper is a no-op. No global smooth-scroll interception was found as the cause of earlier scroll complaints.
- Responsive checks on this revision found no horizontal document overflow on the tested Discover/Scan/detail layouts. These checks do not establish every page's mobile readiness.

## Verification Coverage

| Check                                | Result                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Full Vitest run                      | 1,245 passed; 247 files; exit 0                                                                       |
| Health command                       | Exit 0 despite collection about 68 hours old: confirmed monitoring gap                                |
| Public system-status read            | Email reachable; Google false; buyerReady and decisionReady false                                     |
| Missouri profile filter attrition    | 5 SUVs under budget; 0 after clean-title filter; 60 market rows before remaining filters              |
| Compare real read                    | Ford F-150 2020 segment returned 11 rows; no specific-car comparison                                  |
| Onboarding navigation                | Goal/search/comfort inspected; category exclusivity reproduced; changes not saved                     |
| Settings                             | Existing account loaded; personal mode exposes dealer settings                                        |
| Saved                                | Account and local records loaded; economics/raw-code/readiness issues reproduced                      |
| Personal Pipeline access             | Reseller/dealer gate reproduced                                                                       |
| Discover/Scan/detail responsive pass | Selected layouts checked at 320, 390, 430, 768, 1440; no document overflow in those samples           |
| Theme                                | Previous pass on same revision: light/dark control changed appearance; original dark setting restored |
| Browser console                      | No warnings/errors on the selected prior responsive paths; not an exhaustive console certification    |
| Public showcase                      | Live design gallery inspected; sample cars are showcase content, not verified inventory               |
| Auth architecture                    | Code reviewed; no fresh email/Google/admin login performed during this audit                          |
| Production rollout                   | Not tested by this localhost audit                                                                    |

## Remaining Acceptance Work

- Fresh email registration -> confirmation -> account bootstrap -> onboarding -> intended destination.
- Returning email and Google sign-in, expired/reused callbacks, reset email, logout and browser restart.
- Authenticated admin operations; non-admin API denial; two-user ownership/RLS checks on deployed database.
- Actual source run with selected state/category/lane; prove rows, photos, price meaning, dates and source links; aborted/overlapping runs and genuine zero-match response.
- Distinguish auction current bids/deposits from full asking prices; verify title, damage and fees before recommending a purchase. Existing guards/tests are not proof for every scraped record.
- Mechanic findings and quote attachment -> cost recalculation -> changed decision; owner reliability feedback versus resale outcomes.
- Actual saved-list sync after offline recovery, unavailable listing transition, replacement matches and multi-device persistence.
- Candidate comparison, personal acquisition checklist and pipeline tasks.
- Price/evidence/recommendation alerts from event -> matching -> delivery -> evidence deep link.
- Mobile keyboard/open sheets, physical-device scrolling and browser zoom; dark contrast; reduced-motion loader; loading/error/retry/cancellation matrix.
- Production PWA update, stale installed logo cache, offline route, restoration and data retention.
- Cold/warm page and API timings, slow connection, broken images, permission denial, 401/403/429/500 and database timeout recovery.
- Measured valuation performance against held-out, matched outcomes, with coverage and error bands. No evidence supports a 99% accuracy claim today.

## Recommended Delivery Order

1. Collection cadence monitoring, verification timestamps and honest availability/valuation confidence.
2. Unified search scope and exact filter attribution, then multi-category onboarding with coherent persistence.
3. Mode rules shared by Saved, Settings, Compare and Pipeline; plain buyer copy and operations gating.
4. Candidate comparison, acquisition checklist and inspection-to-recalculation.
5. Real email/Google/admin and ownership tests, alert-delivery proof and production PWA QA.
6. Responsive image/performance measurements, keyboard/contrast/physical-device QA and a single current release checklist.

The product currently works best as a vehicle research and watchlist tool. Live acquisition recommendations require the collection, provenance, mode-consistency and verification work above before the product should present itself as a complete decision system.
