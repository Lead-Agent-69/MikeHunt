# Release Integration Audit

Audit started October 10, 2026 UTC (October 9 Chicago). This supplements, rather than replaces, the dated foundation-release handoff.

## Reviewed Integration Wave

- PR #246: pre-push verification resolves the checkout being pushed, preserving the full gate.
- PR #197: Find suppresses missing/unverified profit and bid figures instead of presenting them as supported estimates.
- PR #191: Find Similar uses a body portal, bounded internal scrolling, request cancellation and keyboard focus management.
- PR #232: Discovery card title links have a 44px minimum tap target.
- Integration corrections: Similar searches collected active inventory, not just Saved. Asking prices are not verified sales. Missing photos and prices remain missing; unrelated stock photos and unsupported profit are not displayed. Theme-aware dialog surfaces, retry, background scroll restoration and stale-response tests are included.

Release verification and the final main SHA must be recorded after the gate succeeds. Integration is not evidence of production deployment or full acceptance.

## Outstanding Merge Queue

At the initial queue snapshot there were 36 open pull requests. Other agents are merging concurrently; use `gh pr list --state open` for the current queue rather than treating that count as permanent.

1. Security stack: #209 -> #229 -> #234 -> #244. Review together: saved-record redaction, database grants, pinned DNS/image fetches, bounded deadlines and tri-state availability. Do not retire listings because of a timeout or transient upstream failure. Database migrations require explicit negative authorization and legitimate-workflow checks before production application.
2. Billing: #245 retires a divergent webhook; validate plan/role/checkout behavior and replay/idempotency before release.
3. Valuation: #199 excludes the subject from its own market comparisons; #216 wires the resale engine. Require real comparison provenance and preserve research-only auction safeguards.
4. Title eligibility: #210 plus UI #236/#238/#239/#240/#241/#242. Verify saved preferences, all entry points, unknown/title provenance and repair opt-in consistently; do not publish UI filters disconnected from server filtering.
5. Collection: #213 -> #214/#221, #218 and search #219 -> #225. Prove source terms, scoped parameters, rows/photos/source links and freshness with real permitted runs. Registry size is not proven coverage.
6. UI/accessibility/maps: #200/#205/#208/#222/#224/#230 and the remaining reviewed cards/dialogs. Validate populated states, reduced motion, dark mode, keyboard and mobile scrolling, not just source-string tests.
7. #165 is a 57-package dependency upgrade, not a safe blanket housekeeping merge. Split compatible upgrades and test runtime/toolchain requirements.

## Historical Local Branches

The initial patch audit found 36 unmatched commits on `codex/app-access-intelligence-audit` and seven on `codex/persona-tools-card-filters`. Patch mismatch alone does not mean functionality is missing: squash merges and subsequent replacements change patch identities. Compare functionality with current main before porting anything. Do not replace newer files with historical snapshots or merge page removals blindly.

The primary checkout is concurrently owned by the settings/gallery release. This audit uses a separate managed worktree. Local attachments, QA captures and machine-maintenance scripts are not deployable source and remain untouched.

## Production And Acceptance

The initial canonical Vercel query returned READY deployment `dpl_ACMYnzmMWTwq9MPhZmFB5bF8JuAi` at commit `8fc07c45b6d2ef8d6bbe50f74364b3aa645de34a`, while main had advanced beyond it. Preview failures point to the free build-rate limit. Do not claim that a main merge is live, bypass quotas, or upgrade billing without approval.

Still requiring real acceptance evidence: recovery-email delivery and expired/used callbacks; browser-restart/mobile session restoration; ordinary/admin/cross-account authorization; populated Saved/Compare/Pipeline mutations; delivered alerts; real scoped scraper results and retained unavailable Saved cars; verified completed-sale and repair evidence; installed-PWA update/offline recovery; real-device speed. See `FOUNDATION-RELEASE-REMAINING-HANDOFF-2026-10-09.md` for the detailed 29-item acceptance register.

Do not claim 99% prediction accuracy, full-state coverage, a clean inspection, or purchase readiness without supporting evidence. Current automated checks cannot establish those claims.
