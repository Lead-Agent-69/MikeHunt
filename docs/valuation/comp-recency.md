# Comp recency weighting (production gap audit IV, item 5)

Module: `lib/valuation/comp-recency.ts`, with an opt-in `recency` option on
`aggregateComps` (`lib/scoring/comps-aggregate.ts`).

## Behaviour

- **Off by default.** With no `recency` option (or `recency: null`), `aggregateComps` returns
  exactly what it returned before. A 200-case seeded sweep in `comps-aggregate-recency.test.ts`
  pins this, including the absence of the new `recency` key.
- With `recency: { halfLifeDays, depreciationPerMonth?, inflationPerMonth?, undatedAgeDays? }`, the
  evidence ladder works as before: the same tiers, n >= 3, and raw row counts for n and confidence.
  Inside the chosen tier:
  1. Each comp is brought to today: `price × (1 − dep)^months × (1 + infl)^months`, with
     months = age / 30.4375. Undated comps are not price-adjusted.
  2. Each comp is weighted by `0.5^(ageDays / halfLifeDays)`. Undated comps weigh like a comp one
     half-life old (`undatedAgeDays` overrides this).
  3. The value is the weighted median, then the usual ask→sold haircut. With equal weights it is
     identical to the plain median (tested).
  4. The result carries `recency.effectiveN` (Kish effective sample size) and
     `recency.unweightedValue`, so callers can show how much weighting moved the number.
- The existing 180-day `maxAgeDays` cut still applies first. Recency weighting only re-weights the
  comps that survive it.

## What is heuristic vs data-backed

| Piece                        | Basis                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Half-life                    | **Caller's choice, no default.** A suggested starting point is 60–90 days, about one or two used-market cycles (heuristic)                                                                                                                                                                     |
| `depreciationPerMonth`       | Pass it in, or estimate it from our own comps with `estimateMonthlyDepreciation`: a log-price vs model-year fit, n >= 8 across >= 3 model years, positive slope only; otherwise null. It is a cross-sectional proxy: one model-year older ≈ one more year of depreciation                      |
| `inflationPerMonth`          | **Configurable constant, default 0** (`DEFAULT_INFLATION_PER_MONTH`). Nothing is fetched at runtime and no CPI value is hard-coded. To use it, take the month-over-month change of BLS CPI-U "Used cars and trucks" (series CUSR0000SETA02, public domain) and say so in the row's assumptions |
| Weighted median, effective n | Standard statistics                                                                                                                                                                                                                                                                            |

## Wiring (deferred)

`lib/arbitrage/engine.ts` (open #254/#268/#276) calls `aggregateComps` with `{ now, maxAgeDays,
minSamples }` and is unchanged here. After those land, a small PR can pass `recency` from one
constant in `lib/arbitrage/constants.ts`, behind an evaluation on prod comps (e.g. hold out the newest
comp per model and compare the error with and without weighting), not by default.
