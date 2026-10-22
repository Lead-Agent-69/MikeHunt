-- Refresh user-critical markets before broad discovery without exposing account data.
-- The worker receives the same aggregate state/ZIP3 contract as before; saved rows,
-- watchlist rows and active saved searches only add weighted demand signals.

CREATE OR REPLACE FUNCTION public.scrape_demand(p_active_days integer DEFAULT 30)
RETURNS TABLE(state text, zip3 text, kind text, weight double precision, users bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
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
  saved AS (
    SELECT DISTINCT
           a.user_id,
           a.r,
           upper(trim(coalesce(nullif(d.location_state, ''),
                               nullif(sc.snapshot ->> 'locationState', ''),
                               nullif(sc.snapshot ->> 'location_state', '')))) AS state,
           CASE WHEN d.location_zip ~ '^\d{5}$' THEN left(d.location_zip, 3) END AS zip3
    FROM active a
    JOIN public.saved_cars sc ON sc.user_id = a.user_id
    LEFT JOIN public.deals d ON d.id = sc.deal_id
    WHERE sc.status IN ('active', 'watching', 'price_drop', 'price_increase', 'ending_soon')
  ),
  watched AS (
    SELECT DISTINCT
           a.user_id,
           a.r,
           upper(trim(d.location_state)) AS state,
           CASE WHEN d.location_zip ~ '^\d{5}$' THEN left(d.location_zip, 3) END AS zip3
    FROM active a
    JOIN public.watchlist w ON w.user_id = a.user_id
    JOIN public.deals d ON d.id = w.deal_id
  ),
  saved_search AS (
    SELECT DISTINCT
           a.user_id,
           a.r,
           upper(trim(ss.state)) AS state,
           NULL::text AS zip3
    FROM active a
    JOIN public.user_saved_searches ss ON ss.user_id = a.user_id
    WHERE ss.is_active = true
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
    SELECT s.state, s.zip3, 'saved'::text, 8.0 * s.r, s.user_id FROM saved s
    UNION ALL
    SELECT w.state, w.zip3, 'watchlist'::text, 8.0 * w.r, w.user_id FROM watched w
    UNION ALL
    SELECT ss.state, ss.zip3, 'saved_search'::text, 5.0 * ss.r, ss.user_id FROM saved_search ss
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

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.scrape_demand(integer)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.scrape_demand(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'scrape_demand must remain service-role only';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.scrape_demand(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'scrape_demand service-role grant missing';
  END IF;
END $$;
