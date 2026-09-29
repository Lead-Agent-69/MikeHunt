# GitHub Actions

Active here:

- `ci.yml` — typecheck + lint + tests on every push/PR.
- `accuracy.yml` — weekly valuation-accuracy regression gate.

## Why scraping is NOT here — read before re-enabling anything

Scraping **intentionally does not run in GitHub Actions.** It was moved off Actions
because scheduled scrape jobs blow through the private-repo free tier (~2,000 min/month:
a Chromium scrape every 30 min ≈ 2,880 runs × ~1-2 min each). The old scrape workflows
are parked in `../workflows-disabled/` for reference only.

The production scraper is the **Fly.io worker fleet** — see `fly.toml`
(app `dealerhunt-scraper`) and `docs/SCRAPER-FLEET.md`:

```bash
fly deploy                      # build Dockerfile.scraper and ship
fly scale count 3 --region iad,ord,sjc   # distinct IPs defeat single-IP rate walls
fly logs -a dealerhunt-scraper  # verify the scrape loop is alive
```

The Vercel-side crons (`vercel.json`: profit-sniper alerts, alert processing,
embeddings backfill) are separate from scraping and unaffected.
