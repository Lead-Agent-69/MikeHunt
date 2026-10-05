# Scraper fleet — deploying across multiple IPs

> **Current production (2026-10-04): Zeus Docker only.** The live fleet is one residential Windows
> box (Zeus) running `docker compose -f docker-compose.local.yml up -d` — see `docs/LOCAL-SCRAPER.md`.
> It writes thin rows (listing fields + photo URLs, never photo bytes) to Supabase; the web app runs
> on Vercel Hobby. **There is no Fly.io deployment** and none is planned (free stack only). The
> sections below are how to add more residential/free hosts if one IP stops being enough.

> **The single most important operational fact:** anti-bot walls (Cloudflare, DataDome, PerimeterX,
> Akamai) score by **IP reputation**. One box hammering a host gets flagged — you watched a single
> laptop IP get burned repeatedly in testing. The fleet only works as designed when its replicas run on
> **different IPs**, i.e. **different hosts/networks**. `--scale scraper=4` on ONE machine = ONE IP = still
> gets burned. This doc is how to actually spread it.

## What's already built

- `Dockerfile.scraper` — Playwright base (Debian + browser deps + xvfb) + Patchright Chromium + real
  Chrome. Runs `workers/scrape-worker.ts` under `xvfb-run`, so the **headed** tier (the only free path
  past PerimeterX/Akamai → truecar, autotrader) works.
- `workers/scrape-worker.ts` — loops a full scrape every `SCRAPE_INTERVAL_MS` (default 30m), spawns
  `scrape-ci` as a fresh child each cycle (clean Chrome teardown), with startup jitter so replicas desync.
- `smartFetch` — per-host cooldown + jittered request pacing so each IP stays clean.

## Required env (every host)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ENABLE_HEADED_SCRAPERS=1        # turn on the headed tier (xvfb is in the image)
SCRAPE_INTERVAL_MS=1800000      # 30 min
# Optional micro-AI dealer crawl producer (default OFF). See docs/AI-SCRAPER.md.
# Needs Redis + free-tier Gemini. Invent consumer stays disabled — this only enqueues.
# ENABLE_AI_DEALER_CRAWL=1
# AI_CRAWL_SITES_MAX=8
# AI_CRAWL_VDP_CAP=12
# GOOGLE_GENERATIVE_AI_API_KEY=...
# optional: dedicate a node to the walled trio
# SCRAPE_SOURCES=cars_com,autotrader,truecar
```

## Pick a deployment — ranked by IP quality (best first)

### 1. Home / residential PCs (best for anti-bot)

Residential IPs are _trusted_ by anti-bot vendors (datacenter IPs are suspected by default). If you have
2–3 machines on different home/office networks, that's the strongest free fleet.

```
git pull && docker compose -f docker-compose.local.yml build scraper && docker compose -f docker-compose.local.yml up -d
```

Run it on each machine (each has its own residential IP). Done.

### 2. Free cloud VMs (different IPs)

**Oracle Cloud Free Tier** gives 2–4 always-free VMs. Datacenter IPs are suspected by anti-bot vendors
by default, so these are weaker than a home PC, but they are free. The point is **one container per VM**
so each gets a distinct IP. On each VM:

```
git clone <repo> && cd MikeHunt
# put the env vars in .env.local.scraper (see docs/LOCAL-SCRAPER.md)
docker compose -f docker-compose.local.yml build scraper && docker compose -f docker-compose.local.yml up -d
```

No paid hosts (Fly.io, VPS, proxies): the stack stays free.

## What NOT to do

- **Don't** `--scale scraper=8` on one host expecting it to dodge blocks — it's one IP.
- **Don't** pay for residential proxies (violates the no-paid-services rule) — distribute real hosts instead.
- **Don't** run the headed tier without `ENABLE_HEADED_SCRAPERS=1` + a display (the image's `xvfb-run`
  handles the display; the flag turns the tier on).

## Verifying it's actually working

- `/status` (admin) → per-source rows on file with **Seen Xh ago** from `deals.last_seen_at` for
  cars_com / autotrader / truecar once a headed host is running. Last-seen is stored-row age, not a
  live heartbeat.
- `/status` → "Valuation accuracy" + "Price knowledge base" climb as data flows.
- `docker compose -f docker-compose.local.yml logs -f scraper` → `[smartFetch] www.autotrader.com → solved via "headed"`.
