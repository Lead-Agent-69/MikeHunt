# Auto-Sourcing & Scraping Tools — Research & Gap Analysis (DealerHunt)

Date: 2026-06-20  
Focus: Inventory current capabilities, compare to industry best, identify missing pieces, and recommend/port high-value patterns to make sourcing fast, broad, and reliable.

---

## 1. Current State Inventory (What We Have)

### 1.1 Source Coverage (Declared vs Implemented)

- **Declared (lib/utils/sources.ts + allCarSources.ts)**: ~60+ sources across:
  - Salvage Auctions (Copart, IAA, A Better Bid, SalvageBid, GlobalAA, etc.)
  - Wholesale (Manheim, ADESA, ACV, OPENLANE, EBlock, SmartAuction, OVE, TradeRev, CarWave, etc.)
  - Private/Retail (Craigslist, FB Marketplace, eBay Motors, OfferUp, Cars.com, CarGurus, Autotrader, Hemmings, BaT, etc.)
  - Repo/Gov (GSA, PublicSurplus, GovPlanet, IronPlanet, PoliceAuctions, PropertyRoom, Repo.com, etc.)
  - Specialty/Collector (Mecum, Barrett-Jackson, RM Sotheby's, etc.)
  - Parts (car-part.com, LKQ, Pull-A-Part, UsedPart.us, RockAuto, eBay Parts, CarParts.com, Hollander, etc.)
  - Independent dealer seeds (hundreds mentioned, generic profiles for DealerSocket/WordPress).

- **Actually Implemented & Wired (lib/scrapers/sources/ + runner.ts registry)**:
  - `copart.ts` — Patchright + internal API fallback; partial extraction; often returns DOM size for bypass test.
  - `iaa.ts` — Axios + cheerio with free proxy; fragile selectors.
  - `craigslist.ts` — Mature static HTML, multi-city, good pagination.
  - `ebay-motors.ts` — Basic.
  - `facebook-marketplace.ts` — Registered but `enabled: false`.
  - `acv.ts`, `adesa.ts`, `manheim.ts` — Stubs/partial; require auth; registered disabled.
  - `carparts-com.ts` — Stub, disabled.
  - `index.ts` also has independent dealer crawler with generic profiles (DealerSocket, WP).

- **Registry (runner.ts + registry.ts)**:
  - Central `ScraperRegistry` with priority, frequency, stealth flags, run stats, auto-disable on failures.
  - Many high-value sources registered **disabled** (`enabled: false`).

### 1.2 Engines & Stealth

- **AdaptiveEngine** (`adaptive-engine.ts`): Static HTTP first, escalate to browser on blocks. Host-mode cache, simple static TTL cache.
- **Patchright** (`patchright-engine.ts`): Used for Copart. Patched Chromium (no Runtime.enable leaks). Route blocking for images/fonts. Good baseline.
- **Playwright** (plain + pool): `browser-pool.ts` for context reuse, profile + proxy injection.
- **AI Crawler** (`ai-crawler.ts`): Uses LLM + deterministic VDP regex to find vehicle detail pages on dealer sites, then queue.
- **No Camoufox** (Firefox C++ stealth) yet.
- **No managed scraping browser** (Browserbase, Scrapeless, etc.).

**Current stealth strength**: Medium. Patchright beats basic headless, but Copart/FB/Cloudflare-heavy sites still brittle. Free proxies kill reliability.

### 1.3 Proxies

- `proxy-manager.ts`: Typed config (residential/datacenter/mobile), health stats, env-loaded paid proxies.
- `free-proxy-provider.ts`: Pulls from Geonode etc. Used by IAA/Craigslist fallbacks.
- Reality: Most active scrapers either use no proxy or free lists. Paid residential not wired into most scrapers at runtime.

### 1.4 Orchestration & Scheduling

- **Multiple orchestrators**: Sequential, Concurrent, Priority, Queue (BullMQ), Realtime.
- **BullMQ workers** (`workers/index.ts`): Recurring jobs (Copart 5min business hours, CL hourly, IAA 30min, alerts). Logs to `scrape_jobs`.
- **QStash scheduler**: Serverless cron alternative.
- **Registry state persistence** (`state.ts`): Supabase-backed enabled/ failures / stats.
- **Runner** (`runner.ts`): Wires registry; supports dry-run, progress callbacks.

**Strength**: Architecture is ahead of most side projects.  
**Weakness**: Few sources actually enabled + producing live data.

### 1.5 Data Layer & Enrichment

- `enrichAndStore` (shared.ts): Title parsing, MarketCheck attempt (keyless), then `DealScoringService`.
- **VIN decode**:
  - `lib/vin-decoder.ts`: Pure NHTSA vPIC (free, solid baseline).
  - `lib/api/vin.ts`: mcp.vin aggregator + NHTSA fallback + recalls + fuel economy + photos (when available).
- **Pricing/MMR**: Thin. MarketCheck call exists but no key. No Edmunds TMV. No wholesale valuations.
- **Parts**: Calculator UI exists; teardown save API exists; no live parts inventory scrapers running.
- **Deals table** is the sink; scoring + profit/ROI computed on ingest.

### 1.6 Gaps Already Visible in Code

- Most wholesale/salvage high-margin sources disabled or incomplete.
- No robust residential proxy rotation in scrapers.
- No Camoufox for hardest CF.
- No live parts interchange or Hollander-style cross-reference.
- Independent dealer discovery is present but not a daily scheduled broad crawl.
- No per-host sophisticated rate limiting / backoff visible uniformly.
- UI scan progress relies on Redis keys set by `/api/scrape/*` but many paths don't update them.

---

## 2. Industry Landscape (What the Best Are Doing in 2025-2026)

### 2.1 Data Sources & Access Models

| Category                                      | Leaders / Options                                                                                       | Access Reality                                                                              | Notes for Us                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Salvage Auctions**                          | Copart, IAAI                                                                                            | No public API for 3rd parties. Scraping or paid resellers (apiAuctions, auction-api.app).   | Must scrape or pay aggregator. Stealth + residential required.                      |
| **Wholesale (Manheim, ADESA, ACV, OPENLANE)** | Official portals exist for **licensed dealers** (Manheim developer portal with OAuth + MMR valuations). | Dealer login / token required.                                                              | Legal/compliance wall. Either become partner or scrape as logged-in dealer (risky). |
| **Retail Marketplaces**                       | Cars.com, Autotrader, CarGurus, Carvana, CarsForSale, TrueCar                                           | Public but heavily protected. Apify actors, Scrapewise, Carapis offer normalized feeds.     | High value for comps. Easy-ish with good stealth + residential.                     |
| **Classifieds**                               | Craigslist, FB Marketplace, OfferUp                                                                     | CL is static-friendly. FB is hard (Camoufox or residential + session cookies).              | CL we already do well. FB needs upgrade.                                            |
| **Specialty/Collector**                       | BaT, Mecum, Hemmings, DuPont                                                                            | Lower volume, often easier scraping or RSS.                                                 | Nice-to-have for high-margin flips.                                                 |
| **Parts**                                     | car-part.com, LKQ, Pull-A-Part, RockAuto, Hollander, eBay Parts                                         | car-part.com is gold (200M+ OEM). Needs dedicated parser. Hollander for interchange.        | Huge margin lever if we get live yard inventory.                                    |
| **Specs / Build Data**                        | NHTSA (free), Edmunds, CarQuery, Auto.dev, CarsXE                                                       | NHTSA baseline; Edmunds/CarQuery for deep specs; Auto.dev for unified VIN + listings + TCO. | We have NHTSA + mcp.vin. Missing deep specs + photos at scale.                      |
| **Pricing / MMR**                             | Manheim Market Report (partner), MarketCheck, Edmunds TMV, Black Book, KBB wholesale                    | Paid or partner. MarketCheck strong for listings + history.                                 | We attempted MarketCheck but no key. Without it, profit estimates are guesses.      |
| **VIN History / Recalls / Photos**            | NHTSA recalls, mcp.vin aggregator, Auto.dev, CarMD, Experian AutoCheck (paid)                           | Free recalls good. Photos/history paid.                                                     | We pull recalls + some photos via aggregator.                                       |

### 2.2 Stealth & Anti-Bot (2025-2026 Reality)

- **Patchright**: Excellent for Node/Playwright shops. CDP-level patches. Good vs mid-tier.
- **Camoufox**: Current king for hard targets (Cloudflare Enterprise, PerimeterX, Datadome). Firefox C++ fork, Playwright-compatible via Python. Near-zero detection on many suites.
- **Others**: Scrapling (orchestrates multiple), SeleniumBase UC, Nodriver, Botasaurus.
- **Managed browsers**: Browserbase, Scrapeless, Anchor, Steel — high success, CAPTCHA included, but cost.
- **FlareSolverr**: Declining fast vs Turnstile + Managed Challenge. Still ok for soft JS challenges.

**Our position**: Patchright is a solid start. We need Camoufox option for Copart/FB/dealer sites that fight back.

### 2.3 Proxies

Top residential providers 2025/26: Bright Data (largest, tooling), Oxylabs (enterprise), Decodo/Smartproxy (balance), SOAX (geo), IPRoyal, Webshare, Rayobyte.

- Residential >> Datacenter for auctions/marketplaces.
- Geo + ASN + sticky sessions matter.
- Success rate on protected sites is mostly "residential + good fingerprint + low concurrency".

**Our position**: Skeleton for paid proxies exists. Free lists are used in hot paths. This is a primary failure point.

### 2.4 Orchestration & Scale Patterns

- Queue + workers (BullMQ / Celery / RQ) with per-source rate limits.
- Priority + backoff + circuit breakers.
- Separate "discovery" (find listings) vs "enrichment" (VIN decode, photos, pricing) pipelines.
- State machine per source (last success, failures, cooldown).
- Progress streaming (Redis pub/sub or SSE) for UI.

We already have most of this architecture. Execution (enabled sources + proxy quality) is the gap.

---

## 3. Gap Analysis — What We Are Missing / Weak

### 3.1 High-Impact Missing / Weak Sources

- **Copart** — Partial; bypass test returns length instead of parsed deals. Needs full extraction + better pagination.
- **IAA** — Fragile selectors + free proxies = flakey.
- **Manheim / ADESA / ACV / OPENLANE** — Stubs, disabled, auth wall. Either partner path or logged-in scraping (high risk).
- **Cars.com, Autotrader, CarGurus, TrueCar** — Declared but no dedicated scrapers running. Huge for retail comps.
- **car-part.com, LKQ, Pull-A-Part, Hollander** — Declared, almost zero implementation. Parts is a profit lever.
- **FB Marketplace** — Hard; needs Camoufox + residential + session handling. Currently disabled.
- **Independent dealer broad crawl** — AI crawler exists but not scheduled broadly or discovering new dealers daily.

### 3.2 Data & Intelligence Gaps

- **No reliable MMR / wholesale value** → profit estimates are weak.
- **Shallow specs** (no deep equipment/options from Edmunds/CarQuery).
- **Photos** — sometimes present via aggregator, not systematic.
- **No parts interchange** → can't answer "will this fender fit my other car?"
- **No live auction history** (sold prices) for true comps.

### 3.3 Technical / Ops Gaps

- **Stealth**: No Camoufox. Patchright alone not enough for top targets.
- **Proxies**: Free lists in production paths. No automatic residential rotation or per-source geo preference.
- **Rate limiting / politeness**: Inconsistent. Risk of self-DoS or bans.
- **Error classification**: Generic retries; no "challenge vs ban vs network" distinction.
- **Progress visibility**: Some Redis keys exist; not all scrapers update them.
- **Parts pipeline**: UI ready, backend data starved.
- **Discovery flywheel**: Dealer site discovery is ad-hoc, not a continuous "find new inventory sources" loop.

### 3.4 Legal / Business Reality

- Wholesale auctions (Manheim etc.) require dealer licenses + platform agreements for real data. Scraping logged-in sessions may violate ToS.
- Strategy:
  - Public sources (CL, eBay, Cars.com, retail dealer sites) → full steam.
  - Salvage (Copart/IAA public views) → scrape with best stealth.
  - Wholesale → either partner or use 3rd-party resellers (gray) or synthetic "market value" from retail comps.
  - Document this clearly.

---

## 4. Portable Patterns — What to Copy / Duplicate

### 4.1 Stealth Upgrade

- Add **Camoufox** (Python) or find a Node equivalent / managed browser fallback.
- Keep Patchright for speed on easier targets.
- Strategy: per-source "preferred engine" (static / patchright / camoufox / managed).

### 4.2 Proxy Strategy

- Make `ProxyManager` the single source of truth.
- Tiered: free (dev/low risk) → residential (prod high-value).
- Inject at engine level (Patchright/Playwright context).
- Health scoring + auto-ban + cooldown (already sketched).

### 4.3 Data Enrichment Stack (Cheap → Paid)

1. NHTSA (free, baseline decode + recalls)
2. mcp.vin or Auto.dev aggregator (VIN + photos + some history)
3. MarketCheck (listings + pricing comps) — when key present
4. Edmunds / CarQuery (deep specs)
5. Hollander (parts interchange) — paid

Fallback gracefully; never block a deal because enrichment failed.

### 4.4 Orchestration Wins Already in Our Code (Keep & Extend)

- Registry + state persistence.
- Multiple orchestrator strategies.
- BullMQ + QStash.
- Progress callbacks.

Just need to **turn sources on** and feed them quality proxies.

### 4.5 Quick-Win Scrapers to Port

- Cars.com / Autotrader / CarGurus retail (high volume, easier than auctions).
- car-part.com search by vehicle (huge for teardown value).
- More robust FB Marketplace via Camoufox.

---

## 5. Recommended Action Plan (Prioritized)

### Phase 0 — Hygiene (Now)

- [ ] Audit every registered scraper: mark `enabled` accurately.
- [ ] Remove reliance on free proxies for Copart/IAA/FB paths.
- [ ] Ensure all scrapers update Redis progress keys (`scraping:progress` etc.) or a unified status store.

### Phase 1 — Core Salvage Reliability (High ROI)

- [ ] Fix Copart extraction to return real deals, not just length.
- [ ] Harden IAA selectors + switch to residential proxy path.
- [ ] Add Camoufox engine option; route Copart/FB through it when Patchright fails.

### Phase 2 — Retail Comps & Pricing

- [ ] Implement Cars.com, Autotrader, CarGurus basic scrapers (cheerio or adaptive).
- [ ] Wire MarketCheck (if key) or fall back to averaging retail listings for "marketValue".
- [ ] Expose real comps in deal analyzer.

### Phase 3 — Parts Sourcing

- [ ] Implement car-part.com + LKQ basic inventory search by YMM.
- [ ] Add Hollander interchange lookup (if key) or heuristic.
- [ ] Feed live parts value into teardown calculator.

### Phase 4 — Discovery & Scale

- [ ] Schedule daily AI crawler over known dealer seeds + Google-like discovery for new independents.
- [ ] Add per-source rate limits + circuit breakers.
- [ ] Add source health dashboard (success rate, last success, deals/run).

### Phase 5 — Wholesale (Strategic)

- [ ] Document partner path for Manheim (API access).
- [ ] If not partnering: either skip or use 3rd-party wholesale data resellers with clear disclaimers.
- [ ] Never pretend we have live Manheim lanes without auth.

### Phase 6 — Ops & DX

- [ ] Make scan page show real orchestrator logs + per-source progress.
- [ ] Add dry-run + "test one source" buttons for ops.
- [ ] Improve error taxonomy and alerting on consecutive failures.

---

## 6. What to Port / Duplicate Immediately (Concrete Next Edits)

1. **Add Camoufox support** (or document managed browser fallback).
2. **Promote ProxyManager** into all active scrapers; deprecate inline free-proxy usage for high-value sources.
3. **Enable + fix** top 3 currently disabled or broken: Copart (full), IAA (solid), at least one retail (Cars.com or Autotrader).
4. **Parts source** — one real implementation (car-part.com search).
5. **Pricing fallback** — if no MarketCheck key, average recent listings from our own DB or a free aggregator call.
6. **VIN photos** — ensure `lib/api/vin.ts` or enrichment pulls photos when available and stores on deal.
7. **Status endpoint** — ensure `/api/scrape/status` or equivalent reads the same keys orchestrator/worker write, for live UI.

---

## 7. Out of Scope / Warnings

- Do not build a "dealer login harvester" for Manheim/ADESA without legal review. This is a business development conversation, not a scraping task.
- Free proxies will always be a source of pain. Budget for residential.
- Cloudflare / anti-bot is an arms race. Plan to rotate techniques (Patchright → Camoufox → managed) rather than one silver bullet.

---

## Appendix: Quick Source Enablement Checklist

- [ ] copart — full parse + store
- [ ] iaa — stable selectors + residential
- [ ] craigslist — already good, keep
- [ ] ebay_motors — verify volume
- [ ] facebook_marketplace — needs Camoufox + sessions
- [ ] cars_com, autotrader, cargurus — implement
- [ ] car_part_com, lkq — implement
- [ ] manheim/adesa/acv — document auth requirement or partner path

This document is the research baseline. Next step: start porting the highest-leverage missing pieces (stealth upgrade, proxy promotion, Copart/IAA fixes, one retail + one parts source).
