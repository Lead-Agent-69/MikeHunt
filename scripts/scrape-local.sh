#!/bin/bash
# Free local scraper runner for DealerHunt — $0, no GitHub Actions, no paid services.
# Rotates Craigslist shards across the country and writes fresh deals to Supabase. Runs on your
# residential IP, so detail pages aren't blocked → you actually get VINs + images.
#
# Schedule it with launchd: see scripts/com.dealerhunt.scrape.plist (every 30 min).
# Run once by hand to test:  bash scripts/scrape-local.sh
set -euo pipefail

# Resolve project root (this script lives in <root>/scripts).
cd "$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Adaptive + freshness-aware: each run scrapes the stalest cities first, and the batch size scales
# to how far behind coverage is (light when fresh, bigger to catch up). No shard bookkeeping.
# Pin CL_ADAPTIVE_COUNT to force a fixed size.
LOG="${TMPDIR:-/tmp}/dhp-scrape.log"
echo "[$(date '+%F %T')] start (adaptive)" >> "$LOG"
SCRAPE_SOURCES=craigslist CL_ADAPTIVE=1 \
  npm run scrape:ci >> "$LOG" 2>&1
echo "[$(date '+%F %T')] done" >> "$LOG"
