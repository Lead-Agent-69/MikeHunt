# Source coverage acceptance

Read-only production snapshot, October 11, 2026. A source registry entry is not
proof of permission, recent inventory, photos, accurate condition, or valuation.

## Findings and fixes

- Buyer targeting accepted ten dealer identities, while the curated worker knew
  sixteen. Six supported dealers could be rejected or silently dropped from
  watched-dealer scope. Buyer normalization and worker matching now share the
  same domain registry, including Alpine and Replica domain aliases.
- Worker targeting previously searched entire URL strings. Exact/dot-suffix
  hostname matching now prevents unrelated sites matching a dealer name in their
  path, query, or lookalike domain.
- Discover coverage grouped all independent dealers together. It now separates
  known URL-derived dealers and unknown dealer hostnames; multiple vehicle pages
  from the same vendor remain one source. Missing links remain in the generic
  group. This improves reporting, not inventory volume.
- No source-policy block, restricted feed, price/title gate, location constraint,
  retention rule, or buyer authorization was removed.
- The local worker reached 1,000 inserts against its configured 1,250/day limit,
  triggering the existing 80% safety stop. It still reported `running`. Quota
  exhaustion now reports `quota_paused` and leaves unstarted buyer jobs pending
  instead of spending requests on searches it cannot store. Limits and quota
  accounting remain unchanged; collection resumes when the daily quota resets.
  Increasing safe capacity requires the separately reviewed retention/storage work,
  not resetting counters or deleting saved history.

## Live baseline before deployment

Anonymous `GET /api/discover?state=XX`, without a budget cap:

| State | Listings seen within seven days | Listings passing feed filters | Source groups before fix |
| ----- | ------------------------------: | ----------------------------: | -----------------------: |
| MO    |                             400 |                           382 |                        6 |
| FL    |                             876 |                           863 |                        6 |
| TX    |                             144 |                           133 |                        7 |

These are recent row counts, not sold-price evidence or a complete market census.
This snapshot alone cannot prove historical source loss or growth. Buyer budgets,
vehicle classes, titles, and explicit auction eligibility narrow the displayed feed.
The existing worker was healthy and polling scoped jobs; health alone does not
establish successful per-vendor collection.

## Remaining release acceptance

1. Connect a signed-in browser and complete buyer/admin journeys on mobile and
   desktop. No browser surfaces were available to this audit session.
2. Review card PRs #362 and #363 visually before merging them; preserve independent
   card controls and confirm badges fit 320px views.
3. After deploying this fix to web and worker, run bounded, permitted searches
   for representative buyer scopes. Record per-vendor attempted, fetched,
   accepted, stored, duplicate, stale, photo, VIN, title and price-type counts.
4. Verify watched-dealer targets remain selected across onboarding/preferences,
   refresh requests, worker execution and results; never broaden location or
   condition merely to increase yield.
5. Track source counts over time, separately from filtered car totals. Review
   permitted feeds/licensed access when a source cannot yield; do not bypass
   challenges or claim nationwide completeness from registry size.
6. Keep reviewed hosted security/storage migrations as separate acceptance gates.

No signed-in QA, additional ingested cars, or new licensed source access is claimed
by this change.
