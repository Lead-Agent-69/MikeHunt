-- Light-table retention for the Supabase Free tier (500 MB). One call, safe deletes only.
--
-- Listing rows are NOT handled here: scripts/scrape-ci.ts pruneStaleDeals() already demotes
-- active listings unseen 30 days (reversible) and deletes inactive ones unseen 90 days, never
-- touching a deal in watchlist / inventory / saved_cars / deal_outcomes / alert_matches.
-- Sold comps older than 180 days are already ignored by the sold median (SOLD_MEDIAN_WINDOW_DAYS).
--
-- This function prunes telemetry and queue history nothing user-facing reads after the window:
--   deal_signals   90 days, newest 2,000 per user   (recommendation signals)
--   page_views     180 days                         (aggregate route analytics)
--   deal_views     90 days                          (free-tier metering reads TODAY only)
--   scrape_jobs    14 days, finished jobs only      (pending / running are never touched)
--   scraper_runs   60 days                          (source_health reads the last 7 days)
-- scrape_runs (retired, shared with DealerHunt-PRO) is left alone. Missing tables are skipped.
-- Returns per-table delete counts. Service role only.

CREATE OR REPLACE FUNCTION public.run_retention() RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
  m INTEGER;
  result JSONB := '{}'::jsonb;
BEGIN
  IF to_regclass('public.deal_signals') IS NOT NULL THEN
    DELETE FROM public.deal_signals WHERE created_at < now() - interval '90 days';
    GET DIAGNOSTICS n = ROW_COUNT;
    DELETE FROM public.deal_signals s
     USING (
       SELECT id FROM (
         SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
           FROM public.deal_signals
       ) ranked WHERE ranked.rn > 2000
     ) extra
     WHERE s.id = extra.id;
    GET DIAGNOSTICS m = ROW_COUNT;
    result := result || jsonb_build_object('deal_signals', n + m);
  END IF;

  IF to_regclass('public.page_views') IS NOT NULL THEN
    DELETE FROM public.page_views WHERE viewed_at < now() - interval '180 days';
    GET DIAGNOSTICS n = ROW_COUNT;
    result := result || jsonb_build_object('page_views', n);
  END IF;

  IF to_regclass('public.deal_views') IS NOT NULL THEN
    DELETE FROM public.deal_views WHERE day < CURRENT_DATE - 90;
    GET DIAGNOSTICS n = ROW_COUNT;
    result := result || jsonb_build_object('deal_views', n);
  END IF;

  IF to_regclass('public.scrape_jobs') IS NOT NULL THEN
    DELETE FROM public.scrape_jobs
     WHERE status NOT IN ('pending', 'running')
       AND created_at < now() - interval '14 days';
    GET DIAGNOSTICS n = ROW_COUNT;
    result := result || jsonb_build_object('scrape_jobs', n);
  END IF;

  IF to_regclass('public.scraper_runs') IS NOT NULL THEN
    DELETE FROM public.scraper_runs
     WHERE status <> 'running'
       AND started_at < now() - interval '60 days';
    GET DIAGNOSTICS n = ROW_COUNT;
    result := result || jsonb_build_object('scraper_runs', n);
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.run_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_retention() TO service_role;
