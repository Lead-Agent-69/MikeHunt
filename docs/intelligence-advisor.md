# Intelligence Advisor: what to buy, when, why, for how much, and where to sell

Goal (Jonah): tell a buyer **what to buy, when, why, how much to pay, how much to sell for, and where**,
from real market data, while staying **Apple simple**. One card, one answer, and a "why" you can open.
No dashboards to learn.

## The card (all the user sees)

```
┌──────────────────────────────────────────────┐
│ 2018 Honda Civic EX · 71k mi · Joliet, IL    │
│                                              │
│  BUY ≤ $11,400        SELL ~ $14,900 in TX   │
│  ≈ $2,100 profit after fees & transport      │
│                                              │
│  Buy this week: prices are up 6% in 30 days. │
│  ▸ Why                                       │
└──────────────────────────────────────────────┘
```

Rules for the card:
- **Three numbers max:** buy ceiling, sell price, and net profit. Everything else lives behind "Why".
- **One verb:** Buy / Wait / Pass. Never a score the user has to interpret.
- **Show evidence or show nothing:** if a number has no real basis (too few comps, no sold data), the card
  says "Not enough data" for that number. It never shows an estimate as if it were measured.
- **Same layout on every desk.** Personal buyers see Buy ≤ and fair price. Profit, max bid and where to sell
  stay on the flip desk (existing `listingsForDesk` redaction).

## The five answers and where each comes from

| Question | Answer on the card | Engine (exists) | Data it needs | Gap |
| --- | --- | --- | --- | --- |
| **What to buy** | Ranked feed of Buy cards | `lib/intelligence/deal-iq.ts` (fused 0–100), `mispricing.ts` (below-cluster outliers), `profitable-segments.ts` (your own wins) | Active deals + comps | Rank by **net profit per day of capital**, not raw score |
| **Why** | 2–4 plain sentences | `decision-guard.ts`, `repair-risk.ts`, `condition.ts`, NHTSA recalls (`lib/vehicle/nhtsa.ts`) | Listing text, VIN decode, recalls | Turn the existing reasons into sentences; cap at 4 |
| **How much to pay** | `BUY ≤ $X` | `deal-analyzer.ts` (`recommended_max_bid`: fees, title, repair, transport, target margin) | Comps, fee tables, repair model | Use **sold** comps once they exist (see below); today it's asks |
| **How much to sell for** | `SELL ~ $Y` | `comps-aggregate.ts` (same-state first, never its own price), `baseline-value.ts` sanity gate | Comparable asks now; sold prices later | Ask ≠ sale. Apply a measured ask→sold discount per segment once `sold_listings` fills |
| **When** | Buy now / Wait | `/api/market/timing` → `lib/market/timing.ts` (like-for-like, #262; see [Market timing](#market-timing-apimarkettiming)), `market_timing_signals` view for other readers, `predict.ts` (velocity, price-drop odds), `days-on-market.ts` | ≥2 weeks of `price_history`, fixed-price listings re-seen across weeks | No verdict below the minimum sample (`confidence: none`) |
| **Where to sell** | `in TX` (+ miles) | `lib/geo/buyer-distance.ts`, transport cost model | Per-state median ask for the same year/make/model, plus transport cost | **New:** a `regional_spread` view (below) |

## Market timing (`/api/market/timing`)

`GET /api/market/timing?make=Ford&model=Explorer`. It compares like with like: first the same listing's ask over time (`same_listing`), then a year × mileage band × trim cohort index (`mix_adjusted`). Below the minimum sample it returns no signal (`none`). Window is 30 days, with the recent window being the last 7. Fixed-price asks only: auction bids and asks under $500 are excluded. Method and thresholds are in `lib/market/timing.ts` (`TIMING_THRESHOLDS`):
- `same_listing`: low at 3 pairs, medium at 8, high at 20. A verdict needs a move of at least ±3%.
- `mix_adjusted`: low at 2 cohorts, medium at 5 cohorts with 8+ listings per window. It is capped at medium, and a verdict needs at least ±5%.

| Field | Meaning |
| --- | --- |
| `make`, `model` | Echo of the query (model matched on its first token) |
| `signal` | `BUY_NOW` \| `WAIT` \| `NEUTRAL` \| `null`; null unless `confidence` is high or medium |
| `confidence` | `high` \| `medium` \| `low` \| `none`; low shows the trend with a caveat and no verdict |
| `basis` | `same_listing` \| `mix_adjusted` \| `none` |
| `trendPct` | Like-for-like change in percent over the recent window (1 dp); null at `none` |
| `current_median_price` | Median current ask of the matched sample (context, not a verdict) |
| `prior_median_price` | Median earlier ask of the same matched sample (`same_listing`: each listing's ask before the recent window; `mix_adjusted`: prior-window asks in matched cohorts) |
| `matched_count` | `same_listing`: listings compared with their own earlier ask. `mix_adjusted`: distinct listings in cohorts seen in both windows. `sampleSize` is the same value |
| `window` | `{ from, recentFrom, to, days, recentDays }` |
| `reason` | Plain-language explanation, including why there is no signal |
| `caveat` | Set only at low confidence |
| `detail` | `{ sameListingPairs, mixCohorts, mixRecentListings, mixPriorListings }` |
| `avg_days_to_sell` | Mean `days_to_sell` from `deal_outcomes` when 3+ exist, else null |

**Deprecated aliases** keep the same values so older readers (the `MarketTiming` badge) don't break:
- `timing_signal` = `signal`
- `pct_change_30d` = `trendPct` when there is a signal, else null (it is a 7-day like-for-like change, not a 30-day one)
- `current_avg_price` = `current_median_price` (a median)
- `data_points` = `matched_count`
- `reasoning`: canned text for `signal`

**`market_timing_signals` view** (migration `20261010110000`, same-listing only). It is read by the ticker, analyst, dashboard summary, deal-iq and compare. `/api/market/timing` does not read it. The column names are kept for compatibility, so read them as follows:
- `current_avg` is the **median** current ask of the matched listings.
- `prior_avg` is the **median** baseline ask of the same listings.
- `pct_change` is the mean per-listing change, clipped to ±30% per listing.
- `signal` is `BUY_NOW`/`WAIT` at ±3%, otherwise `NEUTRAL`.
- `data_points` is the **matched listing count**, not raw observations.
- `basis` is always `same_listing`.
- `confidence` is `medium` at 8–19 pairs and `high` at 20+.
- `sample_size` equals `data_points`.

Rows only exist at 8+ matched listings.

## What's new to build (small, in order)

1. **Removed-listing events → "likely sold".** When an active deal goes inactive after 72h+ unseen, write a
   `sold_listings` row with `basis = 'removed'` and its last ask. That's honest, labelled data. The full `ebay_sold`
   scraper stays opt-in. This one change makes `/api/sold` non-empty and gives days-to-sell.
2. **`regional_spread` view:** per (year ±1, make, model), the median ask by state over the last 30 days
   (n ≥ 5). Best state = highest median minus transport cost from the car's location. Feeds "SELL in TX".
3. **Ask→sold discount per segment** from (1). Until n ≥ 20 for a segment, use the published national
   discount and label it "estimate".
4. **Capital-velocity rank:** `net_profit / (days_to_sell + days_to_acquire)`. Surfaces cars that turn fast,
   not just big spreads.
5. **Card + "Why" sheet:** one component used on /scan, /find and alerts. Tap "Why" for the evidence:
   comps used (count, radius, date range), timing trend, risks, and the math line by line.
6. **Alerts in the same voice:** "Buy: 2018 Civic EX ≤ $11.4k, sells ~$14.9k in TX" (existing
   alerts cron, new copy only).

## Honesty rules (non-negotiable)

- Every number has a **basis** (`measured`, `estimate`, `insufficient`) and the card shows it.
- Never use a listing's own price as its comp (already enforced in `comps-aggregate.ts`).
- "Removed" is never called "sold" in the UI. It's labelled "left the market".
- No paid data is implied. If a number would need CARFAX/MMR, the card says so instead of guessing.

## Data inputs (all terms-safe)

Active listings from the scrapers (polite crawler, #213), dealer CMS sites (#214), GSA official API (#221),
gov surplus (#223), NHTSA vPIC + recalls (free), `price_history` (every sweep), and removed-listing events (new).
Multi-site deep links (#220) let users check sites we don't ingest. No data is taken from them.

## Success measures

- ≥ 70% of active deals show all three numbers with `measured` or labelled `estimate` basis.
- Advisor "Buy" picks: median realized margin within ±20% of predicted, tracked via `deal_outcomes`.
- Time from opening the app to the first Buy card: under 3 seconds on mobile.
