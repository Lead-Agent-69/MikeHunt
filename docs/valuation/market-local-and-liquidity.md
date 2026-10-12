# Market-local valuation and hold time (production gap audit IV, items 2 + 4)

Modules: `lib/valuation/market-local.ts`, `lib/valuation/liquidity.ts`. Pure, no I/O, not yet wired
into `/api/arbitrage` (see "Wiring").

## Market-local valuation (item 2)

`regionalRatio(target, comps, sellMarket)` = median(same-state comps) / median(national comps):

- From **our own comps only**. Same evidence kind on both sides (sold preferred when both sides
  qualify, else asks). n >= 3 on each side. The target listing and stale comps are excluded, using
  the same rules as `aggregateComps`.
- Anything less: `ratio: null`, **no adjustment**, and a `reason` sentence the UI can show.
- The sell market is the buyer's home: `resolveBuyerHome` output (state, ZIP, optional lat/lng)
  is a `GeoPoint`, and a ZIP resolves to its state through `zipToState`.

`marketLocalValue({ value, valueScope, ratio, home, listing })`:

- Applies the ratio **only to national-scope values**. A value from same-state comps already
  reflects the local market and is never re-adjusted.
- Distance changes **transport only**: existing haversine `buyerDistance` × road factor priced by
  `transportCostForMiles`, with the $600 national default when distance is unknown. We do not
  apply a per-mile value discount, because we have no data for one.

The main use is when same-state **asks** exist (n >= 3) but sold comps are national only. The
sold value is then localised by the ask-derived state/national ratio.

## Hold time and liquidity (item 4)

`estimateDaysToSell(rows, { make, model, state })`, same state first, then national:

| Basis          | Source                                                                                                                        | Confidence cap                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `sold`         | sold rows with both a listed date and a sold date                                                                             | compConfidence (12/6/3)                        |
| `delist_proxy` | `deals` rows that disappeared (`active = false` or not re-seen for 72 h, `STALE_AFTER_HOURS`): `last_seen_at − first_seen_at` | **medium**: a delisting is not proof of a sale |

- Live rows are right-censored. When their median age is greater than the estimate, the result is
  flagged "likely optimistic" and confidence drops one step.
- `delistRate` = gone / (gone + live) in the window (180 days by default).
- `soldLast30d` counts sales even without a listed date.
- Fewer than 3 completed durations: `daysToSell: null`.
- `sold_listings` has no listed date today, so sold rows only feed `soldLast30d` until one is captured.

`holdingCost(liq, { enabled, dailyRate })` is the hook for engine `assumptions`. It is **off by
default**: it returns the cost it would book and a sentence, but `included: false`, so net does
not change. `dailyRate` defaults to $35/day, which mirrors `profit-calculator` `dailyFloorRate`
(a heuristic floorplan rate).

## What is heuristic vs data-backed

| Piece                 | Basis                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Regional ratio        | Data-backed (own comps, n >= 3 each side) or absent                                            |
| Transport             | Existing haversine distance and `transportCostForMiles` carrier rate (existing heuristic rate) |
| Days to sell          | Data-backed (own listing churn / sold rows), with an explicit delist-proxy caveat              |
| 72 h "gone" threshold | Mirrors `lib/deals/freshness` `STALE_AFTER_HOURS`                                              |
| $35/day holding rate  | Mirrors the existing profit-calculator default (heuristic); opt-in only                        |

## Wiring (deferred)

- `/api/arbitrage` / `lib/arbitrage/engine.ts` (touched by open #254/#268/#276): after they land,
  add `spread.regional` and `liquidity` to rows, plus the holding sentence in `assumptions`.
  `spread.net` stays the same unless a documented opt-in flag is passed.
- The loader needs `first_seen_at`, `last_seen_at` and `active` for the make/model pool.
  The columns already exist, so no migration is needed.
