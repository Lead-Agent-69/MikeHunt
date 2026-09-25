# Visor.vin Migration Audit

**How this was gathered:** visor.vin's app is Cloudflare-JS-walled (403 to bots), but its
`robots.txt` + `sitemaps/*.xml` are open. The `changelog` sitemap is visor.vin's complete shipped-
feature history (66 entries) and the `core` sitemap lists the real app routes. That's the spec.

## Visor app routes (the IA to mirror)

- `/` home · `/search/filters` (the listings search + filter engine — the core) · `/dealcheck`
- `/overview/{make}/{model}` (per-model market overview pages) · `/api` · `/changelog` · `/roadmap`
- `/search/listings/` (disallowed in robots — the gated listings search)

## Feature parity vs our app (DealerHunt)

### ✅ HAVE (at parity or better)

- Intelligent / "souped-up" search + natural-language ("F-150 under 25k in Texas") — scan page
- Filters: availability, assembly country, MSRP, dealer type, location, unified filters, year/price/miles
- Email alerts · saved searches · Deal Check (`/deal-check`) · Visor-style API (`/developer` + MCP)
- Map (worldmap + clustering — DealerMap) · compact/display-preference views · zip sorting
- "See similar listings" (SimilarDeals) · "how a listing sits in its market" (MarketContext)
- Fees & addons / pricing breakdown · shipping/transport estimates · tariff signal
- Leaderboard · NHTSA safety data (VehicleSpecs) · Clearance Lot (≈ flash-deals)
- **Recently-sold listings** — NEW (eBay sold → sold_listings); Visor has this, we now do too
- **PLUS ours that Visor lacks:** GO/HOLD/PASS profit verdicts, condition-aware sell estimate,
  recommended max bid/offer, acquisition lanes, fleet/recon pipeline (we're dealer-flip focused)

### 🟡 PARTIAL

- **Visualize Mode** — we have PriceMilesScatter + BestTimeToBuy; Visor's is a fuller dedicated mode
- **Table view** — we have grid + compact; Visor has a sortable dense table ("celebrating the table")
- **Installed options** — we store options JSONB; Visor decodes "5x more installed options" richly
- **License-plate / listing-link search** — we have VIN; plate + paste-a-listing-URL is partial

### ❌ MISSING (the real migration gaps)

1. **Window Sticker** — Visor's signature: "2M window stickers", "window sticker verified" (factory
   MSRP/options sticker per VIN). We have none. Highest-visibility gap.
2. **Listing notes** — private per-listing notes a dealer can attach.
3. **Carfax / extra documentation** surfacing (paid data — may stay out of scope).
4. **Canada market support** — we're US-only (likely out of scope for now).
5. **Off-market listings tools** — Visor surfaces off-market; unclear value for flipping.

## Recommended migration order (highest dealer value first)

1. **Table view** on scan — fast, high-utility for scanning many lots.
2. **Listing notes** — cheap, sticky, dealer-loved.
3. **Fuller Visualize Mode** — consolidate scatter/timing into one mode.
4. **Window Sticker** — biggest gap but needs a data source (NHTSA vPIC gives build data; true OEM
   window stickers are a harder/paid source — scope before building).
