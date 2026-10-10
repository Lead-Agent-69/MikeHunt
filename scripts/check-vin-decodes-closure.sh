#!/usr/bin/env bash
# Run the planted must-fail / must-pass cases for 20261010421000_vin_decodes_closure_check against a
# throwaway database on a LOCAL Postgres (17+ for the MAINTAIN cases). Never point this at hosted.
#   PGHOST=/tmp PGPORT=55471 PGUSER=postgres scripts/check-vin-decodes-closure.sh
set -uo pipefail
cd "$(dirname "$0")/.."
DB=vin_closure_$$
P=(psql -X -q -v ON_ERROR_STOP=1)
"${P[@]}" -d postgres -c "CREATE DATABASE $DB" >/dev/null || exit 2
trap '"${P[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null' EXIT
"${P[@]}" -d "$DB" >/dev/null 2>&1 <<'SQL' || { echo "setup failed"; exit 2; }
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
-- Supabase-like defaults: new tables/views are granted to the client roles, functions to PUBLIC.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
SQL
for f in 20260623050000_vin_decodes 20260623060000_vin_decodes_specs 20261010420000_vin_decodes_server_only; do
  "${P[@]}" -d "$DB" -f "supabase/migrations/$f.sql" >/dev/null 2>&1 || { echo "setup: $f failed"; exit 2; }
done
CHECK=supabase/migrations/20261010421000_vin_decodes_closure_check.sql
fail=0
for t in supabase/tests/vin_decodes_closure/*.sql; do
  name=$(basename "$t" .sql)
  out=$( { echo "BEGIN;"; cat "$t"; cat "$CHECK"; echo "ROLLBACK;"; } | "${P[@]}" -d "$DB" 2>&1 )
  rc=$?
  case "$name" in
    must_fail_*) if [ $rc -ne 0 ] && echo "$out" | grep -q "ERROR:.*\(-able\|executable\)"; then echo "ok   $name: $(echo "$out" | grep -o 'ERROR:.*' | head -1)"; else echo "FAIL $name: check passed or failed for the wrong reason: $out"; fail=1; fi ;;
    must_pass_*) if [ $rc -eq 0 ]; then echo "ok   $name"; else echo "FAIL $name: $out"; fail=1; fi ;;
  esac
done
exit $fail
