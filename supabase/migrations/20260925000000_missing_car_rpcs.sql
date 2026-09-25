-- Three RPCs the app calls but that were never committed as migrations (applied ad-hoc to prod).
-- Committed here so a fresh rebuild works. Cars-only: landing_proof drops the housing counters
-- (homes_tracked / distressed / new_leads_24h) and reports a live state count instead of a hardcoded 50.
--
-- Call sites this must satisfy:
--   app/api/stats/proof/route.ts     landing_proof()          — one row of headline figures
--   app/api/dealer-network/route.ts  dealer_inventory()       — live title mix per source_url host
--   scripts/audit-data-quality.ts    find_duplicate_vins(n)   — active VINs listed more than once
--
-- DROP-then-CREATE because CREATE OR REPLACE cannot change a function's return type, and the ad-hoc
-- prod copies may predate these shapes.

DROP FUNCTION IF EXISTS public.landing_proof();
CREATE FUNCTION public.landing_proof()
RETURNS TABLE(
  cars_scored bigint,
  cars_buy bigint,
  avg_spread numeric,
  total_spread numeric,
  new_buys_7d bigint,
  states bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
BEGIN
  RETURN QUERY
  SELECT
    count(*)::bigint                                             AS cars_scored,
    count(*) FILTER (WHERE d.deal_verdict = 'go')::bigint        AS cars_buy,
    coalesce(avg(d.true_net_profit) FILTER (WHERE d.deal_verdict = 'go'), 0)::numeric AS avg_spread,
    coalesce(sum(d.true_net_profit) FILTER (WHERE d.deal_verdict = 'go'), 0)::numeric AS total_spread,
    count(*) FILTER (WHERE d.deal_verdict = 'go'
                       AND d.first_seen_at >= now() - interval '7 days')::bigint AS new_buys_7d,
    count(DISTINCT d.location_state)::bigint                     AS states
  FROM public.deals d
  WHERE d.active AND d.ask_price > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.landing_proof() TO anon, authenticated;

DROP FUNCTION IF EXISTS public.dealer_inventory();
CREATE FUNCTION public.dealer_inventory()
RETURNS TABLE(host text, total bigint, clean bigint, rebuilt bigint, salvage bigint, parts bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
BEGIN
  RETURN QUERY
  SELECT
    x.host                                                       AS host,
    count(*)::bigint                                             AS total,
    count(*) FILTER (WHERE x.title_class = 'clean')::bigint      AS clean,
    count(*) FILTER (WHERE x.title_class = 'rebuilt')::bigint    AS rebuilt,
    count(*) FILTER (WHERE x.title_class = 'salvage')::bigint    AS salvage,
    count(*) FILTER (WHERE x.title_class = 'parts')::bigint      AS parts
  FROM (
    SELECT
      lower(split_part(regexp_replace(d.source_url, '^https?://(www\.)?', '', 'i'), '/', 1)) AS host,
      -- mirrors titleClass() in lib/discovery/categorize.ts (salvage > rebuilt > parts > clean)
      CASE
        WHEN d.condition::text ILIKE '%salvage%' THEN 'salvage'
        WHEN d.condition::text ILIKE '%rebuilt%' THEN 'rebuilt'
        WHEN d.condition::text ILIKE '%parts%'   THEN 'parts'
        WHEN d.condition::text ILIKE '%clean%' OR d.condition::text ILIKE '%run_drive%' THEN 'clean'
        ELSE 'unknown'
      END AS title_class
    FROM public.deals d
    WHERE d.active AND d.source_url IS NOT NULL AND d.source_url <> ''
  ) x
  GROUP BY x.host
  ORDER BY total DESC, x.host;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dealer_inventory() TO anon, authenticated;

DROP FUNCTION IF EXISTS public.find_duplicate_vins(integer);
CREATE FUNCTION public.find_duplicate_vins(limit_count integer DEFAULT 10)
RETURNS TABLE(id uuid, vin text, count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
BEGIN
  RETURN QUERY
  SELECT
    min(d.id)          AS id,
    upper(d.vin)       AS vin,
    count(*)::bigint   AS count
  FROM public.deals d
  WHERE d.active AND d.vin IS NOT NULL AND d.vin <> ''
  GROUP BY upper(d.vin)
  HAVING count(*) > 1
  ORDER BY count(*) DESC, upper(d.vin)
  LIMIT limit_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_vins(integer) TO anon, authenticated;
