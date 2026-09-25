# Architecture

Autoverse is **two verticals in one Next.js 16 (App Router) + Supabase app**, built as deliberate
"twins" that share a spine:

- **DealerHunt Pro (CARS)** — used-car deal finding.
- **HomeIQ (HOMES)** — house flip-lead finding.

Both follow the same pipeline: **harvest → score → store → API → UI**. New contributors should read this
before adding a source, a score signal, or a query.

---

## The twin structure

| Concern           | CARS                                       | HOMES                                                  | Shared                                                                                         |
| ----------------- | ------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Entity / types    | `lib/data/deals-service.ts` (`Deal`)       | `lib/housing/types.ts` (`Property`)                    | —                                                                                              |
| Store / upsert    | `lib/scrapers/pipeline.ts` (`upsertDeals`) | `lib/housing/store.ts` (`upsertProperties`)            | —                                                                                              |
| Deal math         | `lib/scoring/deal-analyzer.ts` (max-bid)   | `lib/housing/deal-analyzer.ts` (70%-rule MAO)          | —                                                                                              |
| Lead score        | `lib/scoring/profit-calculator.ts`         | `lib/housing/lead-score.ts`                            | —                                                                                              |
| Price wording     | `lib/sources/source-meta.ts` (`buyTerms`)  | `lib/housing/price-semantics.ts` (`housingPriceTerms`) | —                                                                                              |
| Source connectors | `lib/scrapers/sources/*`                   | `lib/housing/sources/*`                                | —                                                                                              |
| Categories        | —                                          | `lib/housing/categories.ts` (Quick Lists)              | —                                                                                              |
| DB tables         | `deals`, `saved_cars`                      | `properties`, `saved_properties`                       | —                                                                                              |
| Scrape engine     |                                            |                                                        | `lib/scrapers/{smart-fetch,chameleon,engine}`, `lib/scrapers/bypass/*`, `lib/scrapers/tools/*` |
| Generic extract   |                                            |                                                        | `lib/scrapers/generic-extractor.ts`, `lib/housing/extract-property.ts`                         |
| Geo               |                                            |                                                        | `lib/geo/*`, `lib/geo.ts` (`STATE_COORDS`)                                                     |
| Auth / Supabase   |                                            |                                                        | `lib/supabase*`, `lib/auth/*`                                                                  |
| **DB helpers**    |                                            |                                                        | **`lib/db/paginate.ts` (`fetchAllRows`), `lib/db/stable-id.ts` (`stableId`, `hashJitter`)**    |
| Map / UI atoms    |                                            |                                                        | `components/map/DealerMap.tsx`, `components/ui/*`                                              |

Routes: CARS dashboard lives under `app/(dashboard)/*`; HOMES lives under `app/homeiq/*`. APIs:
`app/api/*` (cars) and `app/api/homeiq/*` (homes). Both verticals are gated behind the same Supabase auth.

---

## Data flow (identical shape both sides)

1. **Harvest** — per-source connectors fetch via the shared `lib/scrapers/smart-fetch` (+ `bypass/*` for
   anti-bot) and normalize to `Partial<Deal>` / `Partial<Property>`. Homes orchestrates every source in
   `app/api/homeiq/harvest/route.ts` (`Promise.all`); the open-data sources are config-driven (see below).
2. **Score** — cars: `analyzeDeal` (buy/repair/transport/sell/ROI/verdict/max-bid). homes: `scoreHousingLead`
   (0–100 + tier + transparent signals) + `analyzeHousingDeal` (ARV/MAO/70%-rule).
3. **Store** — `upsertDeals` / `upsertProperties`: geocode rows, then a self-healing upsert (strips an
   unknown column on a PGRST schema error and retries) into Supabase.
4. **API** — cars via `lib/data/deals-service.ts`; homes via `app/api/homeiq/leads` (DB-first with a
   live-harvest fallback). **Readers that need the whole set must page with `fetchAllRows` — a single
   PostgREST response is capped at 1000 rows.**
5. **UI** — price wording comes from the per-vertical price-semantics module; the map (`DealerMap`) renders
   price-pill markers + photo-card popups for homes and dots for cars.

---

## Adding a new source

**Homes (open data) — the cleanest pattern.** Add one config block to
`lib/housing/sources/open-data-sources.ts` (`MISSOURI_SOURCES` / `NATIONAL_SOURCES` / `CITY_FEED_SOURCES`):

```ts
{ source, api: "socrata" | "arcgis", url, state, city, where, limit, paging?: "oid", map: (attrs, geo) => Property | null }
```

The generic engine (`lib/housing/sources/open-data.ts`) handles Socrata (`$where/$limit/$offset`) and
ArcGIS (offset paging **or** OID-batch via `paging: "oid"`) + lat/lng extraction. `map` emits the distress
`signals` the scorer ranks (`tax_delinquent`, `vacant`, `absentee`, `code_violation`, `foreclosure`, `reo`,
`land_bank`, …). It's registered automatically through `OPEN_DATA_SOURCES` → `fetchOpenDataLeads()`.

**Homes (listing portals).** Add `{ source, env }` to `PORTALS` in `lib/housing/sources/portals.ts` and set
the env var to comma-separated search URLs; parsing is shared (`genericExtractProperties`).

**Cars.** Either a declarative entry in `lib/scrapers/source-configs.ts` (CSS selectors) or an imperative
connector in `lib/scrapers/sources/*` wired into the harvest orchestrator.

---

## Conventions

- **Pagination:** never trust a bare `.select()`/`.limit()` to return everything — PostgREST caps at 1000.
  Use `fetchAllRows((from,to) => query.range(from,to), { max })` (`lib/db/paginate.ts`).
- **Stable IDs:** derive a source-namespaced id from the listing's own URL/address with
  `stableId(basis, source)` (`lib/db/stable-id.ts`) so upserts dedupe across runs. Map centroid spread uses
  `hashJitter(seed, salt)`.
- **Off-market leads** carry distress facts in `signals` (homes) and have no list price → they score on
  owner-distress, not flip math; `owner` + `owner_mailing` enable direct mail.
- **Skip-trace / phone:** never scraped. Owner + mailing address (public record) drive direct mail; phone is
  a future opt-in to a **licensed** provider (BYO key, TCPA/DNC gated).

---

## Known cleanups (tracked, not yet done — see the maintainability audit)

These are intentionally deferred because they're broad refactors (high collision with concurrent work):

- **Shared listing-core** (`lib/core/`): factor `resilientUpsert`, `geocodeRows`, a generic `channelTerms`,
  and a `Vertical` descriptor so the twins _call into_ a core instead of each owning a copy.
- **Supabase clients:** 3 modules (`lib/supabase.ts`, `lib/server-supabase.ts`, `lib/supabase/server.ts`)
  - ~40 inline `createClient(...)` copies → one `serviceClient()`.
- **Naming:** unify `source_deal_id` (cars) vs `source_listing_id` (homes); `profit_score`/`deal_verdict`
  vs `lead_score`/`lead_tier`.
- **JSON-blob fields** (`deal_analysis`, `options`, `signals`, `snapshot`): promote hot filter/sort fields
  to real columns.
- **Cars scraper architectures:** the declarative `source-configs.ts` and imperative `sources/*` overlap —
  pick one.
- **Dead reads:** `seller_phone`/`seller_email` columns don't exist (contact is in `options.contact`); a few
  `app/api/deals/*` routes still read them and get `undefined`.
- **Homes geo:** `properties` has raw `lat/lng` only (no PostGIS `location`), so "near me" is a JS scan.
