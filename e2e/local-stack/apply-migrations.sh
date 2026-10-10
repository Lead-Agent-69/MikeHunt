#!/bin/bash
# Apply repo migrations to the local DB with stand-in rewrites. Logs errors per file.
U=${DB_URL:-postgresql://postgres@127.0.0.1:55491/mikehunt}
: > "${LOG:-/tmp/mikehunt-migrate.log}"
for f in ${REPO:-$(git rev-parse --show-toplevel)}/supabase/migrations/*.sql; do
  sed -E -e 's/[Cc][Rr][Ee][Aa][Tt][Ee] [Ee][Xx][Tt][Ee][Nn][Ss][Ii][Oo][Nn] [Ii][Ff] [Nn][Oo][Tt] [Ee][Xx][Ii][Ss][Tt][Ss] "?(vector|postgis|pg_cron|pg_net)"?[^;]*;/-- (stub) &/g' \
      -e 's/(extensions\.)?vector\([0-9]+\)/float8[]/g' \
      -e 's/geography\(point, *4326\)/geography/gI' -e 's/extensions\.vector/float8[]/g' -e 's/(vector_cosine_ops|vector_l2_ops|vector_ip_ops)//g' "$f" > /tmp/mig.sql
  out=$(psql $U -q -X -f /tmp/mig.sql 2>&1 | grep -E "ERROR" | head -5)
  [ -n "$out" ] && printf "== %s\n%s\n" "$(basename $f)" "$out" >> "${LOG:-/tmp/mikehunt-migrate.log}"
done
echo "files with errors: $(grep -c "^==" "${LOG:-/tmp/mikehunt-migrate.log}")"
