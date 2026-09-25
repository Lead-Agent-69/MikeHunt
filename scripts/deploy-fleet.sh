#!/usr/bin/env bash
set -e

echo "Deploying DealerHunt Scraper Fleet to Fly.io..."

# Ensure we have the required environment variables in the environment or .env.local
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment or .env.local"
  exit 1
fi

echo "1. Setting secrets on Fly..."
fly secrets set \
  NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  ENABLE_HEADED_SCRAPERS="1" \
  SCRAPE_INTERVAL_MS="1800000"

echo "2. Deploying machines..."
fly deploy --ha=false

echo "3. Scaling out the fleet..."
# Scale out to 3 regions for distinct IPs
fly scale count 3 --region iad,ord,sjc --yes || echo "Could not scale (ensure you have scaled memory if required)"

echo "Deployment complete! The fleet is now running."
