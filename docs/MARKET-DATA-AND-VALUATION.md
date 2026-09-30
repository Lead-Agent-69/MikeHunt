# MikeHunt market data and valuation

## What runs today

- Active listings are collected by the existing source registry and normalized into `deals` using the stable `(source, source_deal_id)` key.
- The valuation engine combines comparable asking prices, source type, condition, mileage, geography, fees, transport, repair estimates, market aggregates, and confidence gates. It uses deterministic calculations for the buy/pass decision; AI embeddings are optional and support similarity search, not the core valuation.
- Completed-sale observations are stored in `sold_listings`. The eBay Motors collector now keys them by the upstream item ID, ignores repeat IDs in its mounted local cache, and relies on a database unique index to prevent duplicates across machines.
- The local Docker scraper persists that sold-item cache at `./cache`. Active listings still refresh their `last_seen_at` and price history so the app does not mistake unchanged cars for stale inventory.
- Sold comps used for US valuation and sold-price APIs are restricted to USD observations in the US. The sold schema can store a different currency and country, but the active-inventory schema and fee/transport model are still US-oriented.

## Data coverage and honest limits

The current Supabase project had zero rows in `sold_listings` and zero dealer-reported rows in `deal_outcomes` when checked on 2026-09-30. The UI therefore has no actual sold comps to display yet. Active listings cannot stand in for sale prices; the app keeps their asking-price evidence separate.

For eBay active listings, the official Browse API supports multiple eBay marketplaces and returns current item summaries. eBay describes Marketplace Insights as the API for eBay sales history, but currently marks it restricted and unavailable to new users. Add the Browse API only after an eBay developer application is approved; use Marketplace Insights only if eBay grants access. See [eBay Browse API](https://developer.ebay.com/api-docs/buy/api-browse.html), [Marketplace Insights availability](https://developer.ebay.com/api-docs/buy/static/ref-buy-browse-filters.html), and [eBay API marketplace support](https://developer.ebay.com/api-docs/buy/ref-marketplace-supported.html).

For vehicle identity, the app already uses NHTSA vPIC, which is designed around vehicles intended for US sale/import and applies rate controls. It is not a worldwide VIN decoder. See [NHTSA vPIC API](https://vpic.nhtsa.dot.gov/api/Home/Index).

International valuation needs market-specific asking and sold data, currency-aware storage and conversion, local tax/fee/transport assumptions, and source permissions. The `sold_listings` fields added here preserve country and currency provenance; they do not claim that the product is ready to issue reliable buy/pass recommendations worldwide. Do not mix non-USD observations into US dollar comps.

Prefer official APIs, licensed feeds, dealer-authorized inventory feeds, and open government data. Respect each source's terms, rate limits, and robots policy. When a provider blocks or restricts access, request permission or use another source instead of trying to defeat its access controls.

## Local scraper setup

Copy the required Supabase settings into the ignored root `.env` file, then start the browser-capable scraper service:

```powershell
docker compose up -d --build scraper
docker compose logs -f scraper
```

Docker Compose mounts `./cache` at `/app/cache` for the sold-item ID cache. The cache stores IDs only, not seller credentials or full listing payloads. It is disposable: deleting it causes the collector to retry database-safe upserts, not duplicate rows. The container build excludes `.env*` secrets and the cache directory.

## Credentials still needed for wider coverage

- An approved eBay developer application (client ID/secret) to use official active inventory APIs.
- Provider approval for any sold-history API or licensed transaction feed; eBay Marketplace Insights is restricted to approved users.
- Optional Gemini API key for embedding-based similarity. The valuation decision itself remains deterministic and available without that key.
- For each added country: a lawful listing/sale data source plus validated currency conversion and local operating-cost assumptions.
