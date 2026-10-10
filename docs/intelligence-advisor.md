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
| **When** | Buy now / Wait | `market_timing_signals` (rebuilt from `price_history` in #219), `predict.ts` (velocity, price-drop odds), `days-on-market.ts` | ≥2 weeks of `price_history` | Signals appear about 1 week after #219 lands |
| **Where to sell** | `in TX` (+ miles) | `lib/geo/buyer-distance.ts`, transport cost model | Per-state median ask for the same year/make/model, plus transport cost | **New:** a `regional_spread` view (below) |

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

## Check any listing (API contract)

`POST /api/check-listing`: one input, one card, for any car, including ones we don't track.

Request (any one of these is enough to start):
- `{ "q": "<listing URL | VIN | '2018 Civic EX 71k $9,500 60432'>" }`, the single box on /find
- `{ "dealId": "<deal uuid>" }`, a car we track: read from our `deals` row (price, source + `source_deal_id`,
  URL, VIN, `last_seen_at`, `auction_end_at`, price history), never re-scraped. Unknown id → `404 DEAL_NOT_FOUND`.
- or fields: `url`, `vin`, `year`, `make`, `model`, `trim`, `mileage`, `price`, `zip`, `state`, `title`
  (clean | salvage | rebuilt | rebuildable). Body fields override a tracked row's values.
- Location: `zip` and/or `state` (two-letter, incl. DC). Both are validated: an invalid ZIP, an unknown state,
  or a ZIP in another state is a `400`. Same for the buyer-home override `homeZip` / `homeState`: the
  signed-in buyer's saved home (`resolveBuyerHome`, server-side) is used by default and body values only
  override it. No default state.
- Rate limit: 10 requests / min per client (`check-listing` bucket).

`POST /api/check-listing/batch`, for list cards (tracked deals only):
- Request `{ "dealIds": ["<uuid>", …] }` (1–20; more is `400 TOO_MANY`), optional `homeState` / `homeZip`.
- Response `{ desk: "flip" | "personal", reads: { [dealId]: CheckListingRead }, missing: string[] }`
  (`missing`: unknown ids, or rows without make / model / price).
- Market data per deal is computed on demand and cached in memory (`lib/cache` `cached`, per instance,
  10 min TTL) keyed by `dealId + updated_at`. The cache holds the unredacted comps; `readForDesk` runs on
  every request, so a flip and a personal caller never share a card.
- Separate rate-limit bucket `check-listing-batch`: 30 requests / min per client (600 cards / min).
  No external cache or paid service.
- Both endpoints send `Cache-Control: private, no-store`.

How it reads the car:
- A URL goes through save-from-url's guarded, IP-pinned fetch (public http(s) only, redirects
  re-checked), then page selectors plus schema.org JSON-LD. An eBay URL also carries its item id, so the
  car is never its own sold comp.
- A VIN is decoded with NHTSA vPIC.
- Prices come only from the page or the user.
- An unreadable page returns `422 PAGE_UNREADABLE` and asks for the details.

Comps (`lib/intelligence/check-listing-data.ts`, service-role reads; nothing reaches the browser except
the desk-specific card):
- Live retail asks: last 7 days, `eligibleAskingPrices` (no auction bids) and `isLiveDeal` (not stale,
  frozen or ended).
- Sales: `sold_listings`, last 180 days, USD/US, with `location_state`, `source` (default `ebay_motors`),
  `source_item_id` as the source id, VIN, and the headline title through market-value `soldTitleLane`.
  Once the `basis` migration lands (separate PR), this query filters `basis = 'sold'`.
- Same model by normalized name (not the first word), same trim when ≥ 3 comps share it, and ±25,000
  miles when the car's mileage is known.

Response `{ read, desk }`, where `read` is `CheckListingRead` (`lib/intelligence/check-listing.ts`).
`readForDesk` picks the card: the flip desk gets `readListing`; everyone else gets `readPersonal`, which
never runs the flip evaluation, gated server-side: retail confidence `none` or `low` → verdict
`not_enough_data` (no Buy / Wait / Pass, `priceRating` null; fair value and its label stay). An unknown
title caps confidence at low, so a personal check needs a stated title (or 6+ sales / listings with one)
to get a verdict.

| Field | Flip desk (`readListing`) | Personal desk (`readPersonal`) |
| --- | --- | --- |
| `verdict` | `buy` / `wait` / `pass` / `not_enough_data` / `not_live` from net profit and engine confidence | `buy` / `wait` / `pass` / `not_enough_data` / `not_live` from price vs retail fair value |
| `priceRating` | null | `good` / `fair` / `negotiate` / `over` |
| `fairValue` | dealer resale where the car sits (engine; asks × 0.95) | retail fair value (`retailFairValue`): `label`, `kind` sold/ask, `range` p25–p75 |
| `maxBuy` | highest price that still clears the target profit (engine `maxAskForNet`) | fair value, rounded down to $50 |
| `resale` + `resale.state` | expected resale in the best sell market | always null |
| `profit` | engine cost line and net | null |
| `confidence` | engine label + score | retail label (score null) |
| `why`, `assumptions`, `comps` | from the sell-market evaluation | from the at-location retail valuation only; no sell state anywhere |
| `live` | the tracked row's freshness (`isLiveDeal`: `stale` / `frozen` / `ended` → `not_live`, never Buy); a page fetched now is live | same |
| `trend` | model-wide `market_timing_signals`, `usedInVerdict: false`; not shown and never changes the verdict until timing is like-for-like | same |

Retail fair value (`lib/intelligence/retail-fair-value.ts`), personal desk only:
1. Sold retail comps, last 180 days: same state n ≥ 3, else national n ≥ 3; copart / iaa / manheim / adesa /
   acv are excluded. Label: "Typical selling price · N recent sales[ in ST]". Verdict: ≤ fair Buy,
   ≤ fair × 1.05 Wait (negotiate), above Pass.
2. Else live retail asks, median with no 0.95 haircut (`aggregateComps` `askToSold: 1`). Label: "Typical asking
   price · N live listings (asking prices, not sales)". Verdict: ≤ p25 good (Buy), ≤ median fair (Buy),
   ≤ median × 1.05 negotiate (Wait), above over market (Pass).
- Same title lane only, and ±25k miles when the mileage is known.
- Confidence: 12 / 6 / 3 comps → high / medium / low; asks cap at medium; median comp older than 90 days
  drops one step; unknown title caps at low; < 3 comps → not enough data.

Engines reused, not re-implemented:
- `lib/arbitrage` `evaluateOpportunity` handles comps, title categories, fees, transport, recon, repair, selling cost and confidence (flip desk).
- `comps-aggregate` never uses a listing as its own comp; the check also drops the pasted URL / VIN (normalized, `isSameVehicleOrListing`) and source + source id.

Desk gate:
- Personal buyers (and signed-out callers) get the retail card: verdict, price rating, Buy ≤ and fair value.
- Profit, resale and where to sell are flip-desk only.
- Responses are `Cache-Control: private, no-store`.
