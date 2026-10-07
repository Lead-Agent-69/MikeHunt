-- =============================================================================
-- Jonah / Dashboard: apply deal_signals + run_retention (hosted Supabase Free)
-- =============================================================================
-- WHY: For You / reco need public.deal_signals. Daily cron calls run_retention().
-- These migrations are in-repo but may still be unapplied on the hosted project
-- (no service-role apply token from agents — paste in the Dashboard SQL editor).
--
-- ONE-LINER (from repo root, copy/paste both files into Dashboard → SQL → New):
--   open supabase/migrations/20261006010000_deal_signals.sql
--   then supabase/migrations/20261006020000_run_retention.sql
-- Or run this combined file once in:
--   https://supabase.com/dashboard/project/qupzqpezslsbobhugswp/sql/new
--
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE). Service-role grants only.
-- After apply: For You stops returning signalsAvailable:false; retention cron works.
-- =============================================================================

-- >>> BEGIN 20261006010000_deal_signals.sql >>>
-- View signals for the recommendation loop (lib/intelligence/affinity.ts).
--
-- One compact row per signal: open, dwell, save, unsave, dismiss, interest_yes, interest_no. The
-- listing attributes are a SNAPSHOT (make/model/year/price/body/state/source/title class), so a
-- signal still teaches after the deal row is pruned by listing retention. No FK to deals on
-- purpose. No photos, no HTML, no free text.
--
-- Size: ~120 bytes/row + indexes. Raw rows are pruned after 90 days and capped at 2,000 per user
-- (prune_deal_signals below), so a heavy user costs well under 1 MB.
--
-- WRITE PATH: /api/reco/signal (signed-in only) with the service role. No insert policy for
-- anon/authenticated, so clients cannot forge another user's signals.
-- READ PATH: a user may read their own rows; the API reads with the service role.

CREATE TABLE IF NOT EXISTS public.deal_signals (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id     UUID,
  kind        TEXT NOT NULL CHECK (kind IN (
                'open', 'dwell', 'save', 'unsave', 'dismiss', 'interest_yes', 'interest_no')),
  dwell_ms    INTEGER CHECK (dwell_ms IS NULL OR (dwell_ms >= 0 AND dwell_ms <= 3600000)),
  make        TEXT CHECK (make IS NULL OR length(make) <= 40),
  model       TEXT CHECK (model IS NULL OR length(model) <= 60),
  year        SMALLINT,
  price       INTEGER,
  body        TEXT CHECK (body IS NULL OR length(body) <= 40),
  state       CHAR(2),
  source      TEXT CHECK (source IS NULL OR length(source) <= 40),
  title_class TEXT CHECK (title_class IS NULL OR length(title_class) <= 16),
  facet       TEXT CHECK (facet IS NULL OR length(facet) <= 100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_signals_user_created_idx
  ON public.deal_signals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_signals_created_idx
  ON public.deal_signals (created_at);

ALTER TABLE public.deal_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_signals_read_own" ON public.deal_signals;
CREATE POLICY "deal_signals_read_own" ON public.deal_signals
  FOR SELECT USING (user_id = auth.uid());

-- Retention: drop raw signals older than keep_days, then keep only the newest max_per_user rows
-- per user. Returns rows deleted. Service role only.
CREATE OR REPLACE FUNCTION public.prune_deal_signals(
  keep_days INTEGER DEFAULT 90,
  max_per_user INTEGER DEFAULT 2000
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  aged INTEGER := 0;
  capped INTEGER := 0;
BEGIN
  DELETE FROM public.deal_signals
   WHERE created_at < now() - make_interval(days => GREATEST(keep_days, 7));
  GET DIAGNOSTICS aged = ROW_COUNT;

  DELETE FROM public.deal_signals s
   USING (
     SELECT id FROM (
       SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
         FROM public.deal_signals
     ) ranked
     WHERE ranked.rn > GREATEST(max_per_user, 100)
   ) extra
   WHERE s.id = extra.id;
  GET DIAGNOSTICS capped = ROW_COUNT;

  RETURN aged + capped;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_deal_signals(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_deal_signals(INTEGER, INTEGER) TO service_role;

COMMENT ON TABLE public.deal_signals IS
  'Compact per-user view signals for recommendations. Snapshot attrs, no FK to deals. Service-role writes; pruned at 90d / 2000 rows per user by prune_deal_signals().';

-- >>> BEGIN 20261006020000_run_retention.sql >>>
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
