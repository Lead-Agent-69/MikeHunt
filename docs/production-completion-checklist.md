# DealerHunt completion checklist

Updated October 29, 2026 (America/Chicago). This is the remaining-work checklist, not a whole-app acceptance certificate. Release receipts and the detailed six-phase register are maintained privately in `C:/MikeHunt/logs/phased-completion-register.json`. Preserve the existing free-service limits, three-day default freshness and 30-day research window.

## 1. Listing truth and source reliability — current priority

- [x] Reproduce finance-dependent amounts incorrectly accepted as unconditional cash prices (12 failing regression cases before the fix).
- [x] Implement adjacent finance/rebate qualification checks in shared price interpretation, preserving separately disclosed full cash prices and source timestamps.
- [ ] Finish release validation and verify the deployed price interpretation. Local tests alone are not deployment evidence.
- [ ] Remove build-time font-network fragility in a focused follow-up; the first price-release gate passed all 5,689 tests but Google Fonts requests failed during the build. Retest before claiming a release.
- [ ] Recheck each enabled Missouri adapter individually: permission, authentication, selected filters, actual vehicle location, selling price, source link, photos and last observation.
- [ ] Repair actual failing sources individually. The October 28 audit recorded eBay Motors timeouts, an older CarParts network failure, and an unclassified eBay sold failure. Parts and sold-evidence roles must not be counted as retail vehicle coverage.
- [ ] Investigate empty results from Copart, Cars.com, independent dealer, AutoTrader, TrueCar and Norfolk towing without equating an empty run to a broken source.
- [ ] Classify unrun adapters as intentionally disabled, restricted, planned or genuinely awaiting repair. Configuration and operator opt-in are not provider permission.
- [ ] Reconcile scope/photo eligibility and confirmed writes with authoritative insert, update, unchanged and deferred reasons. Existing stage counts are observations, not unique vehicles.
- [ ] Check document/window-sticker covers and permitted galleries. A working image URL alone does not prove a vehicle photo.
- [ ] Expand approved neighbouring markets and other selected user locations after reproducible Missouri receipts.

## 2. Evidence and intelligence

- [ ] Reconcile duplicate canonical links using verified vehicle identity while retaining attribution/history.
- [ ] Recheck auction, repairable and clean-retail eligibility consistently in every view and valuation sample.
- [ ] Add permitted sold observations and real owner outcomes; measure errors by region, title, condition and source before promoting decision readiness.
- [ ] Verify every conclusion exposes its source, observation date, missing evidence and calculation assumptions. Keep unsupported profit and repair claims withheld.

## 3. Accounts, preferences and delivery

- [ ] Complete first-time Google/email signup, confirmation, interrupted onboarding and browser-restart acceptance. Returning-owner Google login and isolated account persistence already passed; they do not cover these journeys.
- [ ] Confirm physical-phone recovery completion. The earlier Brevo delivered Auth email does not prove reset completion.
- [ ] Verify cross-device preference/header/onboarding/search synchronization and profile-mirror ordering under concurrent edits.
- [ ] Consolidate alert transport with approved Brevo where supported, then prove real delivery, failure reporting and opt-out. Supabase Auth email is a separate lifecycle.
- [ ] Verify physical-device push and deep links.

## 4. Search and vehicle UX

- [ ] Finish cancellation/timeout/retry checks for source health in Sources, Scan and detail. Discover builder cancellation is already released.
- [ ] Verify visible model, mileage, title, condition, source, radius and sort controls across Results, Feed, Swipe and Map.
- [ ] Verify filter/selection/scroll continuity, infinite loading, scroll-up filters, feed overlays, gestures and map previews without overlaps.
- [ ] Exercise populated Saved, Compare and Pipeline with designated fixtures; restore test changes afterward.
- [ ] Profile actual iOS/Safari scrolling, long sessions and slow networks. Check 320, 390, 430, 768 and 1440px, keyboard access, reduced motion and contrast.

## 5. Protected capacity and recovery

- [ ] Verify independent owner-controlled recovery-key custody and an isolated restore using that independently held key.
- [ ] Implement encrypted versioned archive batches, checksums, service-only index, admin restore and original-identity recovery with transactional reference/version/freshness rechecks.
- [ ] Run the 100-record archive/restore canary only when eligible records exist. Last measured 30-day policy freed zero rows; do not change the cutoff to manufacture capacity.
- [ ] Re-measure reusable capacity without assuming deletion shrinks allocated database files. Keep archival disabled until its recovery gates pass.

## 6. Release and operational acceptance

- [ ] Complete cross-account isolation for Pipeline, costs, outcomes and admin operations.
- [ ] Verify expired sessions, service failures, timeouts, rate limits, offline recovery and installed-PWA updates.
- [ ] Measure database, bandwidth, functions and builds; settle commercial-hosting eligibility within the owner's free-service constraint. Actual Vercel Hobby eligibility remains a separate launch dependency.
- [ ] For each batch: relevant tests, full required gate, CI at the tested commit, merge, deployment and production checks. Collector changes additionally require running-image provenance and retained rollback.

External acceptance dependencies: provider permission/credentials where required, owner-held recovery-key custody and physical-device actions. Record them explicitly rather than marking the phase complete.
