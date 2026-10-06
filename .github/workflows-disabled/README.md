# Parked workflows (do NOT re-schedule without reading `../workflows/README.md`)

- `scrape.yml`, `scrape-realtime.yml` — the old Actions scraping engine. Superseded by
  Zeus Docker (`docker-compose.local.yml`, `docs/LOCAL-SCRAPER.md`). Their crons were
  disabled because scheduled Chromium scrapes exceed the private-repo Actions minutes
  free tier. `workflow_dispatch`-only manual runs are fine if you ever need a one-off.
