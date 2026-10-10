# Value-Adding Release Execution

## Decisions and continuity

Approved sources only; global GO floor is $3,000, with higher saved buyer targets respected by the
decision model and deal-detail policy. Lower-margin listings stay available for review. Source rights
and evidence gates can demote a recommendation but must never fabricate a GO.

Customer tools do not require payment. Legacy billing labels remain for compatibility; admin access
is separate and remains server-authorized. Do not resurrect listing, finance or bulk navigation.
Preserve saved cars, searches, notes, preferences and purchase/dealer pipeline history. Consolidate
duplicate navigation only after an equivalent contextual entry point and redirect are proven.

## Executable evidence

- `node scripts/release-ledger.mjs`: live GitHub metadata for the handoff queue, final head SHAs,
  bases, migration paths and current-head formal reviews. Output is a snapshot, not permission to merge.
  Ren's sign may live in comments; check it explicitly against the final SHA. Truncated evidence and
  branches stacked on non-main bases require separate review. The command performs no merges or deploys.
- `npx tsx scripts/release-preflight.ts --scope core --env-file <private-worker-env>
--expected-project-ref qupzqpezslsbobhugswp --expected-sha <full-reviewed-sha>`: read-only checks for
  reviewed grants, publishable coverage, the intended database, server credentials, Redis and persistent ingestion.
- `npx tsx scripts/release-preflight.ts --scope alerts --env-file <private-sender-env>
--expected-project-ref qupzqpezslsbobhugswp`: validate matching push keys, contact subject, email
  credentials, signing-secret shape and HTTPS deep-link origin. Database fallback secrets and provider
  connectivity are not tested by this command. Never put secret values in CLI arguments.
- `npm run verify`: final integrated typecheck, lint, tests and production build. SQL fixtures,
  authenticated QA, real delivery, deployed migration receipts and canary evidence are additional gates.

## Landing order and overlap decisions

1. Security and broken saved searches: seller-contact/source-host/image boundaries, fetch bounds,
   saved-search scope columns and database grants. Verify final-head signs and dependencies first.
2. Reconcile #336 with #269/#290, #296/#309/#314/#323/#327, #306/#332, #307/#333 and #312.
   Keep reviewed expiring authorization authoritative; classifications are descriptions, not grants.
   One run-outcome vocabulary, one price-change writer, one source breaker, and one conservative identity
   authority must survive. Fuzzy matches remain review candidates; never discard distinct offers.
3. Intelligence/sold evidence: #300, #254, #264 -> #268 -> #276, #316/#324/#331, then enrichment and
   valuation wiring. Do not run rescore-all until the deployed policy and eligible data are verified.
4. Alerts/workflows and perf: delivery tracking/admin view, saved-search tuning, cards, photos, filters,
   free-access copy, pagination, virtualization/scroll restoration and map batching. Test the combined
   branch, not just isolated PRs. Link-only sources remain useful without unauthorized collection.
5. Approved source expansion, Jonah's Zeus rebuild and a 48-hour canary. Merged is not synonymous with live.

## Implemented in this branch

- Integrity foundation and guarded current-permission reads; detailed limits remain in the rollout runbook.
- Main alert-delivery tracking and previously landed security/UI fixes integrated without replacing their work.
- Shared $3,000 GO floor in the calculator, analyzer, dealer scenario store, core card/feed/map serializers
  and categories. Existing low-margin GO payloads are demoted without deleting listing data.
- GO/HOLD filters in Scan, Map and Nearby agree with the profit floor before rescoring; Nearby ignores
  flip-verdict probes for personal desks. Dealer scenarios use the saved cost-default profit target.
- Free deal-view access, calibration and saved-search notifications no longer depend on legacy payment gates.
- Permission synchronization preserves identical approved grants instead of holding all inventory on every run. Changed or removed rights are still revoked before replacement. Run synchronization from a single operator; this helper is not a distributed policy-edit transaction.
- Read-only queue ledger and redacted configuration preflight; permission flags require actual booleans.

## Still required, not claimed complete

The reviewed approval registry is empty. Production migration application, full-schema/production-sized
rehearsal, verified backup/restore and Ren's final-head sign remain pending. Do not deploy this branch
against an unmigrated database or cut over to an unexplained empty marketplace.

Acceptance must also cover remaining independently constructed clients/RPCs, GO filters/counts/alerts
after rescoring, and higher per-user targets across every feed (detail and domain support alone do not
prove global personalization). Browser subresource quotas, verified-empty/full-scan expiry, operator
quarantine UI/re-observation and legacy receipt recovery remain separate unfinished work.

Run all supported desk journeys: onboarding and free expansion, Discover/Scan filters, previews,
Saved/Compare, purchase/dealer Pipeline, settings save/reload/cross-device sync, Deal Check,
notification delivery/deep links, admin denial and account isolation. Capture desktop/mobile screenshots
and keyboard/focus behavior. Do not infer passed journeys from unit tests.

Record before/after approved distinct inventory, completeness, source verification freshness, search
relevance, notification delivery, user task completion and representative p95 response/layout timings.
Investigate performance regressions above 10%; do not claim valuation accuracy from asking-price
agreement or completeness scores. Sources awaiting permission remain unavailable with permitted alternatives.
