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
