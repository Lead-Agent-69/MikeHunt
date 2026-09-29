# Parked workflows (do NOT re-schedule without reading `../workflows/README.md`)

- `scrape.yml`, `scrape-realtime.yml` — the pre-Fly.io scraping engine. Superseded by
  the Fly.io scraper fleet (`fly.toml`, `docs/SCRAPER-FLEET.md`). Their crons were
  disabled because scheduled Chromium scrapes exceed the private-repo Actions minutes
  free tier. `workflow_dispatch`-only manual runs are fine if you ever need a one-off.
