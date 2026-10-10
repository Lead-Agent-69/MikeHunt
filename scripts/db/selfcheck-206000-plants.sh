#!/bin/bash
# Planted cases for 20261010206000_scraper_reliability_selfcheck (Ren #309 P2-3, P7).
# Runs each plant inside a rolled-back transaction against a scratch Postgres that already has
# 200000 + 205000 applied, and prints what the 205000 and 206000 self-checks say.
# Usage: PGURL=postgres://postgres@/postgres?host=/tmp&port=55499 scripts/db/selfcheck-206000-plants.sh
# NEVER point this at hosted: it is for a scratch database only.
set -u
: "${PGURL:?set PGURL to a scratch database}"
cd "$(dirname "$0")/../.."
tmp=$(mktemp)
run() {
  local name=$1 plant=$2 m out
  for m in 205000_scraper_reliability_hardening 206000_scraper_reliability_selfcheck; do
    sed '/^BEGIN;$/d;/^COMMIT;$/d' "supabase/migrations/20261010${m}.sql" > "$tmp"
    out=$(printf 'BEGIN;\n%s\n\\i %s\nROLLBACK;\n' "$plant" "$tmp" |
      psql "$PGURL" -v ON_ERROR_STOP=1 -q 2>&1 | grep -oE 'self-check.*(passed|failed:.*)|ERROR:.*' | head -1)
    echo "[$name] ${m%%_*}: ${out:-<no output>}"
  done
}
run col-select        "GRANT SELECT (message) ON public.scraper_errors TO anon;"
run col-update-public "GRANT UPDATE (reason) ON public.scraper_dead_letters TO PUBLIC;"
run maintain          "GRANT MAINTAIN ON public.scraper_alerts TO authenticated;"
run invoker-on        "ALTER VIEW public.source_health_sla SET (security_invoker = on);"
run invoker-1         "ALTER VIEW public.source_health_sla SET (security_invoker = 1);"
run invoker-YES       "ALTER VIEW public.source_health_sla SET (security_invoker = 'YES');"
run invoker-false     "ALTER VIEW public.source_health_sla SET (security_invoker = false);"
run view-missing      "DROP VIEW public.source_health_sla;"
run clean             ""
rm -f "$tmp"
