# DealerHunt Pro — Roadmap

Living plan. Two tracks: the **Intelligence/scraping** work (mostly shipped this cycle) and the
**Visor feature map** (parity + dealer-specific differentiation). Statuses below are reconciled to
the _actual_ current codebase, not the handoff docs' older snapshots.

---

## Track A — Intelligence & scraping (status)

| Area                                                                     | Status                 |
| ------------------------------------------------------------------------ | ---------------------- |
| Growing intelligence (market_aggregates wired + backfilled)              | ✅ shipped             |
| Self-calibrating verdicts (deal_outcomes → calibration, closed loop)     | ✅ shipped             |
| Deal IQ (signal fusion + win-patterns + mispricing + analyst)            | ✅ shipped (prod)      |
| Embeddings + semantic "similar deals"                                    | ✅ shipped (key-gated) |
| AI Deal Brief / Market Pulse (OpenAI/Google)                             | ✅ shipped             |
| Findability (filters, rail caps, make coverage)                          | ✅ shipped             |
| Bulk sourcing / parts damage map / flash deals                           | ✅ shipped             |
| Scraper redesign ph.1 (escalation + AI-extract + 6 retail sources)       | ✅ PR open             |
| Scraper redesign ph.2 (persistent circuit breaker, engine consolidation) | ⏳ deferred            |
| Browser extension (web-plugin → /api/ingest)                             | ❌ next                |
| Semantic search (query → embeddings → ranked)                            | ❌ todo                |

---

## Track B — Visor feature map (parity + dealer twist)

> Visor is built for consumers buying ONE car. Every item is re-interpreted for **dealers buying to
> flip for profit** — same technique, different output.

### ✅ Already exist (some need a strengthen)

| #   | Visor feature                  | DealerHunt status                                     | Strengthen                                                                                    |
| --- | ------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Nationwide aggregated listings | ✅ 60+ sources → `deals` + verdicts                   | Source badge on every card → **Source ROI dashboard** (todo)                                  |
| 2   | Map search                     | ✅ `/find` Leaflet + verdict pins                     | Marker **clustering** (leaflet.markercluster)                                                 |
| 3   | VIN-based search               | ✅ VIN → full deal analysis                           | **Cross-source "price across sources" table** on deal screen (discover already dedups by VIN) |
| 14  | Saved searches (broad)         | ✅ `user_saved_searches` (make/model/price/profit/GO) | **NL parsing**: "clean Accords under 10k in TX with profit" → criteria                        |
| 15  | Price alerts (Price Sniper)    | ✅ inline matcher over all sources                    | —                                                                                             |

### ⚠️ Partial (data exists, surface it)

| #   | Visor feature                          | What we have                                                   | To finish                                                                      |
| --- | -------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 5   | Full price history per listing         | `price_history` (PriceSparkline) + `vin_price_history`         | Timeline w/ drop badges + "3 drops in 7d = motivated seller"                   |
| 6   | Days on market + regional days-to-sell | `first_seen_at`; `/api/market/timing` returns avg days-to-sell | **Days-on-market badge** on cards (green/amber/red); regional avg on dashboard |
| 13  | Time travel (market as it was)         | `market_aggregates` now populated (cron fixed)                 | `/api/market/snapshot?daysAgo=` → "30d ago avg $X" on timing badge             |
| 21  | Market insights dashboard              | `/insights` (calibration, Market Pulse), Deal IQ               | Home **summary card**: "17 new GO today · avg 14d to sell · Accords −3%"       |

### ❌ Not built (dealer-valuable)

| #   | Visor feature                          | Effort | Notes                                                                              |
| --- | -------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| 4   | License plate → VIN search             | S      | Needs **Plate2VIN** paid API (Pro-tier feature)                                    |
| 7   | Dynamic filters (only live options)    | S      | `get_scan_facets` RPC + facet endpoint                                             |
| 8   | Filter by manufacturer options         | M      | Store mcp.vin option decode → `deals.options` jsonb + GIN                          |
| 9   | Filter by assembly country             | S      | mcp.vin assembly plant → `deals.assembly_country`                                  |
| 10  | Price-vs-miles scatter ("Visualize")   | M      | **recharts NOT installed** — install or build SVG (like PriceSparkline)            |
| 11  | Depreciation curve + predicted price   | S      | Pure linear regression over `deals` (lib/scoring/depreciation.ts)                  |
| 12  | Compare vehicles side-by-side          | M      | `/api/market/compare?vehicles=` profit/margin/days/trend                           |
| 16  | **Sold listings data**                 | L      | Highest accuracy win. Scrape "sold" or MarketCheck `/sold` (key needed)            |
| 17  | Deal Check (doc upload → fee analysis) | M      | **Use existing OpenAI vision** (gpt-4o-mini) via `getTextModel`, not Anthropic SDK |
| 18  | Pricing breakdown (line items)         | M      | Scraper extracts price tables → `deals.pricing_breakdown` + gap flag               |
| 19  | Availability status filter             | S      | `deals.availability_status` (on_lot/in_transit/…) from listing text                |
| 20  | Public API v1 + MCP                    | L      | Dealer-focused **profit** data (GO + net profit) — B2B moat                        |

---

## Corrections to the Visor handoff (verified against code)

- **recharts is NOT installed** (the doc claims "already in stack"). Scatter/depreciation charts need
  `npm install recharts`, or build with inline SVG like `PriceSparkline`/`DealIQCard` already do.
- **MarketCheck** is referenced but not wired (`MARKETCHECK_API_KEY` optional, unused). Sold-comps via
  MarketCheck needs the key + an integration.
- **Deal Check / vision**: we have **OpenAI + Google** keys (not Anthropic). Use `lib/ai/text-model`
  (`gpt-4o-mini` supports image input) — don't add the Anthropic SDK.
- **mcp.vin options/assembly**: confirm `/api/value/[vin]` → mcp.vin actually returns option packages
  & assembly plant before building #8/#9.

---

## Recommended build order (reconciled)

**Sprint 1 — quick wins on data we already have ($0):**

1. Days-on-market badge (`first_seen_at`) — #6
2. Depreciation curve + "$/1k miles" on deal screen — #11
3. Cross-source "price across sources" table — #3
4. Time-travel snapshot ("30d ago avg $X") — #13 (aggregates are live now)
5. Dynamic filters facet endpoint — #7

**Sprint 2 — medium, high value:** 6. Price-vs-miles scatter (install recharts or SVG) — #10 7. Deal Check via OpenAI vision — #17 8. Market insights dashboard card — #21 9. Vehicle comparison — #12

**Sprint 3 — differentiation:** 10. Sold listings (scraper + MarketCheck) — #16 11. Pricing breakdown extraction — #18 12. Manufacturer-options + assembly filters — #8/#9 13. License-plate search — #4

**Sprint 4 — platform:** 14. Public API v1 (profit data) — #20 15. Map clustering, NL saved-search parsing, availability filter — #2/#14/#19

---

## The moat (DealerHunt-only — Visor can't build these for consumers)

GO/HOLD/PASS verdict ✅ · net profit after costs ✅ · Max Bid ✅ · transport est ✅ · recon est ✅ ·
**dealer calibration** ✅ · **outcome logging** ✅ · fleet pipeline ✅ · **bulk sourcing** ✅ ·
parts teardown ✅ · **Deal IQ fusion** ✅ · distressed detection ✅ · auction heat ✅ ·
Source ROI by dealer ⏳ (todo).

---

## Deferred backlog (parked 2026-06-22)

Code-buildable, no external accounts needed — pick up any time:

- **Scraper city-parsing cleanup** — `location_city` is often junk (dealer ad copy,
  names, street addresses), capping geocoding/map coverage at ~586/1485. Fix city
  extraction per source in `lib/scrapers/sources/*`, then re-run
  `POST /api/admin/geocode-backfill`. Highest-leverage data-quality win.
- **"Deals near me" rail** on `/discover` — distance-sorted GO deals using the new
  home + deal coordinates ([[deal-geocoding-system]]).
- **Scheduled geocode backfill** — cron to run the backfill periodically.
- **MCP: more tools** — add `get_deal` / `decode_vin` to `/api/mcp`.

Blocked on the user's accounts/decisions:

- **Stripe live** — needs Stripe account, 3 price IDs, webhook secret, env vars (code done + gated).
- **PostHog analytics** — needs project key.
- **Testimonials** — needs real customer quotes (won't fabricate).
- **Cloudflare CDN** — needs an account/infra decision.

## Visor UI/UX parity (grounded in Visor's real changelog)

- **Light/Dark/System theme** — Visor's flagship; our tokens make it clean. → in progress
- Compact view + Display-preferences (dealer name vs location, hide sold) → todo
- Distance / zip-code sorting (now unlocked by geocoding) → todo
- Recent searches from the search bar → todo
- Gallery / table / map view switching with infinite scroll → partial (have grids + /map)
- Window-sticker "verified" badge → todo (needs sticker data)
