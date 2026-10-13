# Inventory Experience Acceptance Review

Scope: the Feed, Swipe, Map, discovery access, style filters, and sold-price
intelligence requests. This is not certification of every historical request.

## Landed And Verified Before This Follow-Up

Production release c41f061 (#395 and #396):

| Request                      | Implementation                                                                              | Evidence / limitation                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Fix Feed overlap             | In-flow controls, one card per vehicle, no duplicate showcase                               | Live responsive QA at 320, 390, 430, 768, 1440px; no horizontal overflow               |
| Inspect without leaving Feed | Quick Review native dialog, full analysis remains available                                 | Live open, Escape, focus restoration, body scroll restoration                          |
| Familiar car-focused Swipe   | Pass/Save, distance/velocity threshold, photo controls, keyboard arrows, vertical scrolling | Live Pass; automated failed-save retry; no undo yet                                    |
| Map car previews             | Actual source photo, honest price meaning, approximate location, named markers              | Live tap preview; hover/focus handlers implemented, actual mouse-hover QA not recorded |
| Reach views directly         | Results/Map/Feed/Swipe from Discover; loading guard retains user scope                      | Automated cold-start and stale-response checks; live Feed links                        |
| Preserve buyer settings      | Shared explicit scope and approved preferences, actor-specific redaction                    | Automated coverage; no independent four-mode account walkthrough this wave             |
| Truthful price meaning       | Down payment, bid, reference amount, missing amount distinguished from purchase price       | Automated Feed/Swipe/Map tests and live Quick Review                                   |
| Sold-price research          | Existing qualifying sold records plus clearly external Cars & Bids/eBay research links      | Live no-qualifying-sales state; these links are NOT new ingestion feeds                |

## This Follow-Up

- Live QA found Discover shortcuts narrowed four saved markets to the onboarding
  state. The shared view scope now uses every saved market, preserves an explicit
  nationwide selection, and lets explicit URL locations override those defaults.
- Body-style selections disclose incomplete source coverage and provide a native
  GET reset that retains locations, search text, repair eligibility, and other
  filters. No unknown vehicle is silently assigned a body style.
- Feed exposes the existing last-seen date without calling it verified current
  availability. Invalid/missing dates remain explicitly unreported.
- Swipe can browse all photos supplied by its API rather than silently discarding
  photos after the eighth. Long galleries use a counter without crowded strips.

## Still Required Before Calling Every Ask Complete

1. Verified body-style enrichment: observed Ford F-150 records had null body class;
   strict Pickup filtering consequently missed them. The UI recovery does not fix
   source data. Review VIN enrichment work (#330/#347) and prove coverage with real
   permitted source/VIN results before enabling broader claims.
2. New sold-price ingestion: approve a permitted feed/API/export for each source;
   distinguish sold, sold-after, reserve-not-met, final bids, and undisclosed offers.
   Preserve source/date/title/condition/comparability; never treat an asking price
   or hidden accepted offer as a confirmed transaction price. Pending sold and
   access PRs require their existing review gates, not blanket merging.
3. Performance measurement: collect representative device frame-time, interaction,
   load, and map-density measurements. Responsive layout and test passes are not
   evidence of 4K images or a specified FPS. Source photos may be lower resolution.
4. Swipe undo: define and test queue restoration and server save reversal separately.
5. Review peer work for scroll restoration (#344), scan virtualization (#343), and
   dense map batching (#345), including conflicts with the current release.
6. Complete live reduced-motion, keyboard map, hover, all buyer-mode, and normal-user
   versus admin walkthroughs. Fix legacy map-filter contrast before claiming a
   whole-app accessibility audit.
7. Source expansion requires proven scoped output, access permission, freshness,
   photos, and quota capacity. The paused scraper quota must not be reset or raised
   to manufacture coverage. A registry entry alone does not prove live inventory.

## Release Gates

Run focused tests, full verify, hosted CI, then merge and verify the production
alias and read-only release smoke. Record failures as well as successful retries.
Do not remove pending requests from this list merely because related UI exists.
