#!/bin/sh
# Zeus disk janitor for the scraper cache volume (mounted at /cache in the janitor service).
# Safe deletes only, by explicit subdirectory and age. The top-level state files the scraper owns
# (local-scraper-cache.json, sweep-state.json, source-health.json, state-rotation.json) are never
# touched. Run once:  sh scripts/zeus-janitor.sh   Loop daily:  sh scripts/zeus-janitor.sh --loop
#
#   /cache/arsenal/*.json      probe reports            30 days
#   /cache/html/**             raw page cache           14 days
#   /cache/photos/**           photo cache (if any)     30 days
#   /cache/logs/**             scraper logs             30 days
#   /cache/*.tmp               interrupted writes        1 day
set -eu
ROOT="${JANITOR_ROOT:-/cache}"
INTERVAL_HOURS="${JANITOR_INTERVAL_HOURS:-24}"

prune() { # dir days pattern
  [ -d "$ROOT/$1" ] || return 0
  count=$(find "$ROOT/$1" -type f -name "$3" -mtime +"$2" -print -delete 2>/dev/null | wc -l | tr -d ' ')
  echo "[janitor] $1: removed $count files older than $2d"
  find "$ROOT/$1" -mindepth 1 -type d -empty -delete 2>/dev/null || true
}

run_once() {
  [ -d "$ROOT" ] || { echo "[janitor] $ROOT missing, nothing to do"; return 0; }
  prune arsenal 30 '*.json'
  prune html 14 '*'
  prune photos 30 '*'
  prune logs 30 '*'
  find "$ROOT" -maxdepth 1 -type f -name '*.tmp' -mtime +1 -print -delete 2>/dev/null | sed 's/^/[janitor] removed tmp /' || true
  du -sh "$ROOT" 2>/dev/null | sed 's/^/[janitor] cache size: /' || true
}

if [ "${1:-}" = "--loop" ]; then
  while true; do
    run_once
    sleep $((INTERVAL_HOURS * 3600))
  done
else
  run_once
fi
