#!/bin/bash
# ─────────────────────────────────────────────────────────────
# scripts/rescore-all.sh
# Rescores every active deal via the /api/admin/rescore endpoint.
# Requires INGEST_SECRET environment variable to be set.
# Usage:
#   INGEST_SECRET=your_secret ./scripts/rescore-all.sh
#   Or set in .env.local and source it first.
# ─────────────────────────────────────────────────────────────

set -e

HOST="${HOST:-http://localhost:3000}"
SECRET="${INGEST_SECRET}"
PAGE_SIZE=100
MAX_PAGES=200  # Safety cap — 200 pages × 100 = 20,000 deals

if [ -z "$SECRET" ]; then
  echo "❌  INGEST_SECRET not set. Export it or run: source .env.local"
  exit 1
fi

echo "🔁  Starting rescore of all active deals..."
echo "    Host: $HOST"
echo "    Page size: $PAGE_SIZE"
echo ""

TOTAL_RESCORED=0

for PAGE in $(seq 0 $MAX_PAGES); do
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$HOST/api/admin/rescore" \
    -H "Authorization: Bearer $SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"page\": $PAGE, \"pageSize\": $PAGE_SIZE}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" != "200" ]; then
    echo "❌  HTTP $HTTP_CODE on page $PAGE — stopping."
    echo "    Response: $BODY"
    exit 1
  fi

  RESCORED=$(echo "$BODY" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('rescored', 0))" 2>/dev/null || echo 0)
  HAS_MORE=$(echo "$BODY" | python3 -c "import sys, json; d=json.load(sys.stdin); print(str(d.get('hasMore', False)).lower())" 2>/dev/null || echo "false")

  TOTAL_RESCORED=$((TOTAL_RESCORED + RESCORED))
  echo "  Page $PAGE → rescored $RESCORED deals (total: $TOTAL_RESCORED)"

  if [ "$HAS_MORE" = "false" ]; then
    echo ""
    echo "✅  Rescore complete! Total deals rescored: $TOTAL_RESCORED"
    break
  fi

  sleep 0.5
done
