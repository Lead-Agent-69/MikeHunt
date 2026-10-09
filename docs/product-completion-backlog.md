# Product Completion Register

Updated October 9, 2026. Based on inspected code and recorded live checks, not a claim of production completion. Later dated entries supersede historical blockers below.

## October 9 Document Provider Follow-Up

Account-preference release `dac9c36` passed 1,501 tests, typecheck, lint and build, and deployed READY to the canonical domain. All 20 production smoke checks passed. Live Settings -> Discover verified 63 Missouri clean-title matches with reported repair inclusion, and zero with repair exclusion; the original exclusion preference was restored. These are matching inventory counts, not roadworthiness or valuation claims.

Deal Check now has a dedicated extraction-only provider selector: configured Anthropic first, otherwise the existing Google key with `gemini-2.5-flash-lite`. There is no automatic second-provider retry and the narrative/valuation model contract is unchanged. Returned document fields are schema-validated; negative/string amounts or malformed line items are rejected. Missing values stay null, auction bids/deposits/monthly payments must not become a selling price, and provider failures retain input with friendly temporary-unavailability feedback. Timeouts, cancellation and zero automatic retries remain. Provider output is not independently verified vehicle evidence. Production provider success must be recorded after actual QA, not inferred from configuration or mocked tests.

Remaining acceptance gates: actual extraction on production; source-backed retail coverage, detail enrichment and retirement; authorized administrator controls and cross-account isolation; recovery-email delivery and browser restart; populated compare/pipeline mutations; installed-PWA update, notification delivery and real-device performance.

## October 9 Repair Eligibility And Buyer Copy Audit

Release wave `ed3a470` passed all checks (1,496 tests / 300 files, typecheck, lint, build) and was pushed to main. A subsequent live Deal Check request returned an empty response and leaked a JSON parser error. Follow-up adds safe response-shape handling, retained input/retry, parser-error redaction, a 25-second provider timeout without automatic retries, and request cancellation. Active asking-price averages are now labelled price context, not fair-price verdicts or sold comps. Actual provider success on production remains a gate until verified after deployment.

Follow-up `2b3b9ee` passed full verification (1,500 tests / 301 files, typecheck, lint, build) and was pushed to main. Anonymous production POST also reproduced the empty HTTP 500, before usable authentication guidance. Browser runtime loading is now deferred to the guarded URL-read branch rather than route startup; the release smoke suite adds an anonymous POST requiring JSON 401. This is a startup-isolation fix, not a proven provider-success claim until live validation.

Release `9e7387d` is production READY at the canonical domain. All 20 smoke checks passed, including JSON 401 for anonymous Deal Check. Signed-in analysis now displays friendly temporary unavailability, retains input and offers retry, without parser details or fabricated success. Vercel production has no ANTHROPIC_API_KEY; the configured Google key is not used by the current Anthropic-only extraction implementation. Actual successful production extraction remains open.

Live toggle QA then found Discover preferred an older browser-local scope even after Settings saved the account preference. Follow-up gives authenticated account preferences precedence, rejects another user's local scope when no account scope exists, and honors explicit URL repair eligibility. Empty-result recovery now links to buying preferences instead of suggesting a budget increase when no budget is set. Missouri's strict personal clean-title/no-repair search currently returns zero; enabling repair inclusion restores the repair-aware inventory, not verified roadworthy cars. Source breadth and title/damage enrichment remain acceptance work, not a reason to weaken evidence gates.

Fixed the reproduced Discover/detail mismatch for reported front-end damage. Both now use the same reported-repair-risk classifier; unknown damage remains unknown, never an undamaged or acquisition-ready claim. Auctions retain their existing research-only gate.

Added a separate repairable-vehicle choice to onboarding and an immediately saved Settings checkbox. Personal defaults exclude reported repair needs; legacy DIY/reseller/dealer profiles retain inclusion unless explicitly changed. Repair capability describes who performs work, not eligibility. Discover rails, Scan inventory, public fallback and live source previews respect the choice; inventory exclusions occur before database count and pagination. Cache keys isolate different eligibility choices. Saved records are not removed by this browsing preference.

Removed internal scope summaries and completeness/trust scores from local Saved and Activity cards. Actual missing fields and outstanding checks remain visible; no field-completeness score is represented as vehicle accuracy.

Evidence: live anonymous database query succeeded for Missouri with 31 eligible matches and ten inspected sample rows without reported repair risk. Local Settings checkbox saved, survived reload, and was restored to its previous value. Local Highlander detail now says Repairable vehicle: research before purchase while retaining the separately reported clean title. Production personal session loaded Settings, Saved, Pipeline, Deal Check, Compare and Activity; empty comparison/checklist states are not proof of populated workflows. Existing full verification passed 1,495 tests across 300 files, typecheck, lint (255 existing warnings), and build before the final Activity/preview follow-up; final release verification and deployment are recorded below after completion.

Still open: actual email recovery delivery/completion, browser-restart session restoration, populated compare and pipeline mutations, inspection/quote attachments, notification delivery, installed PWA update/offline recovery, real-device performance, source-by-source scoped collection and retirement evidence, and authorized admin-owner live controls/cross-account isolation. No administrator privileges were granted and no passwords changed. No 99% valuation or universal source-coverage claim is supported by this audit.

## October 9 Authentication And Navigation Follow-Up

Supabase Site URL now uses the public production domain. Callback allowlist entries cover the app's `next` query on production, the existing amber alias, and localhost:3000. Fresh Google sign-in succeeded for the requested personal account; onboarding saved Personal / Missouri / all vehicle types / clean title, reload restored the session, and logout followed by returning OAuth preserved the intended vehicle URL. The personal account was redirected away from `/admin`. These are live observations, not proof of browser-restart recovery, emailed recovery, every admin API, or cross-account data isolation.

Navigation changes in this wave preserve the existing route catalog and mode gating: compact account actions, collapsed grouped tools, real links, keyboard focus and dismissal, mobile theme access, truthful notification/device-save badges, 44px controls, tablet-safe breakpoints and reduced-motion desktop indicators. The local development badge no longer covers the account trigger. Release status must be recorded after checks and deployment, not inferred from local screenshots.

Remaining product acceptance work, in priority order:

1. Vehicle detail wave implemented: photos precede decision panels; source-wide counts, repeated field badges, and completeness-derived confidence removed from the buyer page. Per-vehicle evidence remains in a keyboard-accessible disclosure with three decision questions. Operational diagnostics remain in existing Sources/admin surfaces. Further audit of specialist panels remains open. A clean title is not proof of an undamaged or roadworthy car.
   QA follow-up: the local Highlander listing was labelled Repairable in Discover but Needs evidence in detail. Both prohibit an unverified purchase; unify classification without overriding evidence warnings. Repair eligibility must be distinct from title tolerance.
2. Buyer eligibility: distinguish title tolerance from repair tolerance. The live clean-title personal search still includes explicitly labelled repairable vehicles; that is not a clean-condition recommendation. Verify each onboarding choice against both Discover and Scan.
3. Complete live analysis, inspection/quote attachment, two-car comparison, purchase-task edits and unavailable-record retention with appropriate fixtures. Screen presence alone is insufficient.
4. Prove email confirmation/recovery, browser restart, PWA updates/offline recovery and real notification delivery. Google OAuth success does not prove these paths.
5. Measure mobile navigation and search performance on a real device/slow connection; verify reduced motion and screen-reader behavior. Responsive bounds and unit tests are narrower evidence.
6. Validate scoped source runs, amount type, title/damage provenance, detail/photo coverage and disappearance policy. Do not publish universal coverage or 99% valuation accuracy without measured, source-backed validation.

## October 8 Live QA Follow-Up

The existing administrator session now restores and the dashboard loads. The earlier disconnected-browser/account-blocked notes below are historical. Fresh Google login/recovery still has a confirmed redirect-configuration blocker; ordinary-role testing remains open. See [the current live QA and repair register](qa-2026-10-08.md) for verified pages, fixes, and untested acceptance gates.

## Release Waves: October 7, 2026

1. Dependency security: Vitest 4.1.11 and Supabase CLI 2.120.0 pinned; compatible transitive fixes applied; selector parser pinned to 7.1.6. All four critical audit advisories removed. Production dependency audit reports zero advisories. Twelve high development-tool findings remain, all tracing to the unpatched braces nested-pattern advisory; no forced Tailwind migration or claim of a fully clean development audit.
2. Worker recovery and evidence coverage: still open. Historical running records need ownership-safe recovery, not age-only deletion. The last production audit found 3,295 of 3,790 listings without VINs and 25 without state. These need source-backed enrichment or explicit unknowns, never guessed values.
3. Signed-in user/admin QA: still open. Public production smoke checks pass (19 checks), but browser surfaces are disconnected. Actual account login, session restoration, onboarding, mobile interaction, and admin controls are not verified by anonymous HTTP checks.

Wave 1 final combined-tree verification: 1,364 tests across 278 files, typecheck, lint (255 existing warnings), and production build passed with the parser override. Compatible MCP SDK and proxy-addr updates are present in the lockfile; tinypool is no longer installed. Live smoke results describe the previously deployed release, not proof that these new dependency changes are deployed.

Wave 2 queue fixes implemented: active request reuse now requires the same scope, dry-run setting, and exact selected source set; found and saved counts are separate; no-results/all-failed execution is failed rather than successful completion; genuinely successful zero-match searches remain valid. Running jobs emit owner-filtered heartbeats, terminal writes require the current owner and running status, and customer status excludes raw runner errors and metadata. Historical scraper-run recovery and source-backed VIN/state enrichment remain open. A read-only live database check verified JSONB scope/source matching against an existing job; this is not proof of a successful end-to-end scrape or signed-in browser session.

### October 7 Reliability Follow-Up

- Fixed Linux jsdom builtin-module externalization in the test configuration. All 1,376 existing tests passed in the network-isolated Node 24 worker image with `NODE_ENV=test`; DOM/theme tests remained enabled, not skipped.
- Added an operator-only abandoned source-run recovery tool: `npx tsx scripts/recover-source-runs.ts` previews records; apply requires explicit UUIDs, `--apply`, and `--workers-stopped`. Operators must independently stop and verify all owning workers first. Recovery compares the observed ID/source/start/status, preserves counts/listings/history, and records an unknown interrupted outcome, not success. Source terminal writes now guard running status so late completion cannot overwrite recovery.
- Production read-only preview found five source-run candidates older than six hours. No recovery writes were applied because historical rows do not identify their owning workers. Automatic lease-based recovery remains open.
- Production audit: 3,796 active listings, 3,301 missing VINs (87.0%), 25 missing state (0.7%). Audit reporting now exposes every detected missing VIN/image rather than hiding gaps below arbitrary percentage thresholds; a clear audit is not proof of valuation accuracy.
- Browser inventory reconnected, but the disconnected localhost tab was rejected by browser policy. A working production login tab was requested; actual user/admin login is still unverified.

### Search Monitoring Wave

- Removed fabricated source-success counts when a completed job has no verified summary. Completion without proof refreshes available inventory and explicitly reports the missing summary.
- Status polling now retries transient read failures without submitting another collection request, bounds request/wait time, handles sign-in and missing-job failures with friendly guidance, and reports stale heartbeats without claiming failure or cancelling a worker.
- Filter/source changes and navigation cancel monitoring and invalidate older responses. A monitoring timeout no longer promises an automatic refresh on return or asserts that the worker is still alive.
- Added behavioral tests for completion, missing results, failure, access errors, mismatched responses, retry, deadline, cancellation, and stale heartbeat. Full release checks are recorded separately after execution.
- Production browser login was attempted with the previously supplied account and rejected as incorrect credentials. Password reset/sign-in was handed back to the account owner. Normal-user/admin interaction QA remains open; no account privileges were changed.

### Scoped Preview And Pagination Wave

- Source-plan previews, live previews, and inventory pagination now use cancellable, latest-request ownership. Filter changes and navigation cancel obsolete requests; late success/error/finally callbacks cannot overwrite a newer search or clear its loading state.
- Explicit preview-source selection no longer silently falls back to other sources. Preview responses report only actually attempted sources and use customer-facing language rather than database/setup jargon.
- Make, model, selected makes, maximum year, and minimum mileage now constrain preview results. A requested mileage limit excludes unknown mileage. Advanced filters unsupported by public previews are disclosed rather than ignored; existing inventory search retains those filters.
- Pagination checks HTTP/response shape, keeps current vehicles on failure, displays retry guidance, and stops automatic repeat loops after failures or an unexpectedly empty page.
- Normal/admin signed-in QA, source-backed evidence enrichment, and the remaining acceptance gates below are not made complete by these changes.

### October 8 Admin Metrics And Access Audit

- Read-only production configuration checks confirmed a server-only admin account is configured and the public/server Supabase project URLs and anonymous keys match. No credentials or account permissions were changed.
- The available production browser remains on sign-in after the previously supplied credentials were rejected. The configured admin identity differs from that account. Signed-in admin/user QA remains open pending an authorized account-owner sign-in; service credentials are not a substitute for user-session testing.
- Fixed admin statistics that silently stopped at the PostgREST row cap: source and score summaries now page through active records with stable ordering and an explicit scan bound. User, paid-plan, and recent-signup counts use exact server counts rather than downloaded profile lengths.
- Resolved database errors and missing counts now return an unavailable response, not misleading zeros. Scans exceeding the bound also fail explicitly rather than publishing partial totals. Queries remain separate reads, not a transaction-consistent snapshot; these are operational counts, not validated buying recommendations.
- Nine focused route/pagination tests passed, including authorization before privileged client construction, counts beyond 1,000 rows, database failures, missing counts, and the scan bound. Full release verification is recorded after execution.

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
