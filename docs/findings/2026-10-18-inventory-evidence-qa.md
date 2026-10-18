# Inventory Evidence QA - 2026-10-18

Scope: follow-up to #450; addresses #449, #451 and #452. This is not a
whole-product readiness certification.

## Changes

- Sign-in no longer offers a guest Scan preview that redirects back to sign-in.
  Provider-unavailable guidance points to the existing email form. Authentication,
  sessions and protected-route access are unchanged.
- Market source selection distinguishes indexed matches in the current search
  from catalog membership, live source health and total dealer stock. Counts use
  existing filtered rows, exact source hosts and stored source channels. Static
  access-review flags do not enable collection or disclose worker configuration.
- Known placeholder assets no longer count as vehicle photos in galleries,
  card evidence or completeness scores. Original source URLs and saved records
  remain intact. A genuine single-photo listing is not padded with invented photos.
- Market permits photo-less research records, then applies photo evidence filters
  before totals, facets and pagination. Freshness and auction eligibility remain.
  Other discovery views retain their existing eligibility rules.
- Photo maintenance recognizes exact known image bytes during its existing
  bounded probe. No new image requests, write-budget increases, schema changes,
  source permissions, quota resets or cleanup enablement are introduced.

## Evidence and Regression Checks

- Two distinct production CarGurus listings supplied the same dealer-building
  "NEW ARRIVAL / PHOTOS COMING SOON" asset, not a vehicle photo. Their downloaded
  bytes matched SHA-256
  `ef3211bbb7d87a7725d5b7123e1e9282a3187c1851c77d0ef57d9623753f78ab`.
  The implementation's byte classifier was executed against the original download
  and returned true. Image binaries are not committed.
- Focused tests cover source identity spoofing, access-review projection, incomplete
  and failed counts, preserved source brands, placeholder-only intake, mixed genuine
  galleries, stale audit metadata, temporary image failures, photo-less Market
  matching before counts, saved records and email sign-in recovery.
- Initial photo-focused run: 149 passed, one outdated Market photo prerequisite
  assertion failed. That assertion was corrected to preserve freshness and live
  auction constraints without requiring photos. The resulting Market/studio run
  passed all 42 tests. Typecheck passed.

## Release Checks

- [ ] Full local verification on final commit.
- [ ] Exact-head PR CI and review; merge without bypass.
- [ ] Main CI and Vercel alias provenance.
- [ ] Signed-in production checks of affected screens at phone/tablet/desktop sizes.
- [ ] Worker rollout independently verified before claiming maintenance changes live.

## Limits and Follow-up

Unknown image URLs remain unverified candidates, not proof of a vehicle inspection.
This patch is not a bulk historical photo audit. Non-Market SQL photo filters rely
on recorded audit metadata for previously unknown placeholders. Production checks
must remain read-only unless separately authorized.

#445 remains blocked on an authorized primary Postgres backup credential and
independent recovery-key custody. No production backup or restore has been proven;
retention cleanup must remain paused. #453 tracks the unpatched development-only
dependency advisory separately; no broad dependency upgrade is bundled here.
