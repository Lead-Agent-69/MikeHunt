-- fix(data): honest title data on deals.
--
-- 1) deals.condition DROP NOT NULL. The ingest pipeline used to default every unmapped condition
--    to 'run_drive' only because the column was NOT NULL, which made "unknown" look like a running,
--    clean-ish car. Unknown is now NULL; lib/deals/title-category treats NULL as "unknown".
--    Existing rows are NOT rewritten: a stored run_drive may be a real listing claim, and we cannot
--    tell it apart from the old default. Title provenance from here on lives in
--    deals.options->>'titleSource' ('listing' | 'source_default'; absent = not recorded).
--
-- 2) dealer_inventory() counted run_drive as a CLEAN title (ILIKE '%run_drive%'). It now buckets on
--    the exact listing_condition enum, matching lib/deals/title-category:
--      clean = clean_title, rebuilt = rebuilt_title, salvage = salvage_title, parts = parts_only;
--      everything else (run_drive, repairable, flood, fire, hail, NULL) is outside these columns.
--    Same signature + return type, so CREATE OR REPLACE keeps the existing ACL; the explicit
--    REVOKE/GRANT below matches 20261010030000 (service role only) either way.
--
-- Deploy order: apply this BEFORE the app/scraper code that writes NULL condition ships
-- (the Zeus local-cache upsert throws on a NOT NULL violation instead of salvaging rows).

BEGIN;

ALTER TABLE public.deals ALTER COLUMN condition DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.dealer_inventory()
RETURNS TABLE(host text, total bigint, clean bigint, rebuilt bigint, salvage bigint, parts bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '30s' AS $$
BEGIN
  RETURN QUERY
  SELECT
    x.host                                                       AS host,
    count(*)::bigint                                             AS total,
    count(*) FILTER (WHERE x.cond = 'clean_title')::bigint       AS clean,
    count(*) FILTER (WHERE x.cond = 'rebuilt_title')::bigint     AS rebuilt,
    count(*) FILTER (WHERE x.cond = 'salvage_title')::bigint     AS salvage,
    count(*) FILTER (WHERE x.cond = 'parts_only')::bigint        AS parts
  FROM (
    SELECT
      lower(split_part(regexp_replace(d.source_url, '^https?://(www\.)?', '', 'i'), '/', 1)) AS host,
      d.condition::text AS cond
    FROM public.deals d
    WHERE d.active AND d.source_url IS NOT NULL AND d.source_url <> ''
  ) x
  GROUP BY x.host
  ORDER BY total DESC, x.host;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dealer_inventory() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dealer_inventory() TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
