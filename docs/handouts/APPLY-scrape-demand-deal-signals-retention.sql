-- =============================================================================
-- Jonah / Dashboard SQL — hosted project qupzqpezslsbobhugswp
-- =============================================================================
-- Open: https://supabase.com/dashboard/project/qupzqpezslsbobhugswp/sql/new
-- Paste this whole file (or apply sections that are still missing). Safe to re-run.
--
-- VERIFY scrape_demand (already looks LIVE via /api/scrape/health demandCoverage
-- with demanded>0 on 2026-10-07 — if verify fails, run §1):
--   select proname from pg_proc where proname = 'scrape_demand';
--   select * from public.scrape_demand(30) limit 5;
--
-- VERIFY deal_signals / run_retention (For You needs the table; cron needs the fn):
--   select to_regclass('public.deal_signals');
--   select proname from pg_proc where proname = 'run_retention';
--
-- Source paths in repo:
--   supabase/migrations/20261005060000_scrape_demand.sql
--   supabase/migrations/20261006010000_deal_signals.sql
--   supabase/migrations/20261006020000_run_retention.sql
-- =============================================================================

-- >>> §1 scrape_demand (20261005060000) >>>
-- scrape_demand: aggregated, PII-free demand signal for the Zeus scraper planner.
-- See docs/USER-DRIVEN-SCRAPING.md §3 (demand model) and §5 (scoring).
--
-- Returns one row per (state, zip3, kind) with a recency-weighted demand weight and a distinct user count.
-- No user ids, emails, cities or full ZIPs leave the function: only 2-letter state + 3-digit ZIP prefix.
--   home   : 3 * r   prefs.homeLocation (fallback carsState, then buyerScope.state)
--   search : 2 * r   prefs.searchLocations[] (fallback carsStates[] minus the home state when searchLocations
--                    was never set)
--   recent : 1 * e^(-age_days/3)   signed-in scrape_jobs in the last 7 days (scope.state / scope.states[])
-- where r = e^(-days_since_last_activity/14) and activity = greatest(last_sign_in_at, prefs updated_at),
-- limited to users active within p_active_days (clamped 1..90). Only the 50 states + DC are returned.
--
-- service_role only (the Docker scraper). Not exposed to anon/authenticated.
-- The scraper treats a missing function as "no demand" and falls back to plain state rotation, so this can
-- be applied to the hosted project independently of the scraper deploy.

CREATE OR REPLACE FUNCTION public.scrape_demand(p_active_days integer DEFAULT 30)
RETURNS TABLE(state text, zip3 text, kind text, weight double precision, users bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active AS (
    SELECT p.user_id,
           p.prefs,
           upper(trim(coalesce(nullif(p.prefs -> 'homeLocation' ->> 'state', ''),
                               nullif(p.prefs ->> 'carsState', ''),
                               nullif(p.prefs -> 'buyerScope' ->> 'state', '')))) AS home_state,
           exp(-extract(epoch FROM (now() - greatest(u.last_sign_in_at, p.updated_at))) / 86400.0 / 14.0) AS r
    FROM public.user_preferences p
    JOIN auth.users u ON u.id = p.user_id
    WHERE greatest(u.last_sign_in_at, p.updated_at)
          > now() - make_interval(days => greatest(1, least(coalesce(p_active_days, 30), 90)))
  ),
  home AS (
    SELECT a.user_id,
           a.r,
           a.home_state AS state,
           CASE WHEN (a.prefs -> 'homeLocation' ->> 'zip') ~ '^\d{5}$'
                THEN left(a.prefs -> 'homeLocation' ->> 'zip', 3) END AS zip3
    FROM active a
  ),
  search AS (
    SELECT a.user_id,
           a.r,
           upper(trim(loc ->> 'state')) AS state,
           CASE WHEN (loc ->> 'zip') ~ '^\d{5}$' THEN left(loc ->> 'zip', 3) END AS zip3
    FROM active a
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.prefs -> 'searchLocations') = 'array'
           THEN a.prefs -> 'searchLocations' ELSE '[]'::jsonb END) AS loc
    WHERE jsonb_typeof(loc) = 'object'
    UNION ALL
    SELECT a.user_id, a.r, upper(trim(s #>> '{}')), NULL
    FROM active a
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.prefs -> 'carsStates') = 'array'
           THEN a.prefs -> 'carsStates' ELSE '[]'::jsonb END) AS s
    WHERE jsonb_typeof(a.prefs -> 'searchLocations') IS DISTINCT FROM 'array'
      AND jsonb_typeof(s) = 'string'
      AND upper(trim(s #>> '{}')) IS DISTINCT FROM a.home_state
  ),
  recent AS (
    SELECT j.requested_by AS user_id,
           exp(-extract(epoch FROM (now() - j.created_at)) / 86400.0 / 3.0) AS r,
           upper(trim(x.st)) AS state
    FROM public.scrape_jobs j
    CROSS JOIN LATERAL (
      SELECT j.scope ->> 'state' AS st
      UNION
      SELECT e #>> '{}'
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(j.scope -> 'states') = 'array'
             THEN j.scope -> 'states' ELSE '[]'::jsonb END) AS e
      WHERE jsonb_typeof(e) = 'string'
    ) AS x
    WHERE j.requested_by IS NOT NULL
      AND j.created_at > now() - interval '7 days'
  ),
  weighted AS (
    SELECT h.state, h.zip3, 'home'::text AS kind, 3.0 * h.r AS w, h.user_id FROM home h
    UNION ALL
    SELECT s.state, s.zip3, 'search'::text, 2.0 * s.r, s.user_id FROM search s
    UNION ALL
    SELECT c.state, NULL::text, 'recent'::text, 1.0 * c.r, c.user_id FROM recent c
  )
  SELECT w.state,
         w.zip3,
         w.kind,
         round(sum(w.w)::numeric, 4)::double precision AS weight,
         count(DISTINCT w.user_id)::bigint AS users
  FROM weighted w
  WHERE w.state = ANY (ARRAY[
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
    'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI',
    'SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'])
  GROUP BY w.state, w.zip3, w.kind
  ORDER BY 4 DESC, 1, 3;
$$;

REVOKE ALL ON FUNCTION public.scrape_demand(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scrape_demand(integer) TO service_role;

-- >>> §2 deal_signals (20261006010000) >>>
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

-- >>> §3 run_retention (20261006020000) >>>
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
