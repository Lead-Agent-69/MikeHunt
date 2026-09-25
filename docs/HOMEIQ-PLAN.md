# HomeIQ — the housing vertical on the AutoVerse engine

**One platform, two apps: DealerHunt Pro (cars) + HomeIQ (houses).** Same Supabase, same brain, free
stack (OpenStreetMap, no paid data APIs). HomeIQ reuses the chameleon scraper, geocoding, OSRM routing,
lead-scoring framework, and the local gate. Only the _entity_ and the _sources_ are housing-specific.

This doc is the grounded plan — corrected from the earlier claude.ai draft, which spec'd ~6 PAID data
APIs (Attom, CoreLogic, PropStream, BatchLeads, RentCast, RESO/MLS). We don't need any of them.

## What's already reused (the engine is domain-agnostic)

| Capability                               | Module                                                | Cars               | Houses                                                                                |
| ---------------------------------------- | ----------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| Fetch past anti-bot walls                | `lib/scrapers/smart-fetch.ts` (+ `platform-detector`) | ✅                 | ✅ same                                                                               |
| Harvest from any site, no bespoke parser | `chameleon.ts` + `generic-extractor.ts`               | ✅                 | ✅ `lib/housing/extract-property.ts` (schema.org RealEstateListing + `__NEXT_DATA__`) |
| GovDeals/AllSurplus API                  | `lib/scrapers/sources/lqdt-maestro.ts`                | vehicles (94A/94Q) | **real estate (95B/95F/959)** ✅ shipped                                              |
| Find inventory pages                     | `crawl-discovery.ts` (sitemap/robots)                 | ✅                 | ✅ same                                                                               |
| Geocode → coords                         | `lib/geo/geocode.ts` (Nominatim/Zippopotam, free)     | ✅                 | ✅ same                                                                               |
| Driving distance/time                    | `lib/geo/routing.ts` (OSRM, free)                     | ✅                 | ✅ same                                                                               |
| Map                                      | Leaflet + CARTO/OSM tiles                             | ✅                 | ✅ same                                                                               |
| Lead scoring framework                   | `lib/scoring/deal-analyzer.ts` shape                  | GO/PASS            | same shape, housing signals                                                           |
| Local CI gate, Docker fleet              | `scripts/verify.mjs`, fleet                           | ✅                 | ✅ same                                                                               |

## Increment 1 — SHIPPED ✅ (proof the engine harvests houses)

- `lib/housing/types.ts` — the `Property` entity (address/beds/baths/sqft/lot/price/type).
- `lib/housing/sources/govdeals-property.ts` — reuses `fetchMaestroAssets` (the SAME GovDeals fetch the
  car scraper uses). **Verified live: 261 real US properties** — single-family fixers ($19,900 Canton IL),
  residential land, multi-family. Exactly the flip leads HomeIQ wants ("Deeply Discounted", "Rehab").
- `lib/housing/extract-property.ts` — `genericExtractProperties(html)`: schema.org + `__NEXT_DATA__`, so
  any housing portal that ships either pattern needs zero bespoke code. Tested.
- 16 unit tests; local gate green.

## Free source roadmap (replacing the paid plan, no MLS license needed)

| Lead type                  | Free source                              | Engine path                                                                                 |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Gov / foreclosure disposal | GovDeals + AllSurplus real estate        | ✅ shipped (maestro)                                                                        |
| HUD homes                  | hudhomestore.gov                         | chameleon (likely `__NEXT_DATA__`/JSON)                                                     |
| Federal real estate        | GSA `realestatesales.gov`                | chameleon (SPA — Antigravity capture, like GSA autos)                                       |
| FSBO / by-owner            | Craigslist `/search/rea`, fsbo.com       | reuse CL engine (search went JS — needs the CL JSON path)                                   |
| Pre-foreclosure            | county NOD / Lis Pendens (public record) | per-county scrapers via chameleon                                                           |
| Tax-delinquent / vacant    | county assessor + USPS vacancy           | per-county, public record                                                                   |
| Portal listings            | Zillow/Redfin/Realtor public pages       | chameleon (walled — fleet/clean IP; `genericExtractProperties` reads their `__NEXT_DATA__`) |

**The one honest paid exception:** skip-trace (owner phone/email for off-market). Free path = public-record
scraping (county + voter + business filings), state-by-state and slower. Flag for a decision later — do NOT
bake in a paid broker by default.

## Schema (when ready — needs a migration + user auth)

Vertical-agnostic core + vertical-specific details (the right call from the architecture discussion):

```
leads        id, user_id, vertical ('car'|'house'), lead_score, status, source, created_at
property_details   lead_id, address, city, state, zip, lat, lng, price, beds, baths, sqft,
                   lot_acres, year_built, property_type, signals jsonb
vehicle_details    (= today's deals table)
pipeline / alerts / contacts / geocode_cache   ← shared, already exist
```

Until the migration is authed, HomeIQ harvests to `Property[]` in memory (proven) — wiring to a
`property_details` table is the next DB step.

## Lead-intelligence signals (housing) — the scoring layer

price-cut velocity · days-on-market · vacancy · pre-foreclosure/NOD · absentee owner · probate/estate ·
price-vs-AVM gap · back-on-market. Same weighted-score shape as the car deal-analyzer; ARV + the 70% rule
(`MAO = ARV×0.70 − repairs`) is the housing analogue of the car max-bid.

## Vertical isolation — NO bleed between cars & houses (enforced)

Two verticals on one engine ⇒ the #1 risk is data crossing over. It's prevented at every layer, and
pinned by `lib/housing/vertical-isolation.test.ts` so the gate blocks any regression:

- **Separate tables** — cars → `deals`, houses → `properties`. Nothing queries across them.
- **Separate mappers** — `maestroAssetToDeal` (car) requires a **model year** (real estate has none → rejected);
  `maestroAssetToProperty` (house) requires a **real-estate category** (`95B/95F/959` or matching category
  text → a vehicle fails it → rejected). Bleed is impossible in BOTH directions, even if a category filter leaks.
- **Separate categories** at the source — vehicles `94A/94Q`, real estate `95B/95F/959` (disjoint).
- **Separate extractors** — `generic-extractor` (vehicle: needs year+make) vs `extract-property` (house: needs
  address+home-signal). A car has no address; a house has no make.
- **Separate UI/API** — `/discover` + `/api/*` read `deals`; `/homeiq/*` + `/api/homeiq/*` read `properties`.
- **Audited live (2026-06-27):** 0 cars in `properties`, 0 houses in `deals` (31.8k rows).

## Phases

1. **FIND** (engine reuse — in progress): more free sources → harvest → geocode → map. ← we are here
2. **SCORE** ✅: housing lead-score engine (equity-aware), hot-leads feed, signal badges. (alerts pending)
3. **ACT** (in progress): ARV/MAO deal analyzer ✅; saved-leads pipeline ✅ (`saved_properties`,
   `/api/homeiq/saved`, `/homeiq/saved` Kanban board, "Save to pipeline" on lead detail). Skip-trace
   (public-record first) + one-tap contact still pending.
4. **MEAN**: location-intelligence overlays (flood/school-trend/appreciation) — free public datasets.
5. **GROW**: financing, market dashboard, community.
