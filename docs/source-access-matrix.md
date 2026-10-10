# Source access matrix

_Last updated 2026-10-09 (CT). This covers every aggregator and source in `lib/scrapers/runner.ts` and `lib/scrapers/sources/`._

House rules (from Jonah):
- **Never remove or disable a source.** Fix it, or add a better path next to it.
- **New paths must be official APIs, partner feeds, sitemaps/robots-allowed pages, or deep links.** No new proxy or evasion features, and no new integrations against an aggregator's private or internal API.
- Rows marked "internal endpoint" below already exist in the codebase and stay as they are. The "best legal path" column is the upgrade, not a replacement.

## 1. Official / partner APIs that return listing-card data

| API | Signup | Free tier | Card fields returned | Fits |
|---|---|---|---|---|
| **eBay Browse API** (`/buy/browse/v1/item_summary/search`, category 6001) | https://developer.ebay.com/signin (create a keyset) | Free. Default 5,000 calls/day; raise via Application Growth Check | title, price, image(s), itemWebUrl, itemLocation (city/state/zip), condition, seller; `getItem` adds localizedAspects (Year, Make, Model, Mileage, VIN, Title status) | ebay_motors, ebay_sold (the Marketplace Insights sold API needs approval) |
| **Auto.dev Listings API** (`api.auto.dev/listings`) | https://auto.dev (email verify, no card) | **1,000 calls/mo**, 5 rps, `limit` ≤ 20 per page | vin, year, make, model, trim, price, mileage, dealer name/location, photos, listing URL | Retail used-car breadth (dealer inventory across the US) |
| **MarketCheck Inventory Search** (`/v2/search/car/active`) | https://developers.marketcheck.com | 500 calls/mo, 5 rps, 100-mi radius. **Their terms say the free tier is for evaluation only, not production** | vin, heading, price, miles, dealer, lat/long, photos, VDP URL, days on market. Also an auction search endpoint | Paid tier ($299/mo, 5k calls) would be the clean "everything" feed; not free-tier production |
| **GSA Auctions API** (api.data.gov) `api.gsa.gov/assets/gsaauctions/v2/auctions` | https://api.data.gov/signup (free key, instant) | DEMO_KEY: 30 req/hr, 50/day. Free key: 1,000 req/hr | saleNo, lotNo, itemName (year/make/model), auction start/end, property city/state/zip, status, lotInfo | gsa_auctions. **Verified live 2026-10-09 with DEMO_KEY: 1,167 active lots, nationwide.** |
| **NHTSA vPIC + Recalls** (`vpic.nhtsa.dot.gov/api`, `api.nhtsa.gov/recalls`) | none | Free, no key | VIN decode (year/make/model/trim/body/engine), recalls | Enrichment for every source; one recall source of truth |
| Cox Automotive (Manheim/Autotrader) APIs | https://developer.coxautoinc.com | Partner/dealer only | Full auction/retail data | Not available to us without a dealer agreement |
| OPENLANE/ADESA, ACV | dealer onboarding | Dealer only | Auction lots | Same |

## 2. Every source in the codebase

| Source (runner id) | How it gets data today | Live rows (active) | Official/partner API? | Best legal path | Cost | Jonah signup? | Expected gain |
|---|---|---|---|---|---|---|---|
| copart | Internal JSON endpoint `/public/lots/search-results` | 957 (last write 2026-10-02) | No public API (members/brokers only) | Keep as is. Add deep links to Copart search for coverage beyond ingest | Free | No | — |
| iaa | IAA sitemap + lot pages (embedded JSON) | in copart/gov counts | No public API | Sitemap is the published path. Keep | Free | No | — |
| gsa_auctions | ppms.gov internal search backend | part of gov_auction (902) | **Yes: GSA Auctions API** | Add an official-API adapter next to the current one (GSA_API_KEY env, DEMO_KEY fallback) | Free | **Yes: api.data.gov key (2 min)** | All 1,167 active federal lots, including vehicles in every state, vs ~72 vehicle lots today |
| govdeals, allsurplus | Liquidity Services "maestro" internal JSON | in gov_auction | No public API | Keep. Add deep links per state | Free | No | — |
| publicsurplus | Server HTML browse pages | in gov_auction | No | Keep (robots-gated) | Free | No | — |
| municibid | Server HTML (ASP.NET) browse | in gov_auction | No | Keep. Fix the parser (marked dead in earlier plans; **not to be removed**) | Free | No | +municipal fleet lots |
| ebay_motors | HTML search pages | — | **Yes: eBay Browse API** | Add Browse API adapter (EBAY_CLIENT_ID/SECRET) | Free | **Yes: eBay dev keyset** | Structured fields + VIN via aspects; far fewer parse failures |
| ebay_sold | HTML sold search via system curl | — | Marketplace Insights (restricted, needs approval) | Apply; until then keep | Free | Yes (application) | Real sold comps |
| cars_com | HTML `data-vehicle-details` JSON on cards | — | No public listing API | Keep + deep link (`/shopping/results/?…`, browser-verified) | Free | No | — |
| cargurus | `ajaxFetchSubsetInventoryListing` via FlareSolverr | — | Car Selector deep link is documented; no listing API | Keep as is (Jonah). Add documented Car Selector deep link | Free | No | — |
| autotrader | `__NEXT_DATA__` via FlareSolverr | — | Cox partner API (dealer only) | Keep + deep link (`searchresults.xhtml`, verified) | Free | No | — |
| truecar | `__NEXT_DATA__` | — | No | Keep (marked dead in earlier plans; **not removed**). Deep link unverified (bot wall) | Free | No | — |
| carvana | Internal search API `apik.carvana.io` | — | No | Keep. **No deep link** (terms forbid linking) | Free | No | — |
| vroom | Browser scrape | — | No | Vroom wound down used-car e-commerce in 2024; source yields nothing. Keep, low priority | — | No | — |
| autotempest | Internal `/api/search` (multi-site JSON) | — | No public API | Keep. New integrations use **deep links** (`/results?make=…&zip=…`, verified) | Free | No | — |
| craigslist | HTML search (optional free-proxy rotation via CL_USE_FREE_PROXY) | — | No API | Keep + per-city deep links (`/search/cta?auto_title_status=…`) | Free | No | — |
| facebook_marketplace | Stealth browser | — | No listing API (Marketplace partner API is seller-side) | Keep as is (Jonah). Deep link `/marketplace/{city}/search?query=…` | Free | No | — |
| offerup | JSON via smartFetch | — | No | Keep | Free | No | — |
| acv, adesa, manheim | Dealer-gated stubs | — | Dealer APIs only | Keep stubs | Paid/dealer | Dealer account | — |
| bring-a-trailer | Browser scrape | — | No | Keep | Free | No | — |
| carparts_com | Parts site | — | No | Keep (parts pricing, not cars) | Free | No | — |
| curated_dealers / independent_dealer | Per-site HTML; **new shared dealer-CMS parser** (PR #214) | 2,030 | Dealer feeds (Dealer.com/DealerInspire public sitemaps + schema.org JSON-LD) | Prefer JSON-LD/sitemaps; one parser per CMS family | Free | No | Damage.com 0→240, D&G 29→161 for sale, +Riverbend/Premier/Gary's |
| auto_discover | Link discovery + **sitemap fallback** (PR #213) | — | n/a | robots/sitemap first | Free | No | Fewer zero-result dealers |
| cas-miami, damage-com (catalog) | Curated crawl | — | — | damage-com fixed by the dealer-CMS parser. cas-miami: fix next (**not removed**) | Free | No | — |

## 3. Signups that would help (all free)
1. **api.data.gov key**: https://api.data.gov/signup. Set `GSA_API_KEY` on Zeus and Vercel. DEMO_KEY (50/day) is fine for tests but too low for a 6-hourly sweep with paging.
2. **eBay developer keyset**: https://developer.ebay.com. Set `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`.
3. **Auto.dev**: https://auto.dev. Set `AUTODEV_API_KEY`. Spend the 1,000 calls/mo on VIN-level listing lookups for the advisor card, not bulk crawl.
4. MarketCheck free tier: only for evaluation. Their terms forbid using it in production.

## 4. Salvage / rebuildable coverage by state (active rows, 2026-10-09 CT)
Format: `salvage-or-rebuilt / all active`. This counts all sources, including Copart and gov auctions.

| | | | | | |
|---|---|---|---|---|---|
| AL 35/55 | AK 0/5 | AZ 9/20 | AR 18/28 | CA 43/75 | CO 18/31 |
| CT 12/14 | DE 12/15 | FL 124/957 | GA 109/202 | HI 16/16 | ID 0/8 |
| IL 47/119 | IN 82/88 | IA 4/92 | KS 28/38 | KY 32/118 | LA 22/39 |
| ME 2/2 | MD 18/49 | MA 17/60 | MI 29/44 | MN 36/57 | MS 4/11 |
| MO 195/291 | MT 3/3 | NE 11/14 | NV 7/11 | NH 3/8 | NJ 273/305 |
| NM 6/11 | NY 54/77 | NC 17/59 | ND 0/3 | OH 11/94 | OK 33/39 |
| OR 5/24 | PA 101/119 | RI 1/2 | SC 13/33 | SD 1/1 | TN 37/81 |
| TX 123/177 | UT 220/254 | VT 5/5 | VA 11/38 | WA 4/26 | WV 4/9 |
| WI 11/13 | WY 1/1 | | | | |

KS, OK and TN rows come from auctions only. None of them has a dedicated rebuilder or dealer source yet. Zero or near-zero salvage states: AK, ID, ND, SD, WY, RI, ME, MT. Next step: the GSA official API (nationwide), then 4cdg-platform dealers in those states. The dealer-CMS parser covers any `vehiclesDetail.php` site by adding one config entry.

## Per-state curated dealer counts (platform sweep, 2026-10-10)

Curated registry plus shared-parser sites per state, before and after the 4cdg / VehiclesNETWORK platform sweep (PR #249). Each new site was verified with one polite fetch: robots allowed, terms silent on automated access, and 3+ priced cars parsed by the shared dealer-CMS parser.

Platform footprints:
- **Creative Design Group / Smart Marketing (4cdg)**: "Website Designed by Creative Design Group", `vehiclesDetail.php?<id>`.
- **VehiclesNETWORK**: "Powered by VehiclesNETWORK", `/autos/<year>-<make>-<model>-<city>-<st>-<id>`.

Excluded by policy: Dealer Car Search sites, ProSalvage, Sam's Riverside (pre-existing entry kept, never removed), Copart/IAA brokers, and the 4cdg multi-dealer marketplaces.

| State | Before | After |
|---|---:|---:|
| AL | 1 | 1 |
| AK | 0 | 2 ⬆ |
| AZ | 1 | 2 ⬆ |
| AR | 3 | 3 |
| CA | 3 | 6 ⬆ |
| CO | 2 | 2 |
| CT | 0 | 0 |
| DE | 0 | 0 |
| FL | 14 | 14 |
| GA | 3 | 3 |
| HI | 0 | 0 |
| ID | 0 | 0 |
| IL | 12 | 13 ⬆ |
| IN | 3 | 3 |
| IA | 15 | 15 |
| KS | 0 | 1 ⬆ |
| KY | 13 | 13 |
| LA | 0 | 1 ⬆ |
| ME | 0 | 0 |
| MD | 0 | 0 |
| MA | 0 | 0 |
| MI | 3 | 3 |
| MN | 5 | 6 ⬆ |
| MS | 0 | 0 |
| MO | 16 | 18 ⬆ |
| MT | 1 | 2 ⬆ |
| NE | 1 | 2 ⬆ |
| NV | 1 | 1 |
| NH | 2 | 2 |
| NJ | 4 | 4 |
| NM | 0 | 0 |
| NY | 1 | 1 |
| NC | 2 | 2 |
| ND | 2 | 2 |
| OH | 2 | 2 |
| OK | 0 | 1 ⬆ |
| OR | 1 | 1 |
| PA | 5 | 5 |
| RI | 0 | 0 |
| SC | 0 | 0 |
| SD | 2 | 2 |
| TN | 0 | 0 |
| TX | 2 | 6 ⬆ |
| UT | 10 | 10 |
| VT | 0 | 0 |
| VA | 2 | 2 |
| WA | 0 | 0 |
| WV | 0 | 0 |
| WI | 1 | 1 |
| WY | 0 | 0 |

Still at 0: CT, DE, HI, ID, MD, ME, MA, MS, NM, RI, SC, TN, VT, WA, WV, WY. Candidates found there were JS-only inventories, BHPH sites without prices, Dealer Car Search sites, or unreachable. Government outlets for KS/OK/TN/AK/ID/ND are tracked separately (#231).
