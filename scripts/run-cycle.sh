#!/usr/bin/env bash
# DealerHunt — self-updating scrape cycle (git-bash / WSL / macOS / Linux).
# Schedule this (cron / Task Scheduler every ~30 min). It pulls latest code, installs any new deps,
# then runs one scrape cycle — so parser fixes deploy themselves without remoting into the box.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

echo "[$(date)] Pulling latest code..."
git pull --rebase --autostash origin main || echo "pull skipped (local changes/conflict) — running existing code"

echo "[$(date)] Installing deps (fast when unchanged)..."
npm install --no-audit --no-fund --silent || true

echo "[$(date)] Running scrape cycle..."
npm run scrape:ci

echo "[$(date)] Cycle done."
