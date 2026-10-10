# MIKEHUNT Remaining Work Handoff

Updated October 9, 2026. This is the consolidated remaining-work register, not a claim that every feature has been audited. Historical blockers in older registers must be checked against newer evidence before repeating work.

## Release Baseline

- Latest verified release: `20f9632d846f778280bc7c739aab239381f7a42d`, pushed to `main` and deployed to https://mikehunt-69.vercel.app.
- Production deployment: `dpl_HaErYWjAThwqUq5uuKrGYmocRXk9`, READY and canonical alias verified.
- Release gate: typecheck, lint with zero errors and 252 existing warnings, 1,549 tests across 310 files, production build passed. Twenty anonymous production smoke checks passed.
- Latest signed-in personal-user check: vehicle detail restored after reload; stored VIN sightings are labeled reported, repairable-damage warning retained, no captured console errors or horizontal overflow on that checked view.
- Health reports `buyerReady=true`, `decisionReady=false`. Do not hide the latter or describe the app as fully purchase-ready.
- Automated tests are not proof of sale authenticity, inspection quality, source coverage, admin workflows, email delivery or prediction accuracy.

## Completed: Do Not Rebuild Blindly

- Cobalt M assets, shared branding, installation icons and motion-aware loader exist. Installed-device update acceptance remains open.
- Branching buyer profiles, vehicle categories, home/additional states, repair eligibility and preference persistence exist. Google personal login, onboarding, reload, logout and intended-destination return have live evidence.
- Discover/Scan category filtering, multi-state forwarding, pagination and latest-request cancellation were repaired. Account preferences take precedence over stale local scope.
- Buyer detail prioritizes photos, decision questions and grouped examination/planning tools. Auctions/repairable cars have research-only safeguards; asking comparisons are not sold valuations.
- Actual production document extraction succeeded using Anthropic; bids/deposits are not treated as purchase prices. AI-read fields are explicitly not inspections.
- Sold safeguards reject unsupported title claims, nonfinite/future prices, incomplete indexes and full-model mismatches. History failures have friendly retry and cannot appear as a green all-clear.
- Server-confirmed admin navigation and authorization tests exist; an existing administrator dashboard session loaded in an earlier audit. That is not acceptance of every privileged control.
- Vercel production branch was corrected from `master` to `main`; verify it stays correct before future releases.

## Wave 1: Account And Security Acceptance

1. **Email recovery and confirmation - unverified.** Prove delivered email, public callback, valid/expired/used links, reset completion and friendly retry on an actual owned test account. Preserve intended destination. Do not infer account existence from enumeration-safe responses. Account owner must enter any new password in browser workflows.
2. **Persistent sessions - partly verified.** Test browser restart and real mobile/PWA reopening, token refresh/expiry, logout and cross-tab logout. Reload success alone is insufficient. Verify no guest/unavailable flash while account hydration is pending.
3. **New accounts and modes - acceptance incomplete.** Test new email and Google accounts through Personal, DIY, Reseller and Dealer onboarding; edit/back/cancel, delayed hydration, save failure/retry, multiple body types and states, repair/title tolerance and previewed first search. Ensure no automatic broad collection.
4. **Admin controls and isolation - incomplete.** Use an authorized admin session and a separate ordinary account. Inventory every admin page/API/action; test anonymous denial, ordinary-role denial, cross-account object access, direct requests and stale sessions. Prove RLS and ownership for preferences, saved cars, notes, tasks, attachments, alerts and API keys; protect privileged jobs server-side. Never promote a normal user merely to pass QA.
5. **Admin operational readiness - acceptance incomplete.** Verify scoped job controls, dry-run behavior, validation, clear irreversible-action confirmation, errors/retry, audit trail and observable outcomes. Document admin entry, authorized identity management and credential recovery without publishing secrets. Reconcile health/status contradictions rather than masking them.

## Wave 2: Collection And Inventory Truth

6. **Real scoped source runs - unverified per source.** For every enabled source record user-selected state(s), vehicle criteria, buyer eligibility and exact source set; execute an authorized run and capture attempted/found/saved counts, source URLs, failures and dates. Unsupported criteria must be disclosed, not ignored. Registry entries and advertised source size are not working inventory coverage.
7. **Detail enrichment - confirmed gap.** The checked ReCar Silverado source has 16 photos and explicit clean-title/total-loss-history wording; the app had one photo and incomplete history detail. Retrieve permitted full galleries and disclosures, preserve provenance and conflicting claims, and test unavailable/protected detail pages. Apply the same validation source-by-source; do not assume this is isolated.
8. **Price and lane classification - upstream gap.** Distinguish asking price, current/opening bid, reserve, deposit, monthly payment, buy-now and final sale. Correct auction brokers mislabeled as dealers. Keep auction/salvage research out of ordinary retail recommendations unless explicitly requested. A low price alone does not prove accident damage, a bargain or realizable profit.
9. **Freshness and retirement - real-run proof needed.** Define per-source approved cadence, last checked/last seen semantics and partial-run-safe disappearance policy. A failed/partial/filtered scan must not retire unrelated cars. Distinguish unavailable, removed and confirmed sold. Saved must retain last confirmed details, disappearance date and replacement-match access.
10. **Queue recovery - open.** Historical interrupted runs lack owner proof; preview found five old candidates, but recovery was not applied. Prove workers stopped/ownership before any manual recovery. Implement and test safe leases/heartbeats, bounded retries and recovery that late worker results cannot overwrite. No age-only deletion or false successful completion.
11. **Coverage and identity - open.** Rerun the dated completeness audit; historical counts included 3,301/3,796 missing VIN and 25 missing state, not current permanent counts. Enrich only from real source evidence. Resolve duplicate/cross-source identities and report actual coverage by source/state, photo/VIN/title availability and failures. Never advertise verified 50-state coverage from a registry.

## Wave 3: Decision Intelligence And Evidence

12. **Like-for-like completed-sale evidence - incomplete.** Full make/model matching is fixed; trim, mileage, year, geography, title and condition matching remain. Establish dated completed-sale provenance, deduplication, sample limits and authenticity. Do not substitute active asks or disappeared listings for sold transactions. Consider authorized external feeds only after access/cost/terms validation; no unlimited-free-feed assumption.
13. **VIN/history provenance - incomplete.** Stored sightings are now explicitly unverified. Audit source identities, repeated observations, title-brand interpretation and title-washing speculation. Only independently supported reports may imply independently verified history; seller clean-title wording does not establish no damage.
14. **Inspection and repair evidence - incomplete.** Complete upload, storage access, persistence, attachment deletion/recovery, inspection/quote validation and recalculation. Prove server-side evidence gates cannot be bypassed by client checkboxes. Photos alone cannot establish hidden damage, roadworthiness or a repair price.
15. **Mode-specific math - acceptance incomplete.** Personal: ownership cost and unresolved reliability evidence. DIY: capability, tools/workspace, parts and labor uncertainty. Reseller: fees, condition-adjusted resale scenarios and downside. Dealer: capital, recon, transport and inventory planning. Unsupported costs, profit and ROI stay unknown; assumptions must be editable and visibly distinguished from quotes.
16. **One evaluation contract - remaining integration.** Version evaluations and share the same evidence, verdict and cost basis across Discover, detail, Compare, alerts and Pipeline. Mode/detail switches must not silently contradict the underlying evidence. Record what changed the decision and what would make the car a buy.
17. **Measured intelligence - open.** Collect validated ownership/resale outcomes, build versioned holdout evaluations and publish sample counts, uncertainty and limitations before any accuracy claim. Use real dated market cohorts before demand/turnover claims. No 99% prediction, guaranteed-margin or stock-market-grade claim is currently supported.
18. **Extraction provider coverage - partial.** Anthropic production samples succeeded, including real dealer-link extraction and an illustrative photo. Test real photographed documents, malformed responses, cancellation and protected URLs with honest alternatives. Google production extraction remains unverified; its recorded production key was empty. No protected-site bypass or unapproved spend.

## Wave 4: Complete Customer Workflows

19. **Saved and sync - incomplete acceptance.** Test account/local-only records, multi-device sync, duplicate saves, failed save/undo, unavailable retention, collections and comparison selection. Confirm local-only status is clear without falsely claiming account sync.
20. **Populated Compare - unverified.** Select two real owned fixtures, including local-only/unavailable cases. Verify aligned title/condition, price basis, all-in ranges, evidence dates, missing costs and mobile differences. Never compare auction bid against retail asking as equivalent prices.
21. **Pipeline mutations - unverified.** Populate stages, complete/reopen tasks, edit purchase/recon/sale costs and notes, attach evidence, fail/retry, reload and check another account cannot mutate the records. Empty stage views are not acceptance.
22. **Alerts and Activity - delivery unverified.** Test a real price/evidence/new-match/auction reminder event end-to-end, preference opt-in/out, duplicate suppression, destination link, timestamps and actual delivery. Never send urgency/high-profit alerts from unverified estimates. Hide runner jargon from customer feed/errors.
23. **Navigation and settings consistency - continuing audit.** Check Discover-to-Scan scope preservation through every entry point, account actions, auction watchlists, desktop/mobile route parity, immediate preference save status, dealer-form Save, themes, keyboard/focus dismissal and browser back. Old registers contain historical issues; reproduce before declaring them still broken.
24. **Page-by-page usability - incomplete.** Audit public/login/register/recovery/onboarding, Discover, Scan, detail, Deal Check, auctions, Saved, Compare, Pipeline, Activity, Settings and Sources, including all exposed specialist tools. Prioritize cars and next actions; collapse optional complexity; move operations to admin. Keep meaningful source/evidence disclosure, not technical noise. Hide unsupported customer claims/tools until they have useful truthful states.

## Wave 5: Devices, Performance And Release Hygiene

25. **Installed PWA - unverified.** On a real installed device prove old-version detection, explicit refresh, cobalt M icon, offline reopening/recovery, saved cached-content limits and no reload loop. Do not call the app offline solely because a request failed.
26. **Accessibility and responsive QA - partial.** Existing five-width checks are narrow. Exercise all critical forms/dialogs/tables and loading/error states at 320/390/430/768/1440, light/dark, reduced motion, keyboard and screen reader; verify focus return, scrolling, text contrast, autofill, logo contrast and tap targets. Verify real task loader success/error/retry/cancellation and capture motion evidence where still missing.
27. **Real-device speed - unmeasured.** Measure cold/warm navigation, state-change-to-cached-results and actual collection latency separately, LCP/INP/CLS, slow-network/error recovery, image weight and API/query timings. Optimize measured bottlenecks without losing fields or inventing progress. Assess database indexes/queries, cache isolation, worker concurrency and Docker/container configuration against the actual deployment and resources.
28. **Housekeeping and dependency debt - open.** Address the 252 lint warnings in scoped waves. Recheck security advisories; the earlier audit left 12 high development-tool findings tied to braces. Do not force incompatible dependency/framework migrations just to clear counts. Preserve other agents' work and untracked attachments/scripts.
29. **Release operations - repeat every wave.** Coordinate with concurrent agents; inspect branch divergence and dirty files. Run full verification before pushing, deploy the tested SHA, confirm canonical domain and production branch, run smoke and signed-in QA, capture evidence and update this register. No bypassed hooks or claims based on stale localhost screenshots.

## Completion Rules And Suggested Order

### Branch Audit Follow-Up

After fetching origin, `main` advanced to `b975273` and includes the merged `master` fixes; `origin/main..origin/master` is empty. The previous verified release remains the dated baseline above until the consolidated release is verified.

Not all historical work is integrated: `codex/app-access-intelligence-audit` has 33 non-merge commits beyond `origin/main` (244 changed files in the branch-side diff, including page removals and workflow changes). `codex/persona-tools-card-filters` has seven patch-unmatched commits. These require a separate three-way integration and regression review, coordinated with the other worktree owner; do not overwrite current main with their older file snapshots. The old Amy price-invention and Cline scraper/toolchain branches also have patch-unmatched commits, although main already contains the relevant safety gates, producer and local-scraper files. Patch mismatch is not proof that their functionality is absent. Local attachments, QA artifacts and machine-maintenance scripts are not deployable app source and were preserved outside the release.

Work Waves 1 and 2 first: access, data truth and source proof determine whether the rest is trustworthy. Then complete Wave 3 evidence contracts, Wave 4 populated workflows and Wave 5 device acceptance. Some can run independently with explicit file ownership.

For each item record: owner; current status (implemented/unverified/missing/blocked); reproduced failure or acceptance fixture; changed files; automated tests; real production evidence; release SHA; limitations. Only mark done after the relevant real workflow succeeds and failure/authorization cases remain safe.

External prerequisites: authorized admin and ordinary test sessions; owner-controlled recovery mailbox; authorized source access; actual inspection/repair quotes and completed-sale evidence; a real mobile/PWA device. Request only the missing specific access. Do not put passwords, tokens or OTPs in this handoff.

Detailed historical evidence: `docs/product-completion-backlog.md` and `docs/qa-2026-10-08.md`. Latest screenshot: `artifacts/qa-upgrade-2026-10-08/history-qa-fixed-production.png` (local artifact, not committed).
