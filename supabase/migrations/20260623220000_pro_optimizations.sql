-- Supabase Pro Optimizations: Partial Indexes & pg_cron

-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Partial index for the main scan feed (only indexes active, high-profit "go" deals)
CREATE INDEX IF NOT EXISTS idx_deals_active_go 
ON public.deals (profit_score DESC) 
WHERE active = true AND deal_verdict = 'go';

-- 2. Partial index for active listings (avoids scanning dead stock for general active queries)
CREATE INDEX IF NOT EXISTS idx_deals_active_only
ON public.deals (created_at DESC)
WHERE active = true;

-- 3. Schedule a nightly job at 4:00 AM to hard-delete deals that have been dead for 30+ days
-- This runs natively in the Postgres engine, completely independent of the Node backend.
SELECT cron.schedule(
  'cleanup-dead-deals',
  '0 4 * * *',
  $$ DELETE FROM public.deals WHERE active = false AND updated_at < NOW() - INTERVAL '30 days' $$
);
