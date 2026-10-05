# GitHub Actions

Active here:

- `ci.yml` — typecheck + lint + tests on every push/PR.
- `accuracy.yml` — weekly valuation-accuracy regression gate.

## Why scraping is NOT here — read before re-enabling anything

Scraping **intentionally does not run in GitHub Actions.** It was moved off Actions
because scheduled scrape jobs blow through the private-repo free tier (~2,000 min/month:
a Chromium scrape every 30 min ≈ 2,880 runs × ~1-2 min each). The old scrape workflows
are parked in `../workflows-disabled/` for reference only.

The production scraper is **Zeus Docker** — one residential Windows box running
`docker-compose.local.yml` (see `docs/LOCAL-SCRAPER.md` and `docs/SCRAPER-FLEET.md`).
There is no Fly.io deployment (free stack only):

```powershell
docker compose -f docker-compose.local.yml up -d          # start scraper + redis + flaresolverr
docker compose -f docker-compose.local.yml logs -f scraper # verify the scrape loop is alive
```

The self-hosted runner on Zeus also runs `ci.yml`.

The Vercel Hobby crons (`vercel.json`: profit-sniper alerts, alert processing) and
`embeddings-backfill.yml` are separate from scraping and unaffected.
