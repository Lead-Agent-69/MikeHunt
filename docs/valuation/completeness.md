# Missing-photo and low-completeness confidence penalty (production gap audit IV, item 6)

Module: `lib/valuation/listing-completeness.ts`. Pure, not yet wired (see "Wiring").

## Shared score status

The audit plan mentioned another worker adding a per-row completeness score. On 2026-10-10 (main
`dd7f41f` plus all open PRs) there was none. The only completeness logic is the per-source rollup in
`app/api/scrape/health/route.ts` (`addCompleteness`). So the score is computed locally behind one
function, **`completenessFor(row)`**. When the shared score lands, map it there
(`source: "shared"`) and nothing else changes.

## Fields

These mirror the scrape-health rollup, so "has a VIN" and similar checks mean the same thing in both places:

| Field           | Present when                                                                                             | Weight |
| --------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| photos          | `photoCount` / `photo_count`, else non-blank `images[]`                                                  | 0.25   |
| vin             | 17 characters                                                                                            | 0.15   |
| mileage         | > 0                                                                                                      | 0.15   |
| year/make/model | all three                                                                                                | 0.15   |
| title           | title_type / title_status / condition / title-text brand, **not** when `title_source = "source_default"` | 0.10   |
| damage          | condition or damage_type                                                                                 | 0.10   |
| location        | city, state or ZIP                                                                                       | 0.10   |

## Penalty (points off the 0–100 arbitrage confidence score)

| Condition                | Points |
| ------------------------ | ------ |
| No photos                | 15     |
| 1–3 photos               | 5      |
| Each other missing field | 4      |
| Cap                      | 25     |

## What is heuristic vs data-backed

All weights and points are **heuristics**, kept as round numbers. Photos dominate because without
them condition and damage can't be checked remotely. The cap (25) is no larger than the engine's
worst evidence-tier penalty (`ask:national` = 25), so completeness can't outweigh comp evidence.
Calibration path: once `deal_outcomes` has enough closed deals, compare prediction error by
completeness bucket and re-fit the points.

## Wiring (deferred)

The engine's `scoreConfidence` lives in `lib/arbitrage/engine.ts`, and the `CONFIDENCE` table in
`constants.ts`. Both are touched by open #254/#268/#276. After those land, a small PR adds
`hit(completenessConfidencePenalty(completenessFor(row)))` to `scoreConfidence` and selects
`images` (or a photo count) in the `/api/arbitrage` loader. That PR will move confidence labels
and rank keys, so it ships with a before/after count of label changes on prod rows.
