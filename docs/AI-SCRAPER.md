# Micro-AI scraper — how the smart layer actually works

> **Invent consumer stays DISABLED on purpose.** workers/scrape-worker.ts must not import ai-worker, and ai-worker exits unless invent is explicitly re-enabled. The producer below is opt-in (ENABLE_AI_DEALER_CRAWL=1, default off) and only enqueues VDPs. It does not start the invent worker.


> This is the **accurate** description of the AI layer in the scraping system, written against the real
> code (not the aspirational roadmap). Read this before adding AI to a source or spending Gemini budget.

## The core idea: cheap-first, escalate-to-AI, learn-from-outcome

Blanket-CSS scrapers (most competitors) break the moment a site changes its DOM, and blanket-AI scrapers
(torch money re-extracting every page). Autoverse wins by being cheap on the 95% of pages that parse with
deterministic rules and spending a **micro-AI** (free-tier `gemini-2.0-flash`) only where it earns its keep.

## The live path (already wired)

```
engine.ts (cars_com / copart / iaa …)
  └─ AdaptiveEngine.fetch()   ← static HTTP first; escalate to a browser ONLY when blocked.
                                Learns the winning mode PER HOST; detects Cloudflare/captcha blocks.
  → generic / CSS extraction  → normalize → quality → score → upsert   (NO AI on this hot path)
```

- **AdaptiveEngine** (`lib/scrapers/adaptive-engine.ts`) is the smart, *free* brain: it never burns a browser
  page on a host that serves static HTML, and remembers which strategy worked. This is what already beats
  naive scrapers on cost + resilience.
- **Anti-bot ladder** (free): static → stealth (Patchright) → headed Chrome (`xvfb`) → **FlareSolverr**
  (self-hosted reserve, `docker compose` service `flaresolverr`). All present and deployed — NOT "not started".
- **Valuation** (`lib/scoring/market-value.ts`) is make/**model/year-bucket** comps + an age-adjusted
  cross-year depreciation curve + real completed-sale anchors + an offline baseline. It is NOT "make + first
  model word".

## The AI path (the part that was orphaned — now PRODUCED)

`ai-crawler.ts` + `workers/ai-worker.ts` were complete but **nothing triggered them in batch** — the only
producer was the manual `save-from-url` route. The missing producer is now:

```
scripts/scrape-ci.ts  (ENABLE_AI_DEALER_CRAWL=1)
  └─ ai-dealer-producer.queueCuratedDealerInventory()   ← bounded: N sites × M VDPs per cycle
       └─ ai-crawler.crawlInventoryAndQueueVDPs(url, undefined, maxVdps)
            ├─ AdaptiveEngine (static→browser)           ← render the dealer inventory page
            ├─ deterministic VDP detection               ← FREE; AI only if <5% confidence
            └─ queueForAIParsing(vdpUrl) → aiParsingQueue (bull + Redis)
                 └─ workers/ai-worker.ts  (imported by workers/scrape-worker.ts, runs in the scraper fleet)
                      ├─ Playwright render the VDP
                      ├─ extractVehicleDataFromText → Gemini structured extraction
                      ├─ predictVehicleValuation + real transport cost
                      └─ upsert into deals
```

This targets the **curated independent salvage / rebuilder / dealer network** (`lib/scrapers/curated-sites.ts`)
— precisely the sites with bespoke layouts that a CSS scraper can't parse, which is the moat. `auction_proxy`
sites are skipped (they already have dedicated structured scrapers, so AI there would only duplicate cost).

### Cost discipline (the $0 / free-tier rule)
- Deterministic-first: AI fires on VDP link discovery only when the regex detector is weak (<5% of links).
- Bounded per cycle: `AI_CRAWL_SITES_MAX` (default 8) × `AI_CRAWL_VDP_CAP` (default 12) = ≤96 Gemini calls/cycle.
- The producer is **best-effort** — a walled site is logged and skipped; it can never fail a scrape cycle.
- `tools/cost-guard.ts` (per-run duration/deals/pages/browser budgets) still wraps the browser work.

### Enable / tune (env)
```
ENABLE_AI_DEALER_CRAWL=1      # off by default; left commented in the scraper compose service
AI_CRAWL_SITES_MAX=8          # curated dealer sites to crawl per cycle (0 = disabled)
AI_CRAWL_VDP_CAP=12           # max VDPs per site into the AI queue
GOOGLE_GENERATIVE_AI_API_KEY  # free-tier Gemini key (already used by the AI worker)
```
Redis (`redis://redis:6379`) is already in `docker-compose.yml`; the AI worker's consumer is loaded by
`workers/scrape-worker.ts`, so enqueued VDPs are consumed by any running scraper replica.

## What to build next (to keep beating known competitors)
1. **Self-healing extraction** — score extraction confidence per deal; when low, escalate that page to the AI
   extractor to re-derive selectors and persist them per host. Kills the #1 competitor failure mode (silent
   breakage on DOM change).
2. **Cross-source entity resolution** — dedupe the same car across 4 sites via VIN + `lib/ai/*embeddings.ts`
   into one entity with the best price/freshness. Kills the duplicate spam dealers hate.
3. **Closed-loop calibration** — feed won/lost + sale prices back into `lib/scoring/calibration.ts` weights so
   scoring compounds against fixed-formula competitors over time.

## Files
- Producer: `lib/scrapers/ai-dealer-producer.ts` (+ `.test.ts`)
- Crawler: `lib/scrapers/ai-crawler.ts` (now takes an optional `maxVdps` cost cap)
- Worker: `workers/ai-worker.ts` (parse → valuation → transport → store), consumers wired via Redis
- Agents: `lib/ai/agents/{scraper-agent,valuation-agent}.ts`, models in `lib/ai/config.ts`
