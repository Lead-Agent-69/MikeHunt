# Capture audit: what we save from each site (2026-10-10)

Jonah asked (2026-10-10): save eBay sold prices and their details, plus listings from AutoTempest,
Visor.vin and every other site we don't fully capture yet, checking each site one by one.

**How this was measured.** Read-only counts on hosted Supabase (`qupzqpezslsbobhugswp`) at about
3:00 AM CT on Oct 10: `deals` grouped by `source` (and by URL host for `gov_auction`),
`sold_listings`, `scraper_runs`, `scrape_jobs` and `price_history`. "Rows 7d" means rows first seen
or seen again in the last 7 days (`last_seen_at`). Code read on `main` at `cc43589`: `docs/sources-master.md`,
`lib/scrapers/runner.ts`, `lib/scrapers/sources/*`, `sweep-schedule.ts`, `sources-registry.ts`. Live
checks were single polite requests from the box (datacenter IP) and WALL-E (residential IP). All
times are CT.

## Headline numbers

- `deals` holds **5,759 rows from 5 sources**: independent dealers 2,157, `gov_auction` 1,815
  (GovDeals 1,396, GSA 277, PublicSurplus 142), Copart 957, Craigslist by-dealer 521, Craigslist
  by-owner 309. **No row from Cars.com, Autotrader, Carvana, CarGurus, eBay Motors, AutoTempest,
  OfferUp, TrueCar, Facebook, IAA or Visor has ever been stored.**
- `sold_listings` holds **0 rows from any source** (eBay sold, gov feeds, ingest capture).
- `scraper_runs` (history starts Oct 2) shows only craigslist, curated_dealers, independent_dealer,
  gsa_auctions, govdeals, allsurplus, publicsurplus, municibid, copart and truecar. Buyer-scoped
  jobs (`scrape_jobs`) only ever ask for curated_dealers, independent_dealer and gsa_auctions.
- `price_history`: 5,193 price points on 3,784 deals. `first_seen_at` / `last_seen_at` are set on
  every row.

## Site by site

Fields: **L** live listings, **S** sold or last-bid price, **V** VIN, **M** mileage, **P** photo URLs
(never bytes), **T** title status, **ST** seller type, **Loc** location, **FL** first/last seen,
**PH** price history. ✓ = captured, ~ = partial, ✗ = not captured.

| Site | What we capture | Rows 7d | Last success | What's missing and why | Fix |
| --- | --- | --- | --- | --- | --- |
| **eBay sold** (`ebay_sold`) | S, title, year/make/model, M, sold date, item id + URL (+ trim and state in #264) | 0 (0 ever) | never (no `scraper_runs` row since Oct 2) | Everything. Never ran against hosted in the window (terms-gated off Oct 5-9, not in buyer jobs, last in the Zeus sweep). When it runs, eBay answers the curl path with **HTTP 403 "Error Page" from both a datacenter and a residential IP, even on the homepage**. The code then reported a successful 0-row run. City, condition, title status, sale channel were never parsed. | eBay sold PR: honest `challenged` errors, pacing/backoff, city/condition/title status/`sale_channel='ebay'`, per-project cache, migration 20261010500000. No new evasion: until eBay stops refusing, this source stays at 0 and says so. The licensed route is eBay Marketplace Insights (needs eBay approval; Jonah's call). |
| **AutoTempest** (`autotempest`) | L, V, M, P (1), T, ST, Loc mapped to the origin site (parser exists) | 0 (0 ever) | never | Its search API now refuses unsigned requests: our honest request gets `{"status":-1,"errors":["You are not authorized to access this resource."]}`; the old browser-UA request gets `{"status":1,"results":[]}`. The site's own app signs each call with a token built in its JS bundle. Results pages are an empty JS shell (`noindex`). robots.txt has no rules. | Visor/AutoTempest PR: record the refusal as `challenged` (not "success, 0"), dedup by VIN/origin URL, origin URL as the link and `options.discoveredVia='autotempest'`, `operator_override` in access-class. We do **not** compute their token. Deep links keep working. |
| **Visor.vin** (`visor`, new) | L, S (ask), V, M, P (≤6), Loc (city/state/zip), dealer name, dealer's own listing URL | 0 (new) | n/a | Visor publishes a public listing sitemap (6,273 "fresh" listings on Oct 10, `robots: Allow: /`) and public listing pages with schema.org Vehicle JSON-LD. The sitemap reads fine. **Listing pages answer our Node client with a Cloudflare managed challenge** (`cf-mitigated: challenge`, "Just a moment..."), while plain curl currently gets 200. We don't switch clients to get past a challenge. | Visor/AutoTempest PR: new `visor` runner through politeFetch only, VIN pre-dedup before any page fetch, dealer URL as canonical link + `options.discoveredVia='visor'`, `challenged` recorded and run failed honestly, `operator_override` in access-class (photos never cached). Captures rows whenever the pages answer (e.g. from Zeus). |
| **Autolist** | deep link only (`lib/multisite`) | 0 | n/a | No parser and no runner. | Not cheap: needs a new parser and a terms review. Left as a deep link. |
| **Cars.com** (`cars_com`) | parser (stealth browser) for L, V, M, P, Loc | 0 (0 ever) | never | JS-rendered + bot-walled; restricted, restored Oct 9 but the Zeus sweep hasn't produced a row. | Zeus rebuild + sweep check (zeus checklist). Body-type deep links fixed in #287. |
| **CarGurus** (`cargurus`) | parser exists, runner `enabled:false` | 0 | never | DataDome captcha; we don't bypass. | None (deep link stays). |
| **Autotrader** (`autotrader`) | parser for L, V, M, P, Loc, KBB fair price | 0 (0 ever) | never | Restricted, restored Oct 9; no sweep row yet. | Zeus rebuild + sweep check. |
| **Carvana** (`carvana`) | open JSON parser for L, V, M, P | 0 (0 ever) | never | Restricted, restored Oct 9; no sweep row yet. | Zeus rebuild + sweep check. |
| **Craigslist** (`craigslist`, `craigslist_dealer`) | L, Loc (city/state), ST (owner/dealer), FL; V/M/T/P only from detail-page enrichment | 830 | Oct 10, 2:05 AM (5,000 found) | VIN 0/830, mileage 91/830, photos 5/830. Search cards have no photos; enrichment fetches at most 60 detail pages a run (`CL_ENRICH_MAX`), and the gallery parser mixed 50×50 thumbnails into photos. | Audit PR: gallery keeps full-size photos only, one per image id. Raising `CL_ENRICH_MAX` on Zeus is the bigger lever (zeus checklist). |
| **Facebook Marketplace** | runner `enabled:false` (login) | 0 | never | Login-gated. | None (deep link). |
| **Copart** (`copart`) | L, P (1), Loc, damage, current bid / ACV | 0 (957 stored, last seen Oct 2) | Oct 2, 5:32 AM | VIN is masked by Copart (partial only). **Mileage was hard-coded 0** although the public lots JSON carries `orr` (odometer; 74,308 on a sampled lot today); trim (`ltd`) and zip dropped. No run since Oct 2. | Audit PR: mileage from `orr` (not-actual/exempt dropped), trim, zip. Zeus sweep check. |
| **IAA** (`iaa`) | runner `enabled:false` | 0 | never | Login-gated. | None (deep link). |
| **GovDeals** (`govdeals` via LQDT maestro) | L, P, Loc, auction end; V 87/1,396, M 110/1,396 | 758 | Oct 5, 10:13 PM | VIN/mileage only when the lot text has them; no run since Oct 5. Sold prices: rebuilt #302 (Jonah approved, accepted risk). | Zeus sweep check; rebuilt #302 for sold lots. |
| **AllSurplus** (`allsurplus`) | same maestro parser | 0 stored (488 found Oct 2) | Oct 2, 8:08 PM | Found rows never landed: no `deals` row has an allsurplus.com URL (likely dropped by the car/truck scope; the run log is on Zeus). | Check on next Zeus run (zeus checklist). |
| **PublicSurplus** | L, V 125/142, M 88/142, auction end | 0 (142 stored) | Oct 2, 8:06 PM | No city; no run since Oct 2. | Zeus sweep check. |
| **Municibid** | parser | 0 | Oct 2 (0 found) | Parser returned 0. | Not cheap without a live page review. |
| **GSA Auctions** (`gsa_auctions`) | L, P, Loc, auction end | 226 | Oct 9, 10:00 PM | No VIN/mileage from the browse parser. Closing bids (last_bid) in rebuilt #302. | Official API adapter #271 (needs `GSA_API_KEY`). |
| **Independent dealers** (`curated_dealers` → `independent_dealer`, 33 hosts) | L, V 1,146/2,157, M 1,805/2,157, P all, Loc 2,110, ST, FL, PH | 2,097 | Oct 10, 2:01 AM | VIN where the dealer page shows it. | More dealers in #270/#272/#277/#288/#294. |
| **Government sold feeds** (Norfolk impound, Seattle fleet, GSA closing bids) | built in #302 (closed; rebuild pending) | 0 | never | #302 closed when its base branch was deleted; must be recreated on main after #264. | Rebuilt #302 (`sale_channel` gov lanes). The eBay migration keeps those channel values. |
| **TrueCar** | parser (headed only) | 0 | Oct 6 (0 found) | Headed browser only. | None now. |
| **OfferUp** | parser | 0 (0 ever) | never | Restricted, restored Oct 9; no sweep row yet. | Zeus sweep check. |

## Top gaps

1. **eBay sold is blocked, not broken.** eBay refuses our request path outright (403 on every
   page, both IPs). The code fixes make that visible and store full detail when pages come through.
   Real coverage needs eBay's licensed sold-data API (Marketplace Insights), which needs approval.
2. **Most restored marketplaces have never stored a row.** Cars.com, Autotrader, Carvana, eBay
   Motors, OfferUp and AutoTempest were restored Oct 9, but Zeus has only swept Craigslist, curated
   dealers, GSA and GovDeals since. A Zeus rebuild and a check that `SCRAPE_SOURCES`,
   `SCRAPE_TERMS_SAFE_ONLY` and `CACHE_ONLY_MODE` are unset/false is the first fix.
3. **AutoTempest and Visor don't hand data to an honest client.** AutoTempest requires a signed
   token; Visor's listing pages challenge our client (the sitemap is open). Both now record
   `challenged` instead of "success, 0".
4. **Craigslist detail fields are thin** (VIN 0%, photos ~1%) because only 60 detail pages are
   read per run.
5. **Copart mileage was thrown away** although the public JSON has it (fixed here).
6. **`sold_listings` is empty**, so every valuation still runs on asking prices.

## Rules this work kept

Never remove or disable a source. Cars and trucks only. Thin rows: text and photo URLs, never
photo bytes. No login, captcha bypass, proxies or fake browsers; a challenge is a "no" and is
recorded. Migrations need Ren's sign.
