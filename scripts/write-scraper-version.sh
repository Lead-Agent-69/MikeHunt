#!/bin/sh
# Stamp the scraper image with the commit it is built from. Run in the MikeHunt checkout right before
# `docker compose ... up -d --build scraper`. The Docker build context excludes .git, so the image
# reads this file (lib/scrapers/ops/version.ts) and every scraper_runs row carries the SHA + build time.
set -eu
sha=$(git rev-parse HEAD)
built=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"gitSha":"%s","builtAt":"%s"}\n' "$sha" "$built" > .scraper-version.json
echo "scraper version: $sha built $built"
