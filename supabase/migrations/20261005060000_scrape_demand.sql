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
