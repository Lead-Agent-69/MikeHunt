# DealerHunt — Travel-Platform Feature Integration

Reverse-engineering Kayak / Priceline / Vrbo / Booking.com into car sourcing, mapped to the
**actual** stack. "$0 / no paid APIs" is a hard constraint throughout.

## Foundation already in place (this is the unfair advantage)

- **Adaptive $0 scraper** (GitHub Actions + FlareSolverr, rotating shards) → `lib/scrapers/*`, `.github/workflows/*`
- **Detail-page enrichment** → real VIN / mileage / title (`sources/index.ts:enrichDeals`)
- **Decision engine** → buy/sell/repair/profit + verdict + `recommended_max_bid` (`lib/scoring/deal-analyzer.ts`)
- **$0 comps valuation** from our own retail-vs-private data (`lib/scoring/market-value.ts`)
- **Meta-search discovery** → cross-source VIN dedup + deal grades + categorized rails (`/api/discover`, `lib/discovery/categorize.ts`, `/discover` page)
- **Saved searches + match** (`user_saved_searches` → `pipeline.ts:matchUserSearches` → `user_feed_inbox`)
- **Time-series**: `price_history` per deal; `market_trends` + nightly `aggregate-market-data` cron → `market_aggregates`

---

## Phase 1 — ship now (leverages existing infra)

| Feature                 | Travel origin             | How it maps                                                                                     | Touches                                                                 | Status   |
| ----------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| **Max Bid Engine**      | Priceline Name-Your-Price | Dealer enters target profit → reverse-solve the bid ceiling from the engine's stored cost stack | `components/deal/MaxBidWidget` (client math from `deal_analysis.costs`) | building |
| **Saved-Search Alerts** | Vrbo/Booking              | On new match, send email/SMS (modules exist) — not just inbox                                   | `pipeline.ts:matchUserSearches` + `lib/notifications/*`                 | building |
| **Distressed Feed**     | Priceline Express Deal    | Keyword detection (repo/estate/must-sell) + great-grade → rail                                  | `categorize.ts:isDistressed`, `/api/discover`                           | ✅ done  |
| **Flash / Ending Soon** | Booking urgency           | Filter `auction_end_at` within 24h, soonest first                                               | `/api/discover` flash rail + `categorize.ts:auctionHeat`                | ✅ done  |
| **Auction Heat**        | Booking "X viewing"       | Hot/Warm/Live from time-left (no `bid_count` yet)                                               | `categorize.ts:auctionHeat`                                             | ✅ done  |
| **Deal Grades + Rails** | CarGurus/Kayak            | Market-relative Great/Good/Fair badges + 9 rails                                                | `/discover`                                                             | ✅ done  |
| **Price History**       | Kayak price trend         | Per-deal SVG sparkline from `price_history`                                                     | `components/deal/PriceSparkline` + `/api/deals/[id]/price-history`      | building |

## Phase 2 — start the data jobs NOW, ship UI later

The data has to accumulate before the UI is meaningful, so kick the jobs off immediately.

| Feature                               | Mechanism             | Build now                                                                                                                                             | Build later                                                                                                       |
| ------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Price History Graph (class-level)** | Kayak 90-day curve    | Nightly aggregation already exists (`aggregate-market-data` → `market_aggregates`, keyed year/make/model/state/period). Let it fill.                  | A `/api/market-history?make=&model=` reading `market_aggregates` + a class-level chart on the deal/discover pages |
| **Market Timing Signal**              | Kayak buy-now-or-wait | Same `market_aggregates` deltas over periods                                                                                                          | A "trending ▲/▼ N% (90d)" badge derived from period-over-period avg_ask                                           |
| **Deal Map**                          | Vrbo map              | Add a **geocoding BullMQ job** (Nominatim, free, no key) that fills `deals.lat/lng` on new rows (columns already exist; `DealerMap` component exists) | Plot deals as GO/HOLD/PASS pins; drag-radius recomputes transport cost                                            |
| **Distressed enrichment**             | Priceline             | Already keyword-tagging in discovery; optionally persist a `distressed` column for filtering at scale                                                 | Dedicated `/distressed` page + saved-search filter                                                                |

## Phase 3 — plan now, build later (the moat)

| Feature                       | Mechanism               | Notes                                                                                                                                                                                                       |
| ----------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auction Calendar**          | Priceline flexible-date | New scraper targets: auction houses publishing public schedules (no login). Surface "hitting the block in 4 weeks" matched to saved criteria.                                                               |
| **Price Sniper**              | Kayak price alert       | A per-user target-price watch (`price_snipes` table + a BullMQ check job firing notifications) — same pattern as saved-search match.                                                                        |
| **Dealer Intelligence Score** | Booking Genius          | Outcome-logging UI (record actual buy/sell/repair) → calibrate the cost model **per dealer** (their real auction fees, recon, days-to-sell). The longer-game data moat — add logging early so it compounds. |

---

## Sequencing rationale

1. **Max Bid + Saved-Search Alerts** = highest value / lowest complexity, reuse built infra → Phase 1.
2. **Geocoding + class aggregation jobs** = start silently now so Phase-2 UIs have 30 days of signal when built.
3. **Outcome logging** (Dealer Intelligence) = add the capture early even before the scoring uses it — data compounds.

The flywheel: aggressive $0 pull → enrich (VIN/mileage/title) → comps valuation → grade + categorize + dedup → discovery rails + alerts + max-bid → (Phase 2) timing/map/history → (Phase 3) per-dealer calibration. Every scrape makes the data moat deeper.
