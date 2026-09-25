# Scraper fleet — deploying across multiple IPs

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
# optional: dedicate a node to the walled trio
# SCRAPE_SOURCES=cars_com,autotrader,truecar
```

## Pick a deployment — ranked by IP quality (best first)

### 1. Home / residential PCs (best for anti-bot)

Residential IPs are _trusted_ by anti-bot vendors (datacenter IPs are suspected by default). If you have
2–3 machines on different home/office networks, that's the strongest free fleet.

```
git pull && docker compose build scraper && docker compose up -d scraper
```

Run it on each machine (each has its own residential IP). Done.

### 2. Multiple cheap/free cloud VMs (different IPs)

**Oracle Cloud Free Tier** gives 2–4 always-free VMs; **Fly.io / Hetzner / a few $4 VPS** also work. The
point is **one container per VM** so each gets a distinct IP. On each VM:

```
git clone <repo> && cd Autoverse
# put the env vars in a .env next to docker-compose.yml
docker compose build scraper && docker compose up -d scraper
```

### 3. Fly.io multi-region (one machine per region = distinct IPs)

Use the included `fly.toml` (builds `Dockerfile.scraper`). Each Fly _machine_ gets its own IP; spread
across regions for IP + geographic diversity:

```
fly launch --no-deploy            # once, to create the app
fly secrets set NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ENABLE_HEADED_SCRAPERS=1 ...
fly deploy
fly scale count 3 --region iad,ord,sjc   # 3 machines, 3 regions, 3 IPs
```

## What NOT to do

- **Don't** `--scale scraper=8` on one host expecting it to dodge blocks — it's one IP.
- **Don't** pay for residential proxies (violates the no-paid-services rule) — distribute real hosts instead.
- **Don't** run the headed tier without `ENABLE_HEADED_SCRAPERS=1` + a display (the image's `xvfb-run`
  handles the display; the flag turns the tier on).

## Verifying it's actually working

- `/status` → "Live inventory by source": cars_com / autotrader / truecar should show **live** with
  recent freshness once a headed host is running.
- `/status` → "Valuation accuracy" + "Price knowledge base" climb as data flows.
- `docker compose logs -f scraper` → `[smartFetch] www.autotrader.com → solved via "headed"`.
